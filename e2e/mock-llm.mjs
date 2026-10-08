// E2E 剧本服务：OpenAI 兼容 chat/completions（dsh 0.1.5）与 DeepSeek Messages API
// （dsh 0.2.0 起 Anthropic 风格 SSE）双线协议的 mock（C-045、T-159）。
//
// 按用户消息中的 `e2e:<剧本名>` 关键词选择预编排剧本，在隔离测试环境中
// 确定性制造会话活动：
//   e2e:slow  —— 慢速流式输出（约 24 块 × 150ms），会话保持运行中数秒
//   e2e:ask      —— 单问题 ask_user_question 工具调用，回合转入待回复
//   e2e:multiask —— 多问题 ask_user_question 工具调用，回合转入待回复
//   e2e:runtime  —— 较慢的 ask_user_question 工具调用；回答后转入 slow 流式输出
//   e2e:error   —— 返回非重试型 HTTP 400，回合以稳定错误结束
//   e2e:job     —— bash 工具 run_in_background 启动真后台任务，随后 job_output 读取一次，
//                  任务输出文本到达后 fast 收口（引擎真实执行，验证后台任务全链路）
//   e2e:fast    —— 立即完成（默认剧本，关键词缺省时同样走这里）
// 普通 tool 结果后续请求以短文本 stop 收口；runtime 的 tool 结果进入 slow。
//
// 用法：`node e2e/mock-llm.mjs`（监听 127.0.0.1 随机端口，就绪后向 stdout
// 打印一行 JSON {"url": "http://127.0.0.1:<port>/v1"}）；或被 boot.mjs
// import 调用 startMockLlm()。
import { MOCK_ERROR_MESSAGE, MOCK_FAST_REPLY } from "./helpers.mjs";

import http from "node:http";

const SLOW_CHUNKS = 24;
const SLOW_INTERVAL_MS = 150;

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

/** OpenAI chat/completions 形状的剧本输入文本抽取。 */
function scenarioTexts(body) {
	const messages = body.messages ?? [];
	return {
		toolTexts: messages.filter((m) => m?.role === "tool").map(messageText),
		userTexts: messages.filter((m) => m?.role === "user").map(messageText),
	};
}

/** Messages API 形状的剧本输入文本抽取：工具结果以 user 消息的 tool_result 块回传。 */
function messagesScenarioTexts(body) {
	const userTexts = [];
	const toolTexts = [];
	for (const message of body.messages ?? []) {
		const blocks = Array.isArray(message?.content) ? message.content : [];
		for (const block of blocks) {
			if (block?.type === "text" && typeof block.text === "string" && message?.role === "user") {
				userTexts.push(block.text);
			}
			if (block?.type === "tool_result") {
				const parts = Array.isArray(block.content) ? block.content : [block.content];
				for (const part of parts) {
					const text = typeof part === "string" ? part : part?.text;
					if (typeof text === "string") toolTexts.push(text);
				}
			}
		}
	}
	return { toolTexts, userTexts };
}

/** 按剧本输入文本选路；runtime 的 tool 结果转入 slow，其余 tool 结果 fast 收口。
 *  关键词取最后一条带 `e2e:` 前缀的用户消息——主回合的 wire 消息里
 *  上下文注入可能排在用户正文之后，不能只看末条用户消息。 */
