// T-017 渲染归一化性能基线：合成快照驱动核心纯函数，对比改动前后单次渲染成本。
// 用法: node scripts/bench.mjs [iterations]
// 两种工况：steady（快照引用不变，memo 命中，对应 1s 时钟 tick）；
//           push（每次渲染替换一个运行会话快照，memo 未命中，对应流式推送）。
import {
	buildEntries,
	buildRecent,
	cardSignature,
	conversationTimeline,
	messagePreviews,
} from "../src/core.mjs";

const iterations = Number(process.argv[2]) || 200;

function makeChatNodes(count) {
	const order = [];
	const nodes = new Map();
	for (let i = 0; i < count; i += 1) {
		const key = `node:${i}`;
		order.push(key);
		const kind = i % 5 === 0 ? "user" : i % 5 === 1 ? "assistant-step" : i % 5 === 2 ? "tool-call" : i % 5 === 3 ? "assistant-step" : "context";
		if (kind === "user") {
			nodes.set(key, { key, kind: "user", visibility: "visible", data: { content: [{ type: "text", text: `用户消息 ${i}\n第二行` }] } });
		} else if (kind === "assistant-step") {
			nodes.set(key, { key, kind: "assistant-step", visibility: "visible", data: { turn: i, step: 0, status: "done", blocks: [{ kind: "text", text: `回复 ${i}\n详情` }] } });
		} else if (kind === "tool-call") {
			nodes.set(key, { key, kind: "tool-call", visibility: "visible", data: { root: { kind: "tool-result", callId: `call:${i}`, call: { name: "read", argsRaw: JSON.stringify({ file_path: `/tmp/f${i}` }) }, time: i * 10 + 5, callTime: i * 10, isError: false } } });
		} else {
			nodes.set(key, { key, kind: "context", visibility: "visible", data: { content: [{ type: "text", text: `上下文 ${i}` }] } });
		}
	}
	return { order, nodes };
}

function makeSessionSnapshot(chatSize) {
	const chat = makeChatNodes(chatSize);
	return {
		chat,
		partial: null,
		runningCalls: [],
	};
}

const CHAT_SIZE = 2000;
const RUNNING = 3;
const RECENT = 20;

const byId = {};
const ids = [];
for (let i = 0; i < RUNNING; i += 1) {
	byId[`run:${i}`] = { id: `run:${i}`, displayTitle: `运行${i}`, running: true, updatedAt: Date.now() };
	ids.push(`run:${i}`);
}
for (let i = 0; i < RECENT; i += 1) {
	byId[`cold:${i}`] = { id: `cold:${i}`, displayTitle: `历史${i}`, running: false, blank: false, updatedAt: Date.now() - (i + 1) * 3_600_000 };
	ids.push(`cold:${i}`);
}
const listSnapshot = { ids, byId, current: "run:0" };

const detailsById = new Map();
for (let i = 0; i < RUNNING; i += 1) detailsById.set(`run:${i}`, { snapshot: makeSessionSnapshot(CHAT_SIZE) });
for (let i = 0; i < RECENT; i += 1) detailsById.set(`cold:${i}`, { snapshot: makeSessionSnapshot(CHAT_SIZE) });

// 与客户端 render() 同构的归一化流程（含快照引用 memo）。
function renderPass() {
	const active = buildEntries(listSnapshot, [], detailsById);
	for (const entry of active) {
		const detail = detailsById.get(entry.id);
		const snap = detail?.snapshot ?? null;
		if (detail && snap) {
			if (detail.memoTimelineOf !== snap) {
				detail.memoTimelineOf = snap;
				detail.memoTimeline = conversationTimeline(snap);
			}
			entry.timeline = detail.memoTimeline;
		}
	}
	const recent = buildRecent(listSnapshot, [], Date.now(), undefined, detailsById);
	for (const entry of recent) {
		const detail = detailsById.get(entry.id);
		if (!detail) continue;
		const key = detail.snapshot ?? detail.history ?? null;
		if (detail.memoPreviewsOf !== key || !detail.memoPreviews) {
			detail.memoPreviewsOf = key;
			detail.memoPreviews = messagePreviews({ snapshot: detail.snapshot, history: detail.history });
		}
		entry.userPreview = detail.memoPreviews.userPreview;
		entry.agentPreview = detail.memoPreviews.agentPreview;
	}
	return cardSignature([...active, ...recent]);
}

// ---- 改动前成本模型（before 证据下限）----
// 复刻删除前的调用模式与全序扫描：旧 buildEntries/buildRecent 对每个可见条目做
// conversationTimeline + messagePreviews 全序推导（≈条目×2 遍全扫），旧渲染循环再对
// 活动条目重复一遍（≈活动条目×2 遍全扫）；item 构建从简，只保证 O(order 全长) 同构。
function legacyScanAll(snapshot) {
	const chat = snapshot?.chat;
	const order = Array.isArray(chat?.order) ? chat.order : [];
	const nodes = chat?.nodes;
	const items = [];
	for (const key of order) {
		const node = nodes?.get?.(key) ?? nodes?.[key];
		if (node) items.push({ id: String(node.key ?? key), kind: node.kind ?? "other" });
	}
	return items;
}
function legacyRenderPass() {
	const active = buildEntries(listSnapshot, [], detailsById);
	for (const entry of active) {
		const detail = detailsById.get(entry.id);
		if (!detail?.snapshot) continue;
		entry.timeline = legacyScanAll(detail.snapshot).slice(-4); // 旧 buildEntries 推导
		legacyScanAll(detail.snapshot); // 旧 buildEntries previews（MAX 全量）
		legacyScanAll(detail.snapshot); // 旧渲染循环 timeline 重算
		legacyScanAll(detail.snapshot); // 旧渲染循环 previews 重算
	}
	const recent = buildRecent(listSnapshot, [], Date.now(), undefined, detailsById);
	for (const entry of recent) {
		const detail = detailsById.get(entry.id);
		if (!detail?.snapshot) continue;
		legacyScanAll(detail.snapshot); // 旧 buildRecent previews（MAX 全量）
		entry.userPreview = "";
		entry.agentPreview = "";
	}
	return cardSignature([...active, ...recent]);
}

function measure(label, mutate, pass = renderPass) {
	for (let i = 0; i < 10; i += 1) {
		mutate?.(i);
		pass();
	}
	const start = performance.now();
	for (let i = 0; i < iterations; i += 1) {
		mutate?.(i);
		pass();
	}
	const elapsed = performance.now() - start;
	console.log(`${label}: ${(elapsed / iterations).toFixed(3)} ms/pass (${RUNNING} running + ${RECENT} recent, chat=${CHAT_SIZE} nodes each)`);
}

// steady：快照引用不变（1s 时钟 tick 工况）
measure("steady x" + iterations, null);
// push：每遍轮换 run:0 的预建快照（流式推送工况，单会话 memo 未命中；不含快照构建成本）
const pushSnapshots = [makeSessionSnapshot(CHAT_SIZE), makeSessionSnapshot(CHAT_SIZE)];
measure("push   x" + iterations, (i) => {
	detailsById.get("run:0").snapshot = pushSnapshots[i % 2];
});
// legacy：改动前成本模型（before 下限证据）
measure("legacy x" + iterations, null, legacyRenderPass);
