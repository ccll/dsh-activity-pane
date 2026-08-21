// dsh-activity-pane 核心单元检查与 client bundle 契约校验。
//
// 测试锚点：本文件被 CONVENTIONS.md 的 `测试锚点路径` 登记为测试文件，
// 以一行的 `// R-gg-nnn/AC-nn` 注释锚定 PRD 验收点；GUI 交互类验收点
// 见 scripts/acceptance.mjs（人工验收清单）。
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildEntries,
	buildRecent,
	buildTrace,
	cardSignature,
	cleanPreview,
	conversationTimeline,
	conversationTimelineFromHistory,
	firstPhysicalLine,
	fmtElapsedMs,
	fmtTokens,
	isActiveRow,
	messagePreviews,
	modelMetadata,
	pendingText,
	PROGRESS_THINK_BASE,
	progressOf,
	runtimeStats,
	subagentTitle,
	summarizeToolArguments,
	TRACE_MAX_ITEMS,
	workspaceTitleForSession,
} from "../src/core.mjs";
import { openSession } from "../src/navigation.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ---- R-01-005/AC-01 点击跳转回归：卡片快照变化不能拦截原生导航 ----
let openedSession = null;
assert.equal(
	openSession(
		{
			list: { getSnapshot: () => ({ ids: [] }) },
			open: (id) => {
				openedSession = id;
			},
		},
		"stale-card",
	),
	true,
	"即使另一份 list 快照不含目标，点击仍直接调用 sessions.open",
);
assert.equal(openedSession, "stale-card");
assert.equal(
	openSession(
		{ open: () => {
			throw new Error("not ready");
		} },
		"not-ready",
	),
	false,
	"sessions.open 失败时交给调用方进入 refresh/retry",
);

// ---- R-01-002/AC-01 待确认 ｜ R-01-002/AC-02 待审查/待回复 ----
assert.equal(pendingText("approval"), "待确认");
assert.equal(pendingText("plan-review"), "待审查");
assert.equal(pendingText("question"), "待回复");
assert.equal(pendingText("approval"), "待确认");

// ---- R-01-002/AC-03 完成主会话以"需要响应"呈现 ----
// pendingText 兜底为"需要响应"；完成态判定见下方 buildEntries 断言（R-01-001/AC-01）。
assert.equal(pendingText("unknown-kind"), "需要响应");

// ---- R-01-003/AC-03 工作区归属 ----
const workspaces = [
	{ title: "Ops", path: "/srv/ops", sessionIds: ["sA"] },
	{ title: "Mail", path: "/srv/mail", sessionIds: [] },
];
assert.equal(workspaceTitleForSession("sA", workspaces), "Ops");
assert.equal(
	workspaceTitleForSession("sB", workspaces, { sB: { cwd: "/srv/mail" } }),
	"Mail",
);
assert.equal(workspaceTitleForSession("sX", workspaces), "");

// ---- R-01-001/AC-01 活动卡片逐条显示 ｜ R-01-003/AC-01 子代理嵌套 ｜ R-01-003/AC-02 子代理结束即消失 ｜ R-01-006/AC-01 当前会话 ----
const snapshot = {
	ids: ["sA", "sA-c1", "sA-c2", "sB", "sX"],
	byId: {
		sA: { id: "sA", displayTitle: "主A", running: true, completed: false },
		"sA-c1": { id: "sA-c1", displayTitle: "子1", running: true, parentId: "sA" },
		"sA-c2": { id: "sA-c2", displayTitle: "子2", running: false, completed: true, parentId: "sA" },
		sB: { id: "sB", displayTitle: "主B", running: false, completed: true },
		sX: { id: "sX", displayTitle: "主X", running: false, completed: false },
	},
	current: "sA",
	subagentsByParent: {
		sA: { entries: [{ id: "sA-c1", label: "子代理一号" }] },
	},
};
const entries = buildEntries(snapshot, workspaces);
assert.deepEqual(
	entries.map((e) => [e.id, e.kind, e.depth, e.title]),
	[
		["sA", "running", 0, "主A"],
		["sA-c1", "subagent", 1, "子代理一号"],
		["sB", "awaiting", 0, "主B"],
	],
	"运行/等待主会话出现、子代理嵌套缩进、完成的子代理消失",
);
assert.equal(entries[0].isCurrent, true, "当前会话高亮标记");
assert.equal(entries[2].pendingText, "需要响应", "完成主会话=需要响应");
assert.equal(entries[2].workspaceTitle, "", "无归属则无工作区徽标");

