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
	fmtElapsedMs,
	fmtTokens,
	isActiveRow,
	pendingText,
	PROGRESS_THINK_BASE,
	progressOf,
	statusLine,
	subagentTitle,
	summarizeToolArguments,
	TRACE_MAX_ITEMS,
	workspaceTitleForSession,
} from "../src/core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

// ---- R-01-009/AC-01 工具调用显示工具名（对齐 answer-pet：头=使用工具、名称在末尾）----
assert.equal(statusLine({ runningTool: "bash" }), "使用工具 · bash", "进行中的工具调用显示工具名");
assert.equal(
	statusLine({ runningTool: "web_search" }),
	"使用工具 · web_search",
	"任意工具名如实显示",
);

// ---- R-01-009/AC-02 流式回复以"回答中"提示（answer-pet 对齐）----
assert.equal(statusLine({ streaming: true }), "回答中", "流式回复中显示回答中提示");

// ---- R-01-009/AC-03 状态描述随轮内阶段更新 ----
const stTool = statusLine({ runningTool: "bash", elapsedMs: 125000 });
const stStream = statusLine({ streaming: true, elapsedMs: 125000 });
const stPlain = statusLine({});
assert.notEqual(stTool, stStream, "工具→流式 状态文案变化");
assert.notEqual(stStream, stPlain, "流式→闲置 状态文案变化");
assert.equal(stTool, "使用工具 · 2m5s · bash", "工具状态含运行时长且工具名在末尾（answer-pet 顺序）");
assert.equal(stPlain, "思考中", "无工具/流式时显示思考中（answer-pet think 标签）");
assert.equal(fmtElapsedMs(47_000), "47s", "时长短格式");
assert.equal(fmtElapsedMs(193_000), "3m13s", "时长分秒格式");

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
assert.equal(
	statusLine({ streaming: true, outputTokens: 1200, rateTokS: 12.3, elapsedMs: 47_000 }),
	"回答中 · 1.2k tok · ≈12 tok/s · 47s",
	"状态行拼接 token 计数与（近似标记）速率",
);
assert.equal(
	statusLine({ streaming: true, outputTokens: 0, rateTokS: 0, elapsedMs: 47_000 }),
	"回答中 · 47s",
	"token/速率为零时不显示对应字段（对齐 answer-pet）",
);
assert.equal(
	statusLine({ runningTool: "bash", elapsedMs: 125_000 }),
	"使用工具 · 2m5s · bash",
	"不传 token/速率时保持原有状态行（向后兼容）",
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

// ---- R-02-001/AC-01 未安装任何第三方宠物插件时仍可用；R-02-001/AC-02 无第三方状态路由；
//      R-02-004/AC-02 轮内状态不引入新的 HTTP 轮询 ----
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

console.log("check: all assertions passed");
