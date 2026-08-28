// E2E 剧本服务：OpenAI 兼容 chat/completions 的 SSE mock（C-045）。
//
// 按用户消息中的 `e2e:<剧本名>` 关键词选择预编排剧本，在隔离测试环境中
// 确定性制造会话活动：
//   e2e:slow  —— 慢速流式输出（约 24 块 × 150ms），会话保持运行中数秒
//   e2e:ask   —— ask_user_question 工具调用，回合转入待回复
//   e2e:error —— 返回非重试型 HTTP 400，回合以稳定错误结束
//   e2e:fast  —— 立即完成（默认剧本，关键词缺省时同样走这里）
// 含 tool 结果（role: tool）的后续请求统一以短文本 stop 收口。
//
// 用法：`node e2e/mock-llm.mjs`（监听 127.0.0.1 随机端口，就绪后向 stdout
// 打印一行 JSON {"url": "http://127.0.0.1:<port>/v1"}）；或被 boot.mjs
// import 调用 startMockLlm()。
import { MOCK_FAST_REPLY } from "./helpers.mjs";

import http from "node:http";

const SLOW_CHUNKS = 24;
const SLOW_INTERVAL_MS = 150;
export const MOCK_ERROR_MESSAGE = "E2E 模型故障探针";

/** 取消息文本（字符串或内容分片数组）。 */
function messageText(msg) {
	if (typeof msg?.content === "string") return msg.content;
	if (Array.isArray(msg?.content)) {
		return msg.content
			.filter((part) => part?.type === "text" || part?.kind === "text")
			.map((part) => part.text ?? "")
			.join("\n");
	}
	return "";
}

/** 按用户文本选择剧本；含 tool 结果的回合一律 fast 收口。
 *  关键词取最后一条带 `e2e:` 前缀的用户消息——主回合的 wire 消息里
 *  上下文注入可能排在用户正文之后，不能只看末条用户消息。 */
function pickScenario(body) {
	const hasToolResult = (body.messages ?? []).some((m) => m?.role === "tool");
	if (hasToolResult) return "fast";
	const userTexts = (body.messages ?? []).filter((m) => m?.role === "user").map(messageText);
	for (let i = userTexts.length - 1; i >= 0; i -= 1) {
		const match = userTexts[i].match(/e2e:(slow|ask|error|fast)/);
		if (match) return match[1];
	}
	return "fast";
}

function chunk(model, delta, finishReason = null) {
	return {
		id: "e2e-mock",
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta, finish_reason: finishReason }],
	};
}

function usageChunk(model, outputTokens) {
	return {
		id: "e2e-mock",
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [],
		usage: { prompt_tokens: 128, completion_tokens: outputTokens },
	};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 把一个 JSON 负载作为一条 SSE data 事件写出。 */
function send(res, payload) {
	res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const ASK_QUESTION_ARGUMENTS = JSON.stringify({
	questions: [
		{
			id: "e2e-q1",
			question: "E2E 探针问题：是否继续？",
			options: [
				{ label: "继续", description: "确认继续执行" },
				{ label: "停止", description: "停止当前任务" },
			],
		},
	],
});

/** 慢速流式剧本：分块吐文本，让会话保持运行数秒。客户端中途断开（响应流关闭）即停止。 */
async function playSlow(res, model) {
	for (let i = 1; i <= SLOW_CHUNKS; i += 1) {
		if (res.writableEnded) return;
		send(res, chunk(model, { role: i === 1 ? "assistant" : undefined, content: `慢速输出片段 ${i}/${SLOW_CHUNKS}。\n` }));
		await sleep(SLOW_INTERVAL_MS);
	}
	send(res, chunk(model, {}, "stop"));
	send(res, usageChunk(model, SLOW_CHUNKS * 6));
	res.write("data: [DONE]\n\n");
	res.end();
}

/** 待回复剧本：ask_user_question 工具调用后收尾，回合等待用户行动。 */
async function playAsk(res, model) {
	send(res, chunk(model, { role: "assistant", content: "需要先确认一个问题。\n" }));
	const argFragments = [ASK_QUESTION_ARGUMENTS.slice(0, 40), ASK_QUESTION_ARGUMENTS.slice(40)];
	const deltas = [
		{ index: 0, id: "call_e2e_ask", type: "function", function: { name: "ask_user_question", arguments: argFragments[0] } },
		{ index: 0, function: { arguments: argFragments[1] } },
	];
	for (const delta of deltas) {
		send(res, chunk(model, { tool_calls: [delta] }));
		await sleep(20);
	}
	send(res, chunk(model, {}, "tool_calls"));
	send(res, usageChunk(model, 24));
	res.write("data: [DONE]\n\n");
	res.end();
}

/** 不可恢复错误剧本：HTTP 400 使 Agent 回合以稳定 provider error 结束。 */
function playError(res) {
	res.writeHead(400, { "content-type": "application/json" });
	res.end(JSON.stringify({
		error: { message: MOCK_ERROR_MESSAGE, type: "invalid_request_error", code: "e2e_failure" },
	}));
}

/** 立即完成剧本：短文本直接 stop。 */
async function playFast(res, model) {
	send(res, chunk(model, { role: "assistant", content: `${MOCK_FAST_REPLY}\n` }));
	send(res, chunk(model, {}, "stop"));
	send(res, usageChunk(model, 6));
	res.write("data: [DONE]\n\n");
	res.end();
}

const SCENARIOS = { slow: playSlow, ask: playAsk, fast: playFast };

/**
 * 启动 mock LLM 服务。
 * @returns Promise<{ url, port, scenarioLog, close }>；scenarioLog 记录每次命中的剧本名（按请求顺序）。
 */
export async function startMockLlm() {
	const scenarioLog = [];
	const server = http.createServer((req, res) => {
		if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
			res.writeHead(404).end("not found");
			return;
		}
		let raw = "";
		req.on("data", (data) => (raw += data));
		req.on("end", async () => {
			let body;
			try {
				body = JSON.parse(raw);
			} catch {
				res.writeHead(400).end("bad json");
				return;
			}
			const scenario = pickScenario(body);
			scenarioLog.push(scenario);
			if (scenario === "error") {
				playError(res);
				return;
			}
			res.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
				connection: "keep-alive",
			});
			try {
				await SCENARIOS[scenario](res, body.model ?? "e2e-mock");
			} catch {
				res.end();
			}
		});
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	return {
		port,
		url: `http://127.0.0.1:${port}/v1`,
		scenarioLog,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const mock = await startMockLlm();
	console.log(JSON.stringify({ url: mock.url }));
}