// ---- R-01-001/AC-02 无活动会话时为空态 ｜ R-02-001/AC-01、R-02-001/AC-02 独立数据源 ----
// 核心映射只消费 DSH 原生快照结构（无任何第三方数据源引用）。
const snapshotOnly = { ids: [], byId: {}, current: null };
assert.deepEqual(buildEntries(snapshotOnly, []), [], "空快照产出空条目");

// ---- R-01-002/AC-01..02 等待优先于运行态 ----
const pendingSnap = {
	ids: ["sP"],
	byId: {
		sP: { id: "sP", displayTitle: "主P", running: true, pendingInteraction: "approval" },
	},
	current: null,
};
const pendingEntries = buildEntries(pendingSnap, []);
assert.equal(pendingEntries[0].kind, "awaiting", "pending 覆盖 running");
assert.equal(pendingEntries[0].pendingText, "待确认");

// ---- R-01-001/AC-01 可重复的确定性渲染（见下） ｜ R-02-003/AC-01 渲染签名去重 ----
const e1 = buildEntries(snapshot, workspaces);
const e2 = buildEntries(snapshot, workspaces);
assert.equal(cardSignature(e1), cardSignature(e2), "相同状态签名相等→跳过重绘");
assert.notEqual(
	cardSignature(e1),
	cardSignature([{ ...e1[0], title: "改" }]),
	"状态变化签名必变",
);

// ---- R-01-003/AC-01 无目录 label 时回退显示标题 ----
assert.equal(
	subagentTitle("sA", "sA-c2", snapshot.byId, snapshot.subagentsByParent),
	"子2",
);

// R-01-009/AC-01
// R-01-009/AC-02
// R-01-009/AC-03
// R-01-009/AC-05
// ---- 当前动作进入工作项/统计字段，不再拼接状态前缀 ----
assert.deepEqual(
	runtimeStats({ elapsedMs: 125000, outputTokens: 1200, rateTokS: 12.3 }),
	{ elapsedMs: 125000, outputTokens: 1200, rateTokS: 12.3 },
	"运行统计保留原始字段，不生成独立当前动作文案",
);
assert.equal(fmtElapsedMs(47_000), "47s", "时长短格式");
assert.equal(fmtElapsedMs(193_000), "3m13s", "时长分秒格式");