function pickScenario({ toolTexts, userTexts }) {
	if (toolTexts.some((text) => text.includes("e2e-job-tick"))) return "fast";
	if (toolTexts.some((text) => text.includes("background job"))) return "jobread";
	const runtime = userTexts.some((text) => text.includes("e2e:runtime"));
	if (toolTexts.length > 0) return runtime ? "slow" : "fast";
	for (let i = userTexts.length - 1; i >= 0; i -= 1) {
		const match = userTexts[i].match(/e2e:(slow|multiask|ask|runtime|error|fast|job)/);
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

const MULTI_ASK_QUESTION_ARGUMENTS = JSON.stringify({
	questions: [
		{ id: "e2e-q1", question: "E2E 多问第一题？", options: [{ label: "甲", description: "选择甲" }] },
		{ id: "e2e-q2", question: "E2E 多问第二题？", options: [{ label: "乙", description: "选择乙" }] },
	],
});

/** 慢速流式剧本：分块吐文本，让会话保持运行数秒。客户端中途断开（响应流关闭）即停止。 */
async function playSlow(res, model, streamLog = []) {
	for (let i = 1; i <= SLOW_CHUNKS; i += 1) {
		if (res.destroyed || res.writableEnded) return;
		send(res, chunk(model, { role: i === 1 ? "assistant" : undefined, content: `慢速输出片段 ${i}/${SLOW_CHUNKS}。\n` }));
		streamLog.push(i);
		await sleep(SLOW_INTERVAL_MS);
	}
	if (res.destroyed || res.writableEnded) return;
	send(res, chunk(model, {}, "stop"));
	send(res, usageChunk(model, SLOW_CHUNKS * 6));
	res.write("data: [DONE]\n\n");
	res.end();
}

/** 待回复剧本：ask_user_question 工具调用后收尾，回合等待用户行动。 */
async function playAsk(res, model, fragmentDelayMs = 20, args = ASK_QUESTION_ARGUMENTS) {
	send(res, chunk(model, { role: "assistant", content: "需要先确认问题。\n" }));
	const argFragments = [args.slice(0, 40), args.slice(40)];
	const deltas = [
		{ index: 0, id: "call_e2e_ask", type: "function", function: { name: "ask_user_question", arguments: argFragments[0] } },
		{ index: 0, function: { arguments: argFragments[1] } },
	];
	for (const delta of deltas) {
		send(res, chunk(model, { tool_calls: [delta] }));
		await sleep(fragmentDelayMs);
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

/** 后台任务剧本首轮：bash 工具 run_in_background 启动真后台任务（先 echo 探针行再长睡，
 *  保证 job_output 首次读取即有输出）。 */
async function playJobStart(res, model) {
	send(res, chunk(model, { role: "assistant", content: "启动后台探针任务。\n" }));
	const args = JSON.stringify({
		command: "echo e2e-job-tick-start; for i in $(seq 1 60); do echo e2e-job-tick $i; sleep 1; done",
		description: "E2E 后台任务探针",
		run_in_background: true,
	});
	const deltas = [
		{ index: 0, id: "call_e2e_job", type: "function", function: { name: "bash", arguments: args.slice(0, 80) } },
		{ index: 0, function: { arguments: args.slice(80) } },
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

/** 后台任务剧本读轮：从最近 tool 结果文本提取动态 job id，发起 job_output 读取。 */
async function playJobRead(res, model, messages) {
	let jobId = null;
	for (let i = messages.length - 1; i >= 0 && jobId === null; i -= 1) {
		if (messages[i]?.role !== "tool") continue;
		const match = messageText(messages[i]).match(/background job (bash-\d+)/);
		if (match) jobId = match[1];
	}
	send(res, chunk(model, { role: "assistant", content: "读取后台任务输出。\n" }));
	const deltas = [
		{ index: 0, id: "call_e2e_jobout", type: "function", function: { name: "job_output", arguments: JSON.stringify({ job_id: jobId ?? "bash-0" }) } },
	];
	for (const delta of deltas) {
		send(res, chunk(model, { tool_calls: [delta] }));
		await sleep(20);
	}
	send(res, chunk(model, {}, "tool_calls"));
	send(res, usageChunk(model, 16));
	res.write("data: [DONE]\n\n");
	res.end();
}

const SCENARIOS = {
	slow: playSlow,
	ask: playAsk,
	multiask: (res, model) => playAsk(res, model, 20, MULTI_ASK_QUESTION_ARGUMENTS),
	runtime: playAsk,
	error: playError,
	fast: playFast,
	job: playJobStart,
	jobread: (res, model, messages) => playJobRead(res, model, messages),
};

// ---- Messages API 引擎（dsh 0.2.0 起 DeepSeek provider 走 Anthropic 风格
// `${baseURL}/messages` SSE：message_start → content_block_* → message_delta →
// message_stop；tool 调用为 tool_use 块 + input_json_delta 增量，stop_reason
// 'tool_use'；工具结果以 user 消息 tool_result 块回传）。标题生成请求与普通
// 请求同路：其 user 消息 JSON 数组内含会话用户文本，通用选路照常命中剧本，
// 与 0.1.5 的「标题 = 剧本回复」语义一致（e2e spec 按此断言卡标题）。----

/** 把一个 JSON 负载作为一条 Messages SSE data 帧写出（与旧引擎 send 同帧格式）。 */
function sendEvent(res, payload) {
	res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** 一段文本块的完整生命周期（start → 单条 delta → stop）。 */
function playTextBlock(res, index, text) {
	sendEvent(res, { type: "content_block_start", index, content_block: { type: "text", text: "" } });
	sendEvent(res, { type: "content_block_delta", index, delta: { type: "text_delta", text } });
	sendEvent(res, { type: "content_block_stop", index });
}

/** 一个 tool_use 块：input 以 input_json_delta 分片增量装配（引擎按 JSON 累积）。 */
async function playToolBlock(res, index, id, name, argsJson, fragmentDelayMs = 20) {
	sendEvent(res, { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } });
	for (let offset = 0; offset < argsJson.length; offset += 60) {
		sendEvent(res, { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: argsJson.slice(offset, offset + 60) } });
		await sleep(fragmentDelayMs);
	}
	sendEvent(res, { type: "content_block_stop", index });
}

/** Messages 收口：message_delta（stop_reason + output usage）→ message_stop。 */
function settleMessage(res, outputTokens, stopReason = "end_turn") {
	sendEvent(res, { type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: outputTokens } });
	sendEvent(res, { type: "message_stop" });
}

/** Messages 剧本开场：message_start 携带输入 usage。 */
function beginMessage(res) {
	sendEvent(res, { type: "message_start", message: { usage: { input_tokens: 128, output_tokens: 1 } } });
}

async function playMessagesFast(res, model) {
	beginMessage(res);
	playTextBlock(res, 0, `${MOCK_FAST_REPLY}\n`);
	settleMessage(res, 6);
	res.end();
}

async function playMessagesSlow(res, model, streamLog = []) {
	beginMessage(res);
	sendEvent(res, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
	for (let i = 1; i <= SLOW_CHUNKS; i += 1) {
		if (res.destroyed || res.writableEnded) return;
		sendEvent(res, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `慢速输出片段 ${i}/${SLOW_CHUNKS}。\n` } });
		streamLog.push(i);
		await sleep(SLOW_INTERVAL_MS);
	}
	if (res.destroyed || res.writableEnded) return;
	sendEvent(res, { type: "content_block_stop", index: 0 });
	settleMessage(res, SLOW_CHUNKS * 6);
	res.end();
}

async function playMessagesAsk(res, model, fragmentDelayMs = 20, args = ASK_QUESTION_ARGUMENTS) {
	beginMessage(res);
	playTextBlock(res, 0, "需要先确认问题。\n");
	await playToolBlock(res, 1, "call_e2e_ask", "ask_user_question", args, fragmentDelayMs);
	settleMessage(res, 24, "tool_use");
	res.end();
}

async function playMessagesJobStart(res, model) {
	beginMessage(res);
	playTextBlock(res, 0, "启动后台探针任务。\n");
	const args = JSON.stringify({
		command: "echo e2e-job-tick-start; for i in $(seq 1 60); do echo e2e-job-tick $i; sleep 1; done",
		description: "E2E 后台任务探针",
		run_in_background: true,
	});
	await playToolBlock(res, 1, "call_e2e_job", "bash", args, 20);
	settleMessage(res, 24, "tool_use");
	res.end();
}

async function playMessagesJobRead(res, model, messages) {
	let jobId = null;
	for (const message of messages ?? []) {
		if (jobId !== null) break;
		const blocks = Array.isArray(message?.content) ? message.content : [];
		for (const block of blocks) {
			if (block?.type !== "tool_result") continue;
			const parts = Array.isArray(block.content) ? block.content : [block.content];
			for (const part of parts) {
				const text = typeof part === "string" ? part : part?.text ?? "";
				const match = String(text).match(/background job (bash-\d+)/);
				if (match) jobId = match[1];
			}
		}
	}
	beginMessage(res);
	playTextBlock(res, 0, "读取后台任务输出。\n");
	await playToolBlock(res, 1, "call_e2e_jobout", "job_output", JSON.stringify({ job_id: jobId ?? "bash-0" }), 20);
	settleMessage(res, 16, "tool_use");
	res.end();
}

const MESSAGES_SCENARIOS = {
	slow: playMessagesSlow,
	ask: playMessagesAsk,
	multiask: (res, model) => playMessagesAsk(res, model, 20, MULTI_ASK_QUESTION_ARGUMENTS),
	runtime: playMessagesAsk,
	error: playError,
	fast: playMessagesFast,
	job: playMessagesJobStart,
	jobread: (res, model, messages) => playMessagesJobRead(res, model, messages),
};

/**
 * 启动 mock LLM 服务。
 * @returns Promise<{ url, port, scenarioLog, streamLog, close }>；scenarioLog 记录命中剧本，streamLog 记录 slow 已发送块。
 */
export async function startMockLlm() {
	const scenarioLog = [];
	const streamLog = [];
	const server = http.createServer((req, res) => {
		const isChat = req.method === "POST" && req.url.endsWith("/chat/completions");
		const isMessages = req.method === "POST" && req.url.endsWith("/messages");
		if (!isChat && !isMessages) {
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
			const scenario = pickScenario(isChat ? scenarioTexts(body) : messagesScenarioTexts(body));
			scenarioLog.push(scenario);
			if (scenario !== "error") {
				res.writeHead(200, {
					"content-type": "text/event-stream",
					"cache-control": "no-cache",
					connection: "keep-alive",
				});
			}
			try {
				const model = body.model ?? "e2e-mock";
				if (isChat) {
					await (scenario === "slow"
						? playSlow(res, model, streamLog)
						: scenario === "jobread"
							? SCENARIOS.jobread(res, model, body.messages ?? [])
							: SCENARIOS[scenario](res, model));
				} else {
					await (scenario === "slow"
						? playMessagesSlow(res, model, streamLog)
						: scenario === "jobread"
							? MESSAGES_SCENARIOS.jobread(res, model, body.messages ?? [])
							: MESSAGES_SCENARIOS[scenario](res, model));
				}
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
		streamLog,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const mock = await startMockLlm();
	console.log(JSON.stringify({ url: mock.url }));
}