// R-01-012/AC-01
// R-01-012/AC-02
// R-01-012/AC-03
// R-01-012/AC-04
// ---- 活动卡模型上下文、主窗口 order 最近 4 项与 live 项 ----
assert.equal(firstPhysicalLine("  \n  第一行  \n第二行"), "第一行", "物理首行跳过空行且保留行语义");
assert.equal(firstPhysicalLine("\n\t"), "", "全空白消息预览为空");
const chatNodes = new Map([
	["u", { key: "u", kind: "user", anchorSeq: 1, data: { content: [{ type: "text", text: "用户任务\n补充" }] } }],
	["a", { key: "a", kind: "assistant-step", anchorSeq: 2, data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "text", text: "已完成\n详情" }] } }],
	["t", { key: "t", kind: "tool-call", anchorSeq: 3, data: { root: { kind: "tool-result", callId: "c1", call: { name: "read", argsRaw: '{"path":"/tmp/a"}' }, callTime: 10, time: 35, isError: false } } }],
	["live", { key: "live", kind: "assistant-step", anchorSeq: 4, data: { status: "running", turn: 2, step: 0, blocks: [{ kind: "text", text: "正在输出" }] } }],
	["old", { key: "old", kind: "assistant-step", anchorSeq: 0, data: { status: "settled", blocks: [{ kind: "text", text: "旧项" }] } }],
]);
const chatSnapshot = {
	chat: { order: ["old", "u", "a", "t", "live"], nodes: { get: (key) => chatNodes.get(key) } },
};
const timeline = conversationTimeline(chatSnapshot);
assert.deepEqual(timeline.map((item) => item.text), ["用户任务\n补充", "已完成\n详情", "read", "正在输出"], "工作项严格按主窗口 order 取最近 4 项并包含当前项");
assert.equal(timeline[2].detail, "/tmp/a", "工具详情沿用白名单摘要");
const outsideCurrent = conversationTimeline({
	chat: { order: ["u1", "u2", "u3", "u4", "u5"], nodes: { get: (key) => ({ key, kind: "user", data: { content: [{ type: "text", text: key }] } }) } },
	partial: { turn: 2, step: 0, blocks: [{ kind: "text", text: "当前项" }] },
});
assert.deepEqual(outsideCurrent.map((item) => item.text), ["u3", "u4", "u5", "当前项"], "当前项不在 order 时仅替换最旧项并保持 order 尾部");
const oldAssistantCurrent = conversationTimeline({
	chat: {
		order: ["oldAssistant", "u2", "u3", "u4", "u5"],
		nodes: { get: (key) => key === "oldAssistant" ? { key, kind: "assistant-step", data: { blocks: [{ kind: "text", text: "旧当前" }] } } : { key, kind: "user", data: { content: [{ type: "text", text: key }] } } },
	},
	partial: { turn: 3, step: 0, blocks: [{ kind: "text", text: "当前更新" }] },
});
assert.deepEqual(oldAssistantCurrent.map((item) => item.text), ["u3", "u4", "u5", "当前更新"], "order 尾部外的旧 assistant 被 live 当前项槽位替换");
const models = modelMetadata({
	current: { provider: "p", model: "m", reasoningEffort: "high" },
	groups: [{ id: "p", models: [{ id: "m", name: "Model M", reasoning: { efforts: [{ id: "high", name: "High" }] } }] }],
});
assert.deepEqual(models, { model: "Model M", reasoning: "High" }, "模型名与 reasoning level 复用 native catalog 文案");
const previews = messagePreviews({ snapshot: chatSnapshot });
assert.equal(previews.userPreview, "用户任务", "活动快照取最近用户物理首行");
assert.equal(previews.agentPreview, "正在输出", "活动快照取最近 agent 物理首行");
assert.deepEqual(
	conversationTimelineFromHistory([
		{ event: { type: "user/message", seq: 1, data: { source: { kind: "user" }, content: [{ type: "text", text: "历史用户" }] } } },
		{ event: { type: "assistant/message", seq: 2, data: { message: { content: [{ type: "text", text: "历史回复" }] } } } },
	]),
	[
		{ id: "user:1", kind: "user", icon: "user", text: "历史用户", detail: null, status: "done", durationMs: null },
		{ id: "assistant:2", kind: "assistant", icon: "assistant", text: "历史回复", detail: null, status: "done", durationMs: null },
	],
	"冷会话 history 按原始事件顺序降级",
);

// ---- R-01-009/AC-04 工具参数白名单摘要（不含完整命令/原始 JSON）----
assert.equal(
	summarizeToolArguments('{"command":"rm -rf /","description":"清理目录"}'),
	"清理目录",
	"白名单 description 字段提取摘要",
);
assert.equal(
	summarizeToolArguments('{"path":"/srv/ops/a.log"}'),
	"/srv/ops/a.log",
	"白名单 path 字段提取摘要",
);
assert.equal(
	summarizeToolArguments('{"url":"https://example.com/x"}'),
	"https://example.com/x",
	"白名单 url 字段提取摘要",
);
assert.equal(
	summarizeToolArguments('{"command":"top","cwd":"/srv"}'),
	null,
	"仅 command/cwd 不入摘要（不含完整命令）",
);
assert.equal(summarizeToolArguments("not-json{{"), null, "不可解析参数返回 null");
assert.equal(summarizeToolArguments(123), null, "非对象参数返回 null");
assert.equal(cleanPreview("  a   b "), "a b", "摘要文本折叠空白");
assert.equal(cleanPreview("", 10), null, "空文本返回 null");
assert.equal(cleanPreview("x".repeat(100), 88)?.length, 88, "超长摘要在 88 字符内截断");

// ---- R-01-009/AC-05 输出 token 计数与速率 ----
assert.equal(fmtTokens(847), "847", "千以下原样计数");
assert.equal(fmtTokens(1200), "1.2k", "千以上缩写");
assert.equal(fmtTokens(-1), null, "负数不展示");
assert.equal(fmtTokens(NaN), null, "非有限数不展示");
assert.deepEqual(
	runtimeStats({ outputTokens: 0, rateTokS: 0, elapsedMs: 47_000 }),
	{ elapsedMs: 47_000, outputTokens: 0, rateTokS: null },
	"零速率归一为空，token 统计仍可放在进度条下方",
);

// ---- R-01-009/AC-06 阶段进度（tool 冻结由渲染层按回合单调下限保持）----
assert.equal(progressOf({ phase: "stream", outputTokens: 0, elapsedMs: 0 }), 10, "流式起始 10%");
const pStream = progressOf({ phase: "stream", outputTokens: 5000, elapsedMs: 0 });
assert.ok(pStream > 10 && pStream <= 90, "流式 token 越多进度越高且在 90 内");
const pThinkEarly = progressOf({ phase: "think", outputTokens: 0, elapsedMs: 0 });
const pThinkLate = progressOf({ phase: "think", outputTokens: 0, elapsedMs: 10_000 });
assert.ok(pThinkLate >= pThinkEarly, "think 阶段随时长爬升不倒退");
assert.equal(pThinkEarly, PROGRESS_THINK_BASE, "think 起点与渲染兜底共用 PROGRESS_THINK_BASE，防两处漂移");
assert.equal(progressOf({ phase: "tool", outputTokens: 100, elapsedMs: 1000 }), null, "tool 阶段冻结返回 null（渲染层保持上一进度）");
assert.ok(progressOf({ phase: "stream", outputTokens: 1_000_000 }) <= 90, "进度有上界");
// 注：R-01-009/AC-06 的"同回合不倒退/回合重置"为渲染层单调下限，属 GUI 验收项（scripts/acceptance.mjs）。

// ---- R-01-009/AC-07 流程节点轨迹（阶段/工具、状态、耗时、不泄密）----
const traceNodes = [
	{ callId: "c1", call: { name: "bash", argsRaw: '{"command":"ls","path":"/tmp"}' }, callTime: 1000, time: 3000, isError: false },
	{ callId: "c2", call: { name: "read", argsRaw: '{"file_path":"/a/b.txt"}' }, callTime: 4000, time: 6000, isError: true },
];
const trace = buildTrace({
	nodes: traceNodes,
	runningTool: "web_search",
	runningArgs: '{"query":"dsh","url":"https://x"}',
	turnStartTime: 100,
	now: 1000,
});
assert.equal(trace[0].label, "调用 bash", "已定案工具节点标签");
assert.equal(trace[0].detail, "/tmp", "已定案节点参数摘要（path 白名单）");
assert.equal(trace[0].status, "done", "成功节点状态");
assert.equal(trace[0].durationMs, 2000, "已定案节点耗时=time-callTime");
assert.equal(trace[1].status, "error", "出错节点状态");
assert.equal(trace[1].detail, "/a/b.txt", "file_path 白名单摘要");
const current = trace[trace.length - 1];
assert.equal(current.label, "调用 web_search", "当前阶段=进行中的工具");
assert.equal(current.status, "running", "当前阶段为运行中");
assert.equal(current.detail, "dsh", "当前工具参数摘要（白名单按序取 describe/query/path/url）");
assert.ok(!JSON.stringify(trace).includes('"ls"'), "摘要不含完整命令/原始 JSON");
const manyNodes = Array.from({ length: 10 }, (_, i) => ({
	callId: `t${i}`,
	call: { name: `tool${i}`, argsRaw: "{}" },
	callTime: i,
	time: i + 1,
}));
assert.ok(
	buildTrace({ nodes: manyNodes, turnStartTime: 1, now: 9 }).length <= TRACE_MAX_ITEMS,
	"trace 上限裁剪",
);
// 纯流式阶段节点
const phaseTrace = buildTrace({ streaming: true, turnStartTime: 100, now: 1000 });
assert.equal(phaseTrace[0].label, "组织回答", "流式阶段节点文案");
const thinkTrace = buildTrace({ turnStartTime: 100, now: 1000 });
assert.equal(thinkTrace[0].label, "分析任务", "无流式/工具时显示分析任务（对齐 answer-pet think 阶段节点）");

// ---- R-02-003/AC-01 富卡字段并入签名后，进度/轨迹变化必触重重绘 ----
assert.notEqual(
	cardSignature([...entries, { ...entries[0], progress: 42 }]),
	cardSignature(entries),
	"progress 变化签必变",
);
assert.notEqual(
	cardSignature([...entries, { ...entries[0], trace: [{ id: "x", label: "调用 bash" }] }]),
	cardSignature(entries),
	"trace 变化签名必变",
);
assert.notEqual(
	cardSignature([...entries, { ...entries[0], outputTokens: 42 }]),
	cardSignature(entries),
	"token 统计变化签名必变",
);

// ---- R-01-010/AC-01 非活动且 24h 内→最近历史区 ----
const NOW = 2_000_000_000_000; // 固定时钟便于确定性断言
// 注意：completed:true 的主会话是"待打开"的活动卡（在活动区），不属历史区；
// 真实"最近历史"是已打开/已处理的非活动会话（running:false 且 completed:false）。
const recentSnap = {
	ids: ["sA", "sB", "sOld", "sBlank", "sAwait"],
	byId: {
		sA: { id: "sA", displayTitle: "运行A", running: true, completed: false, updatedAt: NOW },
		sB: { id: "sB", displayTitle: "旧B", running: false, completed: false, updatedAt: NOW - 3_600_000 },
		sOld: { id: "sOld", displayTitle: "太旧C", running: false, completed: false, updatedAt: NOW - 26 * 60 * 60 * 1000 },
		sBlank: { id: "sBlank", displayTitle: "空白D", blank: true, running: false, updatedAt: NOW - 1_000 },
		sAwait: { id: "sAwait", displayTitle: "待开E", running: false, completed: true, updatedAt: NOW - 2_000 },
	},
	current: null,
};
const recent = buildRecent(recentSnap, [], NOW);
assert.deepEqual(
	recent.map((e) => e.id),
	["sB"],
	"仅 24h 内已处理会话进入历史区；运行/待打开/超期/空白被过滤",
);
assert.deepEqual(
	[recent[0].model, recent[0].reasoning, recent[0].userPreview, recent[0].agentPreview],
	["", "", "", ""],
	"模型/history API 缺失时历史卡数据字段为空",
);
assert.deepEqual(modelMetadata({}), { model: "", reasoning: "" }, "models 失败或空 payload 时模型区域为空");
assert.deepEqual(messagePreviews({ history: [] }), { userPreview: "", agentPreview: "" }, "history 失败或空 payload 时消息预览为空");
// R-01-013/AC-01
// R-01-013/AC-02
// R-01-013/AC-03
// R-01-013/AC-04
// R-01-013/AC-05
// R-01-013/AC-06
const recentWithPreviews = buildRecent(recentSnap, [], NOW, undefined, {
	sB: {
		model: { model: "Model M", reasoning: "High" },
		previews: { userPreview: "用户首行", agentPreview: "回复首行" },
	},
});
assert.deepEqual(
	recentWithPreviews[0],
	{
		id: "sB",
		kind: "recent",
		depth: 0,
		title: "旧B",
		workspaceTitle: "",
		model: "Model M",
		reasoning: "High",
		userPreview: "用户首行",
		agentPreview: "回复首行",
		isCurrent: false,
		updatedAt: NOW - 3_600_000,
	},
	"历史卡五行数据缺失时仍保留空字段并复用模型/预览",
);
assert.deepEqual(
	messagePreviews({
		history: [
			{ event: { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "\n用户首行\n第二行" }] } } },
			{ event: { type: "assistant/message", data: { message: { content: [{ type: "text", text: "\n回复首行\n详情" }] } } } },
		],
	}),
	{ userPreview: "用户首行", agentPreview: "回复首行" },
	"历史卡用户与 agent 预览取首个非空物理行",
);

// ---- R-01-010/AC-02 活动→非活动 移入历史区 ----
// 同一会话：运行态时出现在活动区、不在历史区；转为非活动后从活动区消失并进入历史区。
const activeDuringRun = buildRecent(
	{
		ids: ["sB"],
		byId: { sB: { id: "sB", displayTitle: "旧B", running: true, updatedAt: NOW - 60_000 } },
		current: null,
	},
	[],
	NOW,
);
assert.equal(activeDuringRun.length, 0, "运行中会话不在历史区");
const viaRunToIdle = buildEntries(
	{ ids: ["sB"], byId: { sB: { id: "sB", displayTitle: "旧B", running: true } }, current: null },
	[],
);
assert.deepEqual(viaRunToIdle.map((e) => e.id), ["sB"], "运行中会话在活动区");
const recentAfterIdle = buildRecent(recentSnap, [], NOW);
assert.ok(recentAfterIdle.some((e) => e.id === "sB"), "转为非活动后进入历史区");

// ---- R-01-010/AC-03 历史区按最后活动时间从新到旧 ----
const multiRecent = buildRecent(
	{
		ids: ["r1", "r2", "r3"],
		byId: {
			r1: { id: "r1", displayTitle: "R1", running: false, updatedAt: NOW - 2_000 },
			r2: { id: "r2", displayTitle: "R2", running: false, updatedAt: NOW - 5_000 },
			r3: { id: "r3", displayTitle: "R3", running: false, updatedAt: NOW - 1_000 },
		},
		current: null,
	},
	[],
	NOW,
);
assert.deepEqual(
	multiRecent.map((e) => e.id),
	["r3", "r1", "r2"],
	"历史区按最近活动时间倒序",
);

// ---- R-01-003/AC-02、R-01-010/AC-01 已结束子代理不入最近历史 ----
const recentSubSnap = {
	ids: ["m", "m-c1"],
	byId: {
		m: { id: "m", displayTitle: "主M", running: false, completed: false, updatedAt: NOW - 1_000 },
		"m-c1": { id: "m-c1", displayTitle: "子S", running: false, completed: false, parentId: "m", updatedAt: NOW - 500 },
	},
	current: null,
};
const recentSub = buildRecent(recentSubSnap, [], NOW);
assert.ok(
	recentSub.some((e) => e.id === "m") && !recentSub.some((e) => e.id === "m-c1"),
	"最近历史仅主会话，已结束子代理不入历史区",
);

// ---- 重建 client bundle 并校验产物契约 ----
await mkdir(join(root, ".dsh-plugin"), { recursive: true });
execFileSync(process.execPath, [join(root, "scripts/build-client.mjs")], {
	cwd: root,
	stdio: "pipe",
});
const bundle = await readFile(join(root, ".dsh-plugin/client.js"), "utf8");

// bundle 必须是可解析的合法 JS（new Function 只编译不执行）——防止 CSS 模板内
// 误插反引号这类"字符串检查能过、但 loader 导入即失败"的损坏。
assert.doesNotThrow(
	() => new Function(bundle),
	"bundle 必须是合法 JS（可被 loader 导入注册）",
);
assert.ok(!bundle.includes("sessionsListHas"), "点击不得以第二份 list 快照提前拦截");
assert.ok(
	bundle.includes('document.addEventListener("keydown", onKeyDown, true)'),
	"键盘跳转监听必须在 capture 阶段接收",
);
assert.ok(
	bundle.includes('document.removeEventListener("keydown", onKeyDown, true)'),
	"卸载必须移除 capture 阶段键盘监听",
);
assert.ok(bundle.includes("pane !== renderedPane"), "新窗格实例必须重置渲染签名");
assert.ok(bundle.includes("openRetryStates"), "跳转重试链必须可合并并清理");
// ---- R-01-009/AC-02、R-01-009/AC-05、R-01-012/AC-01..04、R-01-013/AC-01..06 ----
assert.ok(bundle.includes("conversationTimeline"), "活动卡使用主会话 ChatSnapshot 工作项时间线");
assert.ok(bundle.includes("api.history"), "冷会话使用 native history 一次性补齐");
assert.ok(bundle.includes("api.models"), "模型/reasoning 使用 native models 数据");
assert.ok(bundle.includes("dap-token-stats"), "token 统计 DOM 位于进度条之后");
assert.ok(bundle.includes("dap-history-line"), "历史卡包含用户/agent 两条消息预览行");
assert.ok(bundle.includes("session.subscribe"), "运行卡通过 native session subscribe 接收实时推送");
assert.ok(!bundle.includes("events.mux"), "不常驻全局 mux，当前会话使用原生 session subscribe");
assert.ok(
	bundle.indexOf('makeEl("div", "dap-track")') < bundle.indexOf('makeEl("div", "dap-token-stats")'),
	"token 统计骨架位于进度条骨架之后",
);
assert.ok(!bundle.includes("思考中"), "活动卡 bundle 不再渲染独立思考中动作行");
assert.ok(!bundle.includes("dap-status"), "活动卡 bundle 不再保留独立状态行骨架");
assert.ok(!bundle.includes("statusLine"), "活动卡 bundle 不再依赖 statusLine 状态文案");

// R-02-001/AC-01
// R-02-001/AC-02
// R-02-004/AC-01
// R-02-004/AC-02
// ---- 无第三方状态路由，轮内状态不引入新的 HTTP 轮询 ----
// 校验的是运行时引用：不得注入第三方插件服务、不得请求其状态路由、不得发起状态轮询
// （文档注释中的上位名提及属来源声明，不构成依赖）。
assert.ok(bundle.includes('id: "dsh-activity-pane"'), "bundle 含插件 id");
assert.ok(bundle.includes("ctx.get(\"sessions\")"), "数据来自 DSH 原生 sessions 服务");
assert.ok(bundle.includes("ctx.get(\"workspaces\")"), "数据来自 DSH 原生 workspaces 服务");
assert.ok(
	!bundle.includes("ctx.get(\"dsh-answer-pet\")"),
	"不得以服务方式依赖第三方宠物插件",
);
assert.ok(
	!bundle.includes("fetch("),
	"bundle 不得发起任何状态路由请求或状态轮询（R-02-004/AC-02）",
);

// ---- R-02-003/AC-02 卸载时清理注入元素、样式与监听 ----
assert.ok(bundle.includes("style.remove()"), "卸载移除注入样式");
assert.ok(bundle.includes("bodyObserver.disconnect()"), "卸载断开观察者");
assert.ok(bundle.includes("removeEventListener"), "卸载移除事件监听");

// ---- 回归锚点：时间线几何/状态动画（R-01-009/AC-08、AC-09 呈现细节）----
// 圆点与竖线从卡片内容左边起步：末项不画连接竖线、竖线 left 3px 与 7px 圆点
//（圆心 x=3.5）同圆心，竖线贯穿首项圆点并向上引出，子代理容器不裁切圆点；
// reduced-motion 只关闭宽度 transition，不关闭 answer-pet 同款状态脉冲/流式条纹。
assert.ok(bundle.includes(".dap-trace-item:last-child::after"), "时间线末项不画竖线（终点没入最末圆点）");
assert.ok(bundle.includes("margin: 1px 0 2px;"), "时间线整体与卡片内容左边界对齐");
assert.ok(bundle.includes("left: 3px; top: 0; bottom: -8px"), "1px 竖线（整数位）与 7px 圆点严格同圆心（不右偏）");
assert.ok(bundle.includes("width: 7px; height: 7px"), "时间线圆点奇数宽 7px（保证整数位居中）");
assert.ok(bundle.includes("padding-left: 14px"), "时间线文字轨道保持 14px 内缩");
assert.ok(bundle.includes(".dap-subtrace {\n  min-width: 0;"), "子代理容器不再 padding/border/overflow 包裹（不裁切圆点）");
assert.ok(bundle.includes(".dap-fill { transition: none; }"), "降低动效设置不关闭状态动画（对齐 answer-pet）");
assert.ok(bundle.includes("animation: dap-stripes 0.8s linear infinite"), "流式进度条保留向右滚动条纹动画");
assert.ok(bundle.includes("animation: dap-pulse 1.15s ease-in-out infinite"), "运行中蓝色节点保留脉冲动画");
assert.ok(bundle.includes("dataset.traceKey"), "同一流程节点复用 DOM，脉冲动画不因时钟刷新重置");
assert.ok(!bundle.includes(".dap-trace-item[data-status=\"running\"]::before {\n    animation: none !important;"), "降低动效设置不关闭运行点脉冲");

console.log("check: all assertions passed");
