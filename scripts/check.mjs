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
	AWAIT_PERIOD_FAST_S,
	AWAIT_PERIOD_SLOW_S,
	awaitBadgeStats,
	awaitPulsePeriod,
	buildEntries,
	buildRecent,
	cardSignature,
	cleanPreview,
	clampPaneWidth,
	pagedHistoryEvents,
	detailLoadPlan,
	conversationTimeline,
	conversationTimelineFromHistory,
	foldWorkGroups,
	foldedConversationTimeline,
	escapeCssString,
	firstPhysicalLine,
	fmtElapsedMs,
	fmtTokens,
	isActiveRow,
	shouldSubscribeToSession,
	activeSessionIds,
	updateCompletedHolds,
	trackBoxes,
	trackRuns,
	isSubagentRow,
	listLoadState,
	mergeTraceStatus,
	messagePreviews,
	movedToRecentIds,
	modelMetadata,
	nativePresentationSessionId,
	needsHistorySnapshot,
	pendingText,
	progressOf,
	pruneInvisibleEntries,
	runtimeStats,
	shouldCancelOpenRetry,
	subagentTitle,
	summarizeToolArguments,
	usageSummary,
	workspaceTitleForSession,
} from "../src/core.mjs";
import {
	COMPOSER_SELECTOR,
	bindBackdropDismiss,
	bindCardActivation,
	openSession,
	shouldDismissDrawerOnActivation,
	suppressComposerAutofocus,
} from "../src/navigation.mjs";

// R-01-002/AC-07 周期端点耦合钉：AWAIT_PERIOD_SLOW_S 与 CSS var(--dap-await-period, 1.6s)
// 缺省值必须同步（JS 未写入时回落 CSS 缺省），改动任一侧须同次变更另一侧。
assert.equal(AWAIT_PERIOD_SLOW_S, 1.6, "慢端周期常量与 CSS 缺省值耦合，改任一处必须同步");
assert.equal(AWAIT_PERIOD_FAST_S, 0.5, "快端上限常量与 DESIGN/单测文档值耦合");

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

// ---- R-01-005/AC-01、R-02-003/AC-01 card 自身 click/键盘监听与卸载 ----
const cardListeners = new Map();
const card = {
	dataset: { sessionId: "card-a" },
	addEventListener(type, listener) {
		cardListeners.set(type, listener);
	},
	removeEventListener(type, listener) {
		if (cardListeners.get(type) === listener) cardListeners.delete(type);
	},
};
const cardOpened = [];
const cardSessions = { open: (id) => cardOpened.push(id) };
const unbindCard = bindCardActivation(card, (id) => openSession(cardSessions, id));
const activateEvent = (type, key = undefined) => {
	let prevented = false;
	let stopped = false;
	cardListeners.get(type)?.({
		type,
		currentTarget: card,
		key,
		preventDefault: () => { prevented = true; },
		stopPropagation: () => { stopped = true; },
	});
	return { prevented, stopped };
};
assert.deepEqual(activateEvent("click"), { prevented: true, stopped: true }, "card click 可激活并阻止宿主继续处理");
assert.deepEqual(activateEvent("keydown", "Enter"), { prevented: true, stopped: true }, "card Enter 可激活");
assert.deepEqual(activateEvent("keydown", " "), { prevented: true, stopped: true }, "card Space 可激活");
assert.deepEqual(activateEvent("keydown", "Escape"), { prevented: false, stopped: false }, "其它按键不激活 card");
card.dataset.sessionId = "card-b";
activateEvent("click");
assert.deepEqual(cardOpened, ["card-a", "card-a", "card-a", "card-b"], "复用同一 card 时读取最新 session id");
unbindCard();
assert.equal(cardListeners.size, 0, "card 卸载移除 click/keydown 监听");

// ---- R-01-005/AC-01 回归：移动端切换会话后抑制原生 composer 自动聚焦（不弹软键盘） ----
const composerEl = {
	focused: true,
	matches: (selector) => selector === COMPOSER_SELECTOR,
	blur() {
		this.focused = false;
	},
};
const docListeners = new Map();
const fakeDoc = {
	activeElement: composerEl,
	addEventListener(type, listener, capture) {
		docListeners.set(`${type}:${capture}`, listener);
	},
	removeEventListener(type, listener, capture) {
		if (docListeners.get(`${type}:${capture}`) === listener) docListeners.delete(`${type}:${capture}`);
	},
};
let endFocusWindow = null;
suppressComposerAutofocus(fakeDoc, (fn) => {
	endFocusWindow = fn;
});
assert.equal(composerEl.focused, false, "激活时 composer 已持焦则立即 blur");
const onFocusIn = docListeners.get("focusin:true");
assert.equal(typeof onFocusIn, "function", "已安装捕获阶段 focusin 监听");
composerEl.focused = true;
onFocusIn({ target: composerEl });
assert.equal(composerEl.focused, false, "窗口内 composer 自动聚焦被 blur");
onFocusIn({ target: { matches: () => false, blur: () => assert.fail("非 composer 不应被 blur") } });
endFocusWindow();
assert.equal(docListeners.size, 0, "窗口结束后移除 focusin 监听");
composerEl.focused = true;
assert.equal(composerEl.focused, true, "监听移除后不再干预聚焦");
suppressComposerAutofocus(null);
suppressComposerAutofocus({});

// ---- R-01-005/AC-02 打开重试链取消判定与卡片定位选择器转义 ----
assert.equal(
	shouldCancelOpenRetry({ targetId: "a", currentId: "a", activatedId: "a" }),
	true,
	"重试目标已成为当前会话（他途到达）时取消本链",
);
assert.equal(
	shouldCancelOpenRetry({ targetId: "a", currentId: null, activatedId: "b" }),
	true,
	"用户激活其它卡片后旧重试链被新意图取代",
);
assert.equal(
	shouldCancelOpenRetry({ targetId: "a", currentId: "b", activatedId: "a" }),
	false,
	"本链目标即最新激活意图且未到达时保留重试",
);
assert.equal(
	shouldCancelOpenRetry({ targetId: "a", currentId: null, activatedId: null }),
	false,
	"无到达也无新意图时保留重试",
);
assert.equal(
	shouldCancelOpenRetry({ targetId: null, currentId: "a", activatedId: "a" }),
	true,
	"非法目标直接取消",
);
assert.equal(escapeCssString('a"b\\c'), 'a\\"b\\\\c', "先转义反斜杠再转义引号，选择器不破裂");
assert.equal(escapeCssString(""), "", "空 id 转义为空，加引号选择器仍合法");
assert.equal(escapeCssString(42), "42", "非字符串 id 归一为字符串");
assert.equal(escapeCssString("a\nb"), "a\\a b", "换行按 CSS 字符串码位转义");
assert.equal(escapeCssString("a\rb"), "a\\d b", "回车按 CSS 字符串码位转义");
assert.equal(escapeCssString("a\fb"), "a\\c b", "换页按 CSS 字符串码位转义");
assert.equal(escapeCssString("a\0b"), "a�b", "NUL 归一为替换字符");
// R-01-012/AC-01
assert.equal(isSubagentRow({ parentId: "ghost" }, {}), false, "父级不在列表时按主会话处理（仍允许 models 读取）");
assert.equal(isSubagentRow({ parentId: "p" }, { p: { id: "p" } }), true, "直属子代理判定命中时跳过 models 读取");
// models/history 加载决策行为链：首读 → 在途不重发 → 失败置空后可见期内不热重试 → 离开可见清理后重回可重试
const loadDetail = {};
assert.deepEqual(
	detailLoadPlan({ detail: loadDetail }),
	{ subagent: false, model: true, history: false },
	"冷会话首次决策发起 models 读取",
);
assert.equal(
	detailLoadPlan({ detail: loadDetail, modelInflight: true }).model,
	false,
	"读取在途时不重复发起",
);
loadDetail.model = { model: "", reasoning: "" };
assert.equal(detailLoadPlan({ detail: loadDetail }).model, false, "失败置空后可见期内不热重试");
assert.equal(detailLoadPlan({ detail: {} }).model, true, "离开可见清理后重回可见允许重试");
assert.deepEqual(
	detailLoadPlan({ detail: {}, isSubagent: true }),
	{ subagent: true, model: false, history: false },
	"子代理不发起 models 读取",
);
assert.equal(
	detailLoadPlan({ detail: {}, historyNeeded: true }).history,
	true,
	"无快照冷会话决策发起 history 读取",
);
assert.equal(
	detailLoadPlan({ detail: {}, historyNeeded: true, snapshotReady: true }).history,
	false,
	"原生快照已就绪时不发 history 读取",
);

// ---- R-01-008/AC-03 点击遮罩（抽屉外部）收起抽屉 ----
const backdropListeners = new Map();
const backdrop = {
	addEventListener(type, listener) {
		backdropListeners.set(type, listener);
	},
	removeEventListener(type, listener) {
		if (backdropListeners.get(type) === listener) backdropListeners.delete(type);
	},
};
let backdropDismissed = 0;
const unbindBackdrop = bindBackdropDismiss(backdrop, () => {
	backdropDismissed += 1;
});
const backdropActivate = (type) => {
	let prevented = false;
	let stopped = false;
	backdropListeners.get(type)?.({
		type,
		preventDefault: () => { prevented = true; },
		stopPropagation: () => { stopped = true; },
	});
	return { prevented, stopped };
};
assert.deepEqual(backdropActivate("click"), { prevented: true, stopped: true }, "遮罩 click 收起抽屉并阻止宿主继续处理");
assert.equal(backdropDismissed, 1);
assert.deepEqual(backdropActivate("keydown"), { prevented: false, stopped: false }, "遮罩非 click 事件不收起");
assert.equal(backdropDismissed, 1);
const noopUnbind = bindBackdropDismiss(null, () => {});
assert.equal(typeof noopUnbind, "function", "非法输入返回 no-op 卸载函数");
noopUnbind();
unbindBackdrop();
assert.equal(backdropListeners.size, 0, "遮罩卸载移除 click 监听");
backdropActivate("click");
assert.equal(backdropDismissed, 1, "卸载后点击不再收起");

// ---- R-01-008/AC-06 二次激活当前会话卡片收起移动端抽屉 ----
assert.equal(
	shouldDismissDrawerOnActivation({ targetId: "s1", currentId: "s1", mobile: true, drawerOpen: true }),
	true,
	"移动断点抽屉打开时激活当前会话卡片转为收起抽屉",
);
assert.equal(
	shouldDismissDrawerOnActivation({ targetId: "s2", currentId: "s1", mobile: true, drawerOpen: true }),
	false,
	"激活非当前卡片仍走会话切换",
);
assert.equal(
	shouldDismissDrawerOnActivation({ targetId: "s1", currentId: "s1", mobile: false, drawerOpen: true }),
	false,
	"桌面断点不收起（无抽屉形态）",
);
assert.equal(
	shouldDismissDrawerOnActivation({ targetId: "s1", currentId: "s1", mobile: true, drawerOpen: false }),
	false,
	"抽屉未打开不收起",
);
assert.equal(
	shouldDismissDrawerOnActivation({ targetId: "s1", currentId: null, mobile: true, drawerOpen: true }),
	false,
	"无当前会话不误判收起",
);
assert.equal(
	shouldDismissDrawerOnActivation({ targetId: "", currentId: null, mobile: true, drawerOpen: true }),
	false,
	"空目标 id 不误判收起",
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
assert.equal(entries[1].parentId, "sA", "子代理条目保留直属母会话 id");
assert.deepEqual(trackRuns(entries), [{ parentId: "sA", depth: 1, childIds: ["sA-c1"] }], "唯一可见子代理产生一条母会话轨道运行");
const hierarchyEntries = [
	{ id: "root", kind: "running", depth: 0 },
	{ id: "A", kind: "subagent", parentId: "root", depth: 1 },
	{ id: "G", kind: "subagent", parentId: "A", depth: 2 },
	{ id: "B", kind: "subagent", parentId: "root", depth: 1 },
];
assert.deepEqual(
	trackRuns(hierarchyEntries),
	[
		{ parentId: "root", depth: 1, childIds: ["A", "B"] },
		{ parentId: "A", depth: 2, childIds: ["G"] },
	],
	"P→A→G→B：root 与 A 各一条连续轨道，跨孙级区间由同一元素覆盖（断线回归）",
);
assert.deepEqual(trackRuns(hierarchyEntries.slice(0, 3)), [
	{ parentId: "root", depth: 1, childIds: ["A"] },
	{ parentId: "A", depth: 2, childIds: ["G"] },
], "无后续同级时轨道収于各自末级子代理");
assert.deepEqual(trackRuns([hierarchyEntries[0]]), [], "无子代理的母会话不产生轨道");
assert.deepEqual(trackRuns([{ kind: "subagent", parentId: "p", depth: 1 }]), [], "无 id 条目不产生轨道");
assert.deepEqual(
	trackRuns([...hierarchyEntries, { id: "X", kind: "subagent", parentId: "root", depth: 3 }]),
	[
		{ parentId: "root", depth: 1, childIds: ["A", "B"] },
		{ parentId: "A", depth: 2, childIds: ["G"] },
	],
	"非直属条目不纳入轨道、不改末级",
);
assert.deepEqual(
	trackRuns([
		{ id: "root", kind: "running", depth: 0 },
		{ id: "X", kind: "subagent", parentId: "root", depth: 2 },
		{ id: "A", kind: "subagent", parentId: "root", depth: 1 },
	]),
	[{ parentId: "root", depth: 1, childIds: ["A"] }],
	"异常深度条目先来也不污染轨道：直属性按母会话条目深度+1 判定，与顺序无关",
);
const hierarchyRuns = trackRuns(hierarchyEntries);
const hierarchyRects = {
	root: { top: 0, height: 40, left: 8 },
	A: { top: 46, height: 30, left: 24 },
	G: { top: 82, height: 30, left: 40 },
	B: { top: 118, height: 30, left: 24 },
};
assert.deepEqual(
	trackBoxes(hierarchyRuns[0], (id) => hierarchyRects[id] ?? null, 16),
	{
		track: { top: 40, left: 17, height: 94 },
		stubs: [
			{ top: 61, left: 18, width: 6 },
			{ top: 133, left: 18, width: 6 },
		],
	},
	"root 竖轨起于母会话底缘、穿过 G 所在区间、延伸进末级 B 的收口行；A/B 横线从竖轨右缘到各卡片左缘（几何回归）",
);
assert.deepEqual(
	trackBoxes(hierarchyRuns[1], (id) => hierarchyRects[id] ?? null, 16),
	{
		track: { top: 76, left: 33, height: 22 },
		stubs: [{ top: 97, left: 34, width: 6 }],
	},
	"A 竖轨起于 A 底缘、延伸进 G 的收口行（末级精确収口），横线同理相接",
);
assert.equal(
	trackBoxes(hierarchyRuns[0], () => ({ top: 0, height: 0, left: 0 }), 16),
	null,
	"折叠/隐藏态零高度读数不绘制轨道，展开后由 ResizeObserver 重算",
);
assert.equal(trackBoxes(hierarchyRuns[0], () => null, 16), null, "卡片缺失时跳过该轨道（下轮渲染自愈）");
assert.equal(entries[2].workspaceTitle, "", "无归属则无工作区徽标");
// ---- R-01-003/AC-05 活动子代理补齐所有非活动母会话 ----
const inheritedActivity = {
	ids: ["root", "parent", "child"],
	byId: {
		root: { id: "root", displayTitle: "根母会话", running: false, completed: false, updatedAt: 1900 },
		parent: { id: "parent", displayTitle: "中间母会话", running: false, completed: false, parentId: "root", updatedAt: 1900 },
		child: { id: "child", displayTitle: "活动子会话", running: true, parentId: "parent" },
	},
	current: null,
};
assert.deepEqual(
	[...activeSessionIds(inheritedActivity.byId)].sort(),
	["child", "parent", "root"],
	"活动子代理沿 parentId 链补齐所有有效母会话",
);
assert.deepEqual(
	buildEntries(inheritedActivity, []).map((entry) => [entry.id, entry.kind, entry.depth]),
	[["root", "parent", 0], ["parent", "parent", 1], ["child", "subagent", 2]],
	"自身不活动的母会话作为 parent 上下文显示并保持层级深度",
);
assert.deepEqual(buildRecent(inheritedActivity, [], 2000), [], "活动祖先不进入最近历史区");
assert.equal(
	shouldSubscribeToSession({ id: "parent", kind: "parent" }, inheritedActivity.byId),
	false,
	"parent 上下文不建立轮内状态订阅",
);
assert.equal(
	shouldSubscribeToSession({ id: "child", kind: "subagent" }, inheritedActivity.byId),
	true,
	"运行中的子代理建立轮内状态订阅",
);

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

// ---- R-01-001/AC-05 徽标计数口径：只统计主会话，子代理与 parent 不计入 ----
assert.deepEqual(awaitBadgeStats([]), { waiting: 0, total: 0 }, "空列表为 0/0（R-01-001/AC-06）");
assert.deepEqual(
	awaitBadgeStats([
		{ id: "a", kind: "running" },
		{ id: "b", kind: "awaiting" },
		{ id: "c", kind: "awaiting" },
		{ id: "d", kind: "subagent" },
		{ id: "e", kind: "parent" },
	]),
	{ waiting: 2, total: 3 },
	"分子=awaiting 主会话数，分母=running+awaiting 主会话数",
);
// ---- R-01-002/AC-07 脉冲周期：随占比单调加快、两端封闭、非法输入不脉冲 ----
assert.equal(awaitPulsePeriod(0, 3), null, "无等待返回 null：不脉冲");
assert.equal(awaitPulsePeriod(-1, 3), null, "负分子归一为不脉冲");
assert.equal(awaitPulsePeriod(2, 1), null, "分子大于分母视为非法输入");
assert.equal(awaitPulsePeriod(2, undefined), null, "非法分母归一为不脉冲");
assert.equal(awaitPulsePeriod(1, 1), 0.5, "全部等待达到频率上限（最短周期）");
const periodQuarter = awaitPulsePeriod(1, 4);
const periodHalf = awaitPulsePeriod(2, 4);
const periodThreeQuarters = awaitPulsePeriod(3, 4);
assert.ok(periodHalf < periodQuarter && periodThreeQuarters < periodHalf, "占比越高周期越短（频率单调加快）");
assert.ok(periodThreeQuarters > 0.5 && periodQuarter < 1.6, "部分等待的周期落在封闭区间内");
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
// R-01-009/AC-03
assert.equal(fmtElapsedMs(NaN), "", "NaN 时长归一为空");
assert.equal(fmtElapsedMs(Infinity), "", "Infinity 时长归一为空");
assert.equal(fmtElapsedMs(-1), "", "负时长归一为空");
assert.equal(nativePresentationSessionId({ id: "s1", isCurrent: true }), "s1", "当前 card 才允许读取当前会话 DOM");
assert.equal(nativePresentationSessionId({ id: "s2", isCurrent: false }), null, "非当前 card 禁止读取当前会话 DOM");

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
assert.equal(timeline[2].label, "Read", "工具标题复用主网页的 Read 语义");
assert.equal(timeline[2].toolName, "read", "工作项保留原始 tool name 供 host DOM 匹配");
assert.equal(timeline[2].callId, "c1", "工作项保留 call id 供同名工具精确匹配 host DOM");
assert.equal(timeline[2].summary, "/tmp/a", "工具行摘要与标题分层");
const thinkItem = conversationTimeline({
	chat: { order: ["think"], nodes: { get: () => ({ kind: "assistant-step", data: { turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "Planning path" }] } }) } },
})[0];
assert.equal(thinkItem.label, "Think", "推理工作项标题复用主网页 Think 语义");
assert.equal(thinkItem.summary, "Planning path", "推理工作项摘要单独保留");
const grepItem = conversationTimeline({
	chat: { order: ["grep"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "grep-1", call: { name: "grep", argsRaw: '{"pattern":"foo"}' } } } }) } },
})[0];
assert.equal(grepItem.label, "Grep", "grep 标题与主会话网页一致");
const globItem = conversationTimeline({
	chat: { order: ["glob"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "glob-1", call: { name: "glob", argsRaw: "{}" } } } }) } },
})[0];
assert.equal(globItem.label, "Glob", "glob 标题与主会话网页一致（SEARCH_TITLES: glob → Glob）");
const webFetchItem = conversationTimeline({
	chat: { order: ["wf"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "wf-1", call: { name: "web_fetch", argsRaw: '{"url":"https://a.b"}' } } } }) } },
})[0];
assert.equal(webFetchItem.label, "Fetch", "web_fetch 标题与主会话网页一致（WEB_TITLES: web_fetch → Fetch）");
const cordisItem = conversationTimeline({
	chat: { order: ["c"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "c-1", call: { name: "cordis_run", argsRaw: "{}" } } } }) } },
})[0];
assert.equal(cordisItem.label, "Run Cordis Plugin", "cordis 动作标题使用主会话网页完整动宾文案");
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
assert.equal(needsHistorySnapshot({ chat: { order: [] } }), true, "空 chat snapshot 需要 history fallback");
assert.equal(needsHistorySnapshot({ chat: { order: ["item"] } }), false, "已 hydrate 的 chat snapshot 优先使用 order");
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
		{ id: "user:1", kind: "user", icon: "user", text: "历史用户", detail: null, status: "done" },
		{ id: "assistant:2", kind: "assistant", icon: "assistant", text: "历史回复", detail: null, status: "done" },
	],
	"冷会话 history 按原始事件顺序降级",
);

// ---- R-01-017 折叠时间线（检测 dsh-auto-collapse 生效时分组呈现）----
// R-01-017/AC-02 硬边界：用户输入与正文打断分组；工具+思考混排并入同组
const foldNodes = new Map([
	["u1", { key: "u1", kind: "user", anchorSeq: 1, data: { content: [{ type: "text", text: "查一下" }] } }],
	["g1", { key: "g1", kind: "tool-call", anchorSeq: 2, data: { root: { kind: "tool-result", callId: "g1", call: { name: "grep", argsRaw: '{"pattern":"foo"}' }, isError: false } } }],
	["th1", { key: "th1", kind: "assistant-step", anchorSeq: 3, data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "思考一\n思考二" }] } }],
	["b1", { key: "b1", kind: "assistant-step", anchorSeq: 4, data: { status: "settled", turn: 1, step: 1, blocks: [{ kind: "text", text: "结论正文" }] } }],
	["b2", { key: "b2", kind: "tool-call", anchorSeq: 5, data: { root: { kind: "tool-result", callId: "b2", call: { name: "bash", argsRaw: '{"command":"ls -la"}' }, isError: false } } }],
]);
const foldSnapshot = { chat: { order: ["u1", "g1", "th1", "b1", "b2"], nodes: { get: (key) => foldNodes.get(key) } } };
const folded = foldedConversationTimeline(foldSnapshot);
assert.equal(folded.length, 4, "用户输入、混排组、正文、尾部工具各占一行（R-01-017/AC-02）");
assert.equal(folded[0].kind, "user", "用户输入项原样保留");
assert.equal(folded[1].fold, true, "混排工作项合并为分组行");
assert.equal(folded[1].label, "运行了命令", "完成态工具+思考组标题取工具去向（R-01-017/AC-03）");
assert.match(folded[1].summary, /^思考一/, "组摘要携带推理文本内容（R-01-017/AC-04）");
assert.equal(folded[1].icon, "bash", "tool 组行图标为命令图标（IconApiOutline14）");
assert.equal(folded[2].kind, "assistant", "正文为独立行（硬边界不并入分组）");
assert.equal(folded[2].text, "结论正文", "正文内容保留");
assert.equal(folded[3].fold, true, "正文后的工具独立成组，不跨正文合并（R-01-017/AC-02）");
// R-01-017/AC-02 reasoning+正文同一节点：前置推理并入前组、正文为硬边界（splitThinkByBody 前置语义）
const splitNodes = new Map([
	["k", { key: "k", kind: "assistant-step", anchorSeq: 1, data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "推理前置" }, { kind: "text", text: "正文输出" }] } }],
	["q", { key: "q", kind: "tool-call", anchorSeq: 2, data: { root: { kind: "tool-result", callId: "q", call: { name: "grep", argsRaw: "{}" } } } }],
]);
const split = foldWorkGroups(
	[{ id: "k", kind: "assistant", label: "Think", text: "正文输出", summary: "推理前置", detail: "推理前置", icon: "assistant", status: "done" },
	 { id: "q", kind: "tool", toolName: "grep", label: "Grep", summary: "a", icon: "search", status: "done" }],
	4);
assert.equal(split[0].fold, true, "reasoning 先行独立成思考组");
assert.equal(split[0].label, "已思考", "纯思考完成组标题为已思考（R-01-017/AC-03）");
assert.equal(split[0].summary, "推理前置", "思考组摘要为该推理文本（R-01-017/AC-04）");
assert.equal(split[0].icon, "assistant", "思考组行图标为思考图标");
// R-01-017/AC-02 reasoning+正文同节点剥离：推理只归组摘要，正文行不得重复显示推理文本（验收修正）
assert.equal(split[1].label, "Assistant", "正文行不再复用 Think 标签");
assert.equal(split[1].text, "正文输出", "正文为独立行且内容保留");
assert.equal(split[1].summary, "正文输出", "正文行摘要为正文而非推理文本");
assert.equal(split[1].detail, null, "正文行剥离推理文本");
assert.equal(split[1].stripNative, true, "正文行跳过原生行匹配，避免原生 ReasoningRow 复现推理文本");
assert.ok(!String(split[1].summary).includes("推理"), "正文行不与组摘要重复");
assert.equal(split[2].fold, true, "正文后的工具独立成组");
// R-01-017/AC-02 验收反馈：工具组行后紧跟的同节点正文行不得与组摘要重复推理文本（东家现场场景）
const dedup = foldWorkGroups(
	[{ id: "t1", kind: "tool", toolName: "bash", label: "Bash", summary: "ls -la", icon: "bash", status: "done" },
	 { id: "k1", kind: "assistant", label: "Think", text: "这是正文", summary: "推理文本", detail: "推理文本", icon: "assistant", status: "done" }],
	4);
assert.equal(dedup[0].label, "运行了命令", "前组标题为运行了命令（R-01-017/AC-03）");
assert.equal(dedup[0].summary, "推理文本", "推理文本归组摘要（R-01-017/AC-04）");
assert.equal(dedup[0].icon, "bash", "tool 组行图标为命令图标（IconApiOutline14，与 auto-collapse chip 同源）");
assert.equal(dedup[1].label, "Assistant", "下一行为正文行而非 Think 行");
assert.equal(dedup[1].summary, "这是正文", "正文行内容不与组摘要重复");
assert.equal(dedup[1].detail, null, "正文行不携带推理文本");
// R-01-017/AC-03 运行中工具/思考标题与摘要
const runTool = foldedConversationTimeline({
	chat: { order: ["r1", "r2"], nodes: { get: (key) => new Map([
		["r1", { key: "r1", kind: "tool-call", data: { root: { kind: "tool-call", callId: "r1", call: { name: "bash", argsRaw: '{"command":"npm run build"}' } } } }],
		["r2", { key: "r2", kind: "tool-call", data: { root: { kind: "tool-call", callId: "r2", call: { name: "grep", argsRaw: '{"pattern":"x"}' } } } }],
	]).get(key) } },
});
assert.equal(runTool[0].label, "正在运行", "运行中工具组标题为正在运行");
assert.equal(runTool[0].status, "running", "运行中状态聚合");
assert.equal(runTool[0].icon, "bash", "运行中 tool 组行图标同为命令图标");
// R-01-017/AC-03 双运行成员的优先序：running tool 标题/摘要优先于 running think（评审对齐 vendor updateChip）。
const bothRunning = foldedConversationTimeline({
	chat: { order: ["br1", "br2"], nodes: { get: (key) => new Map([
		["br1", { key: "br1", kind: "tool-call", data: { root: { kind: "tool-call", callId: "br1", call: { name: "bash", argsRaw: '{"command":"make"}' } } } }],
		["br2", { key: "br2", kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "思考中\n最新想法" }] } }],
	]).get(key) } },
});
assert.equal(bothRunning[0].label, "正在运行", "tool 与 think 同时运行时标题取正在运行");
assert.equal(bothRunning[0].summary, "make", "同时运行时的组摘要取执行中工具摘要（AC-04 限定于无执行中工具的分组）");
const runThink = foldedConversationTimeline({
	chat: { order: ["rt"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "第一行\n最新行" }] } }) } },
});
assert.equal(runThink[0].label, "正在思考", "运行中思考组标题为正在思考（R-01-017/AC-03）");
assert.equal(runThink[0].summary, "最新行", "流式思考摘要取最新行（R-01-017/AC-04）");
// R-01-017/AC-03 编辑了文件 / 上下文注入 标题判定
const editGroup = foldedConversationTimeline({
	chat: { order: ["e1"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "e1", call: { name: "edit", argsRaw: "{}" } } } }) } },
});
assert.equal(editGroup[0].label, "编辑了文件", "含 Edit/Write 成员显示编辑了文件");
assert.equal(editGroup[0].icon, "bash", "编辑了文件组行图标同为命令图标");
const ctxGroup = foldedConversationTimeline({
	chat: { order: ["c1", "c2"], nodes: { get: (key) => new Map([
		["c1", { key: "c1", kind: "context", data: { content: [{ type: "text", text: "注入一" }], provenance: { role: "inject", label: "文件 /a.txt" } } }],
		["c2", { key: "c2", kind: "context", data: { content: [{ type: "text", text: "注入二" }], provenance: { role: "inject", label: "文件 /b.txt" } } }],
	]).get(key) } },
});
assert.equal(ctxGroup.length, 1, "连续 context 合并为一组（R-01-017/AC-02）");
assert.equal(ctxGroup[0].label, "上下文注入", "全 context 组标题为上下文注入（R-01-017/AC-03）");
assert.equal(ctxGroup[0].kind, "context", "context 组行 kind 复用 context 语义");
assert.equal(ctxGroup[0].icon, "context", "context 组行图标为上下文图标");
// R-01-017/AC-05 状态聚合：error > stopped > done，running 优先
const errGroup = foldedConversationTimeline({
	chat: { order: ["x1", "x2"], nodes: { get: (key) => new Map([
		["x1", { key: "x1", kind: "tool-call", data: { root: { kind: "tool-result", callId: "x1", call: { name: "edit", argsRaw: "{}" }, isError: true } } }],
		["x2", { key: "x2", kind: "tool-call", data: { root: { kind: "tool-result", callId: "x2", call: { name: "bash", argsRaw: "{}" }, isError: false } } }],
	]).get(key) } },
});
assert.equal(errGroup[0].status, "error", "任一成员错误聚合为 error");
assert.equal(errGroup[0].label, "编辑了文件", "错误组标题仍按成员构成判定");
const stopGroup = foldedConversationTimeline({
	chat: { order: ["s1"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "s1", call: { name: "bash", argsRaw: "{}" }, error: { code: "interrupted" } } } }) } },
});
assert.equal(stopGroup[0].status, "stopped", "中断成员聚合为 stopped");
const promoteFold = foldedConversationTimeline({
	chat: { order: ["p1"], nodes: { get: () => ({ key: "p1", kind: "tool-call", data: { root: { kind: "tool-result", callId: "p1", call: { name: "bash", argsRaw: '{"command":"x"}' } } } }) } },
	running: true,
});
assert.equal(promoteFold[0].status, "running", "R-01-009/AC-10 尾部提升作用于折叠分组行（R-01-017/AC-05）");
// R-01-017/AC-06 limit 截断与顺序
const manyFlat = [
	{ id: "u1", kind: "user", icon: "user", text: "hi", detail: null, status: "done" },
	{ id: "t1", kind: "tool", toolName: "bash", label: "Bash", summary: "a", icon: "bash", status: "done" },
	{ id: "b1", kind: "assistant", label: "Assistant", text: "正文一", summary: "正文一", icon: "assistant", status: "done" },
	{ id: "t2", kind: "tool", toolName: "bash", label: "Bash", summary: "b", icon: "bash", status: "done" },
	{ id: "b2", kind: "assistant", label: "Assistant", text: "正文二", summary: "正文二", icon: "assistant", status: "done" },
	{ id: "t3", kind: "tool", toolName: "grep", label: "Grep", summary: "c", icon: "search", status: "done" },
];
const manyGroups = foldWorkGroups(manyFlat, 4);
assert.equal(manyGroups.length, 4, "折叠呈现下最多显示最近 4 个分组行（R-01-017/AC-06）");
assert.equal(manyGroups[3].id, "fold:work:t3", "顺序与主窗口一致，末位为最新工作项所在组");
assert.equal(manyGroups[0].kind, "assistant", "窗口内首行为最近正文（更早的用户项与 t1 组被挤出）");
assert.equal(manyGroups[0].text, "正文一", "正文行内容保留");
const groupIdStable = foldWorkGroups(manyFlat, 4)[3];
assert.equal(groupIdStable.id, manyGroups[3].id, "分组 id 稳定供渲染层 DOM 复用");

// ---- R-01-009/AC-04 工具动作摘要镜像主会话窗口 deriveSummary 语义（可含原始命令）----
assert.equal(
	summarizeToolArguments("bash", '{"command":"rm -rf /","description":"清理目录"}'),
	"清理目录",
	"bash 摘要优先 description 参数键",
);
assert.equal(
	summarizeToolArguments("bash", '{"command":"top","cwd":"/srv"}'),
	"top",
	"bash 无 description 时展示原始命令首行（C-011）",
);
assert.equal(
	summarizeToolArguments("read", '{"path":"/srv/ops/a.log"}'),
	"/srv/ops/a.log",
	"read 摘要取 path 参数键",
);
assert.equal(
	summarizeToolArguments("web_fetch", '{"url":"https://example.com/x"}'),
	"https://example.com/x",
	"web_fetch 摘要取 url 参数键（read variant）",
);
assert.equal(
	summarizeToolArguments("read", '{"path":"/ws/src/a.ts"}', "/ws"),
	"src/a.ts",
	"工作区内绝对路径按 cwd 相对化（镜像 relativizeToCwd）",
);
assert.equal(
	summarizeToolArguments("read", '{"path":"/elsewhere/a.ts"}', "/ws"),
	"/elsewhere/a.ts",
	"工作区外路径保持原样",
);
assert.equal(
	summarizeToolArguments("read", '{"path":"/ws/src/a.ts"}'),
	"/ws/src/a.ts",
	"无 cwd 时路径原样保留",
);
assert.equal(
	summarizeToolArguments("custom_tool", '{"note":"hi"}'),
	"hi",
	"无参数键命中时取首个字符串参数值",
);
assert.equal(summarizeToolArguments("bash", "not-json{{"), "not-json{{", "不可解析参数取 argsRaw 首行（镜像原生）");
assert.equal(summarizeToolArguments("bash", 123), null, "非字符串参数返回 null");
assert.equal(summarizeToolArguments("bash", ""), null, "空参数返回 null（callId 由 timelineToolItem 补）");
assert.equal(cleanPreview("  a   b "), "a b", "摘要文本折叠空白");
assert.equal(cleanPreview("", 10), null, "空文本返回 null");
assert.equal(cleanPreview("x".repeat(100), 88)?.length, 88, "超长摘要在 88 字符内截断");

// ---- R-01-009/AC-05 输出 token 计数与速率 ----
assert.equal(fmtTokens(847), "847", "千以下原样计数");
assert.equal(fmtTokens(1200), "1.2K", "千级一位小数（大写，镜像原生）");
assert.equal(fmtTokens(51_700), "51.7K", "万级缩写");
assert.equal(fmtTokens(517_000), "517K", "缩写值百位以上取整");
assert.equal(fmtTokens(2_800_000), "2.8M", "百万级转 M（对齐主窗口统计行）");
assert.equal(fmtTokens(4_260_000), "4.3M", "M 级四舍五入");
assert.equal(fmtTokens(-1), null, "负数不展示");
assert.equal(fmtTokens(NaN), null, "非有限数不展示");
assert.deepEqual(
	runtimeStats({ outputTokens: 0, rateTokS: 0, elapsedMs: 47_000 }),
	{ elapsedMs: 47_000, outputTokens: 0, rateTokS: null },
	"零速率归一为空，token 统计仍可放在进度条下方",
);
assert.deepEqual(
	usageSummary({ uncachedInputTokens: 100, cacheReadTokens: 700, cacheWriteTokens: 200 }),
	{ inputTokens: 1_000, cacheHitPct: 70 },
	"计费输入=未缓存+读+写，命中率=读÷计费输入四舍五入（R-01-009/AC-05）",
);
assert.deepEqual(
	usageSummary({ uncachedInputTokens: 50 }),
	{ inputTokens: 50, cacheHitPct: null },
	"无缓存读桶时命中率未知不展示",
);
assert.deepEqual(
	usageSummary({ uncachedInputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }),
	{ inputTokens: 10, cacheHitPct: 0 },
	"零命中显示 0% 而非隐藏",
);
assert.deepEqual(usageSummary({}), { inputTokens: null, cacheHitPct: null }, "空 usage 归一为空");
assert.deepEqual(
	usageSummary({ uncachedInputTokens: -1, cacheReadTokens: Number.NaN }),
	{ inputTokens: null, cacheHitPct: null },
	"非法桶不计入，全非法归一为空",
);

// ---- R-01-009/AC-06 回合进度：y = t/(t+120)（t 为本回合已耗秒数，C-014）----
assert.equal(progressOf({ elapsedMs: 0 }), 0, "回合起点过原点 0%");
assert.equal(progressOf({ elapsedMs: 120_000 }), 50, "半衰期 120s 显示 50%");
assert.equal(progressOf({ elapsedMs: 360_000 }), 75, "6 分钟显示 75%");
assert.ok(progressOf({ elapsedMs: 86_400_000 }) < 100, "超长回合渐近 100% 永不到达");
const pEarly = progressOf({ elapsedMs: 30_000 });
const pLate = progressOf({ elapsedMs: 300_000 });
assert.ok(pLate > pEarly && pEarly > 0, "随已耗时单调递增且先快后慢");
assert.ok(progressOf({ elapsedMs: Number.NaN }) === 0 && progressOf({ elapsedMs: -1 }) === 0, "非法已耗时归一为 0");
assert.ok(progressOf({}) === 0, "缺省入参归一为 0");
// 注：R-01-009/AC-06 的"回合切换归零重计"由渲染层 turnTimings 新回合起点保证，属 GUI 验收项（scripts/acceptance.mjs）。

// ---- R-01-009/AC-07 工作项时间线的状态与主会话窗口语义摘要（无行级耗时，C-012）----
const statusTimeline = conversationTimeline({
	chat: {
		order: ["t1", "t2"],
		nodes: {
			get: (key) =>
				({
					t1: { key: "t1", kind: "tool-call", data: { root: { kind: "tool-result", callId: "c1", call: { name: "bash", argsRaw: '{"command":"ls","path":"/tmp"}' }, callTime: 1000, time: 3000, isError: false } } },
					t2: { key: "t2", kind: "tool-call", data: { root: { kind: "tool-result", callId: "c2", call: { name: "read", argsRaw: '{"file_path":"/a/b.txt"}' }, callTime: 4000, time: 6000, isError: true } } },
				})[key],
		},
	},
});
assert.equal(statusTimeline[0].status, "done", "成功工作项状态为 done");
assert.ok(!("durationMs" in statusTimeline[0]) && !("durationMs" in statusTimeline[1]), "工作项不携带行级耗时，对齐主会话窗口（C-012）");
assert.equal(statusTimeline[0].detail, "ls", "bash 工作项详情展示原始命令首行（C-011）");
assert.equal(statusTimeline[1].status, "error", "出错工作项状态为 error");
assert.equal(statusTimeline[1].detail, "/a/b.txt", "read 工作项详情取 file_path 参数键");
const runningTimeline = conversationTimeline({
	chat: { order: [], nodes: { get: () => undefined } },
	runningCalls: [{ callId: "rc1", name: "web_search", argsRaw: '{"query":"dsh","url":"https://x"}', turn: 1, step: 0, time: 100 }],
});
assert.equal(runningTimeline[0].status, "running", "进行中工具调用状态为 running");
assert.equal(runningTimeline[0].detail, "dsh", "进行中工具参数摘要按 search variant 参数键取 query");
// R-01-009/AC-10 重构等价性钉住（评审）：live 项存在时不提升尾部 done 项——
// 旧守卫 liveItems.length===0 与现守卫 !some(running) 在可达语义上等价
// （live 项恒为 running：partial 硬编码 running，runningCalls 无 result kind）。
const livePlusTail = conversationTimeline({
	chat: { order: ["tail"], nodes: { get: () => ({ key: "tail", kind: "tool-call", data: { root: { kind: "tool-result", callId: "tail", call: { name: "bash", argsRaw: "{}" } } } }) } },
	runningCalls: [{ callId: "rc2", name: "grep", argsRaw: "{}" }],
});
assert.equal(livePlusTail.length, 2, "live 项并入窗口尾部");
assert.equal(livePlusTail[1].id, "rc2", "尾项为 live 工具项");
assert.equal(livePlusTail[1].status, "running", "live 存在时不克隆提升尾部已定案项（等价性回归）");

// ---- R-01-009/AC-10 运行中无 live 项时尾部非用户已定案项提升为 running（agent 工作标志）----
const idleGapSnapshot = {
	chat: {
		order: ["t1"],
		nodes: { get: () => ({ key: "t1", kind: "tool-call", data: { root: { kind: "tool-result", callId: "c1", call: { name: "read", argsRaw: '{"path":"/tmp/a"}' }, callTime: 10, time: 35, isError: false } } }) },
	},
	running: true,
	pending: [],
};
const idleGapTimeline = conversationTimeline(idleGapSnapshot);
assert.equal(idleGapTimeline[0].status, "running", "运行中无 live 项时尾部已定案工具项提升为 running");
const idleGapSettled = conversationTimeline({ ...idleGapSnapshot, running: false });
assert.equal(idleGapSettled[0].status, "done", "非运行中尾部已定案项保持 done");
assert.notEqual(idleGapTimeline[0], idleGapSettled[0], "提升产出克隆而非复用原引用");
const pendingIdle = conversationTimeline({ ...idleGapSnapshot, pending: [{ kind: "approval" }] });
assert.equal(pendingIdle[0].status, "done", "等待用户行动时尾部不提升");
const errorTail = conversationTimeline({
	chat: { order: ["t"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "c2", call: { name: "bash", argsRaw: '{"command":"bad"}' }, isError: true } } }) } },
	running: true,
});
assert.equal(errorTail[0].status, "error", "尾部 error 项不提升，错误标识优先");
const stoppedTail = conversationTimeline({
	chat: { order: ["t"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "c3", call: { name: "bash", argsRaw: '{"command":"sleep 9"}' }, isError: true, error: { code: "interrupted" } } } }) } },
	running: true,
});
assert.equal(stoppedTail[0].status, "stopped", "尾部 stopped 项不提升");
const userTail = conversationTimeline({
	chat: { order: ["u"], nodes: { get: () => ({ kind: "user", data: { content: [{ type: "text", text: "任务" }] } }) } },
	running: true,
});
assert.equal(userTail[0].status, "done", "尾部用户输入项保持 done（提升不适用）");
const liveTailUnchanged = conversationTimeline({ ...idleGapSnapshot, runningCalls: [{ callId: "rc9", name: "grep", argsRaw: '{"pattern":"x"}', turn: 1, step: 0 }] });
assert.equal(liveTailUnchanged.map((item) => item.status).join(","), "done,running", "live 项存在时不额外提升已定案项");
const midRunningTimeline = conversationTimeline({
	chat: {
		order: ["a", "t"],
		nodes: {
			get: (key) =>
				key === "a"
					? { key: "a", kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "text", text: "输出中" }] } }
					: { key: "t", kind: "tool-call", data: { root: { kind: "tool-result", callId: "c4", call: { name: "read", argsRaw: '{"path":"/tmp/b"}' }, isError: false } } },
		},
	},
	running: true,
});
assert.deepEqual(midRunningTimeline.map((item) => item.status), ["running", "done"], "时间线已存在执行中项时尾部不再提升");
assert.equal(mergeTraceStatus("running", "ok"), "running", "核心派生 running 优先于原生行 ok（R-01-009/AC-10）");
assert.equal(mergeTraceStatus("done", "ok"), "done", "原生 ok 归 done 的旧语义保持");
assert.equal(mergeTraceStatus("done", "running"), "running", "核心非 running 时原生 running 仍生效（旧语义）");
assert.equal(mergeTraceStatus("error", "error"), "error", "核心 error 不被原生覆盖");
assert.equal(mergeTraceStatus(undefined, "error"), "error", "核心状态缺省时退让原生态");
assert.equal(mergeTraceStatus(undefined, ""), "running", "双缺省兜底 running 的旧语义保持");

// ---- R-01-012/AC-03 fallback 文字镜像原生 keyed/通用行，选中/非选中态不漂移 ----
const todoItem = conversationTimeline({
	chat: { order: ["td"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "td1", call: { name: "todo_write", argsRaw: '{"todos":[{"content":"写代码","status":"completed"},{"content":"写测试","status":"in_progress"},{"content":"部署","status":"pending"}]}' }, isError: false } } }) } },
})[0];
assert.equal(todoItem.label, "更新任务清单", "todo_write 标题镜像原生 keyed 行");
assert.equal(todoItem.detail, "1/3 已完成 · 写测试", "todo_write 摘要复刻原生进度文案");
const askRunning = conversationTimeline({
	chat: { order: [], nodes: { get: () => undefined } },
	runningCalls: [{ callId: "q1", name: "ask_user_question", argsRaw: '{"questions":[]}', turn: 1, step: 0 }],
})[0];
assert.equal(askRunning.label, "提问", "ask_user_question 标题镜像原生 keyed 行");
assert.equal(askRunning.detail, "等待回答", "ask 进行中摘要镜像原生等待文案");
const askAnswered = conversationTimeline({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q2", call: { name: "ask_user_question", argsRaw: "{}" }, isError: false, content: [{ type: "text", text: '{"answers":[{"selected":["a"]},{"selected":[],"custom":""}]}' }] } } }) } },
})[0];
assert.equal(askAnswered.detail, "1/2 已回答", "ask 定案摘要复刻原生已答计数");
const askAnsweredMultiBlock = conversationTimeline({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q2m", call: { name: "ask_user_question", argsRaw: "{}" }, isError: false, content: [{ type: "text", text: '{"answers":[{"selected":["a"]},' }, { type: "text", text: '{"selected":[]}]}' }] } } }) } },
})[0];
assert.equal(askAnsweredMultiBlock.detail, "1/2 已回答", "ask 多块结果文本以空串拼接解析（镜像原生 join 语义）");
const askCancelled = conversationTimeline({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q3", call: { name: "ask_user_question", argsRaw: "{}" }, isError: true, error: { name: "AskError", code: "ASK_CANCELLED" } } } }) } },
})[0];
assert.equal(askCancelled.detail, "已取消", "ask 取消摘要镜像原生");
assert.equal(askCancelled.status, "error", "ask 取消保持 error 状态");
const askAborted = conversationTimeline({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q4", call: { name: "ask_user_question", argsRaw: "{}" }, isError: true, error: { name: "AskError", code: "ASK_ABORTED" } } } }) } },
})[0];
assert.equal(askAborted.detail, "已中断", "ask 中断摘要镜像原生");
assert.equal(askAborted.status, "stopped", "ask 中断状态归 stopped（镜像原生）");
const unknownTool = conversationTimeline({
	chat: { order: ["x"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "x1", call: { name: "my_mcp_tool", argsRaw: '{"note":"hi"}' } } } }) } },
})[0];
assert.equal(unknownTool.label, "Tool call", "未知工具标题镜像原生 others variant");
assert.equal(unknownTool.detail, "my_mcp_tool · hi", "未知工具摘要带 `工具名 · ` 前缀（镜像原生）");
const cordisDefine = conversationTimeline({
	chat: { order: ["cd"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "cd1", call: { name: "cordis_define", argsRaw: '{"name":"my-plugin"}' } } } }) } },
})[0];
assert.equal(cordisDefine.label, "注册 Cordis 插件", "cordis_define 标题镜像原生 keyed 行");
assert.equal(cordisDefine.detail, "my-plugin", "cordis_define 摘要取插件名参数（keyed 行无前缀）");
const failedBash = conversationTimeline({
	chat: { order: ["f"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "f1", call: { name: "bash", argsRaw: '{"command":"bad","description":"跑坏命令"}' }, isError: true, content: [{ type: "text", text: "boom happened\nstack line" }] } } }) } },
})[0];
assert.equal(failedBash.status, "error", "失败 bash 状态为 error");
assert.equal(failedBash.detail, "boom happened", "错误态摘要取结果输出首行（镜像原生 errorSummary）");
const interruptedBash = conversationTimeline({
	chat: { order: ["i"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "i1", call: { name: "bash", argsRaw: '{"command":"sleep 9"}' }, isError: true, error: { name: "Error", code: "interrupted" } } } }) } },
})[0];
assert.equal(interruptedBash.status, "stopped", "interrupted 归 stopped（镜像原生）");
assert.equal(interruptedBash.detail, "sleep 9", "stopped 不套用错误首行，保持参数摘要");
const thinkSettled = conversationTimeline({
	chat: { order: ["th"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "第一段\n第二段" }] } }) } },
})[0];
assert.equal(thinkSettled.summary, "第一段", "Think 摘要镜像原生 firstLine");
const thinkStreaming = conversationTimeline({
	chat: { order: ["th"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "第一段\n进行中段" }] } }) } },
})[0];
assert.equal(thinkStreaming.summary, "进行中段", "流式 Think 摘要镜像原生 latestLine");
const contextItem = conversationTimeline({
	chat: { order: ["cx"], nodes: { get: () => ({ kind: "context", data: { content: [{ type: "text", text: "<system_prompt>…</system_prompt>" }], source: { kind: "agent-instructions", changes: [{ path: "AGENTS.md" }] }, provenance: { role: "inject", label: "AGENTS.md" } } }) } },
})[0];
assert.equal(contextItem.label, "上下文注入", "context 工作项标题镜像原生 ContextInjectionRow（注入）");
assert.equal(contextItem.summary, "AGENTS.md", "context 工作项摘要为来源标识而非注入内容原文");
const contextRecall = conversationTimeline({
	chat: { order: ["cx"], nodes: { get: () => ({ kind: "context", data: { content: [{ type: "text", text: "召回内容" }], provenance: { role: "recall", label: "旧会话" } } }) } },
})[0];
assert.equal(contextRecall.label, "跨会话召回", "context 工作项标题镜像原生召回文案");
const contextNoProvenance = conversationTimeline({
	chat: { order: ["cx"], nodes: { get: () => ({ kind: "context", data: { content: [{ type: "text", text: "<system_prompt>…</system_prompt>" }] } }) } },
})[0];
assert.equal(contextNoProvenance.label, "上下文注入", "provenance 缺失时回退注入标题（镜像原生 unreadable 兜底）");
assert.equal(contextNoProvenance.summary, "", "无来源标识时摘要为空，注入内容原文不上卡");
// R-01-012/AC-02
const unlocatedPartial = conversationTimeline({
	chat: {
		order: ["a", "u"],
		nodes: {
			get: (key) =>
				key === "a"
					? { key: "a", kind: "assistant-step", data: { blocks: [{ kind: "text", text: "旧回复" }] } }
					: { key: "u", kind: "user", data: { content: [{ type: "text", text: "问题" }] } },
		},
	},
	partial: { blocks: [{ kind: "text", text: "流式中" }] },
});
assert.deepEqual(
	unlocatedPartial.map((item) => item.text),
	["旧回复", "问题", "流式中"],
	"partial 定位缺省（无 turn/step）时不误摘除无定位 assistant 节点",
);
// R-01-012/AC-02
assert.deepEqual(conversationTimeline(chatSnapshot, 0), [], "limit=0 返回空时间线");
assert.deepEqual(
	conversationTimeline({ chat: { order: [], nodes: { get: () => undefined } } }),
	[],
	"空 order 返回空时间线",
);
// R-01-013/AC-03、R-01-013/AC-04
assert.deepEqual(
	messagePreviews({
		snapshot: {
			chat: {
				order: ["s", "a"],
				nodes: {
					get: (key) =>
						key === "s"
							? { key, kind: "steering", data: { content: [{ type: "text", text: "补充指令" }] } }
							: { key, kind: "assistant-step", data: { blocks: [{ kind: "text", text: "已定案回复" }] } },
				},
			},
		},
	}),
	{ userPreview: "补充指令", agentPreview: "已定案回复" },
	"steering 消息按用户语义取物理首行",
);
assert.deepEqual(
	messagePreviews({
		snapshot: {
			chat: {
				order: ["u", "a"],
				nodes: {
					get: (key) =>
						key === "u"
							? { key, kind: "user", data: { content: [{ type: "text", text: "" }] } }
							: { key, kind: "assistant-step", data: { blocks: [] } },
				},
			},
		},
	}),
	{ userPreview: "", agentPreview: "" },
	"空文本项不产生预览",
);
assert.equal(
	messagePreviews({
		snapshot: {
			chat: {
				order: ["a"],
				nodes: { get: () => ({ kind: "assistant-step", data: { blocks: [{ kind: "text", text: "已定案回复" }] } }) },
			},
			partial: { turn: 1, step: 0, blocks: [] },
		},
	}).agentPreview,
	"已定案回复",
	"partial 为空块时回退已定案回复，不被空 live 项遮蔽",
);
// R-01-013/AC-03、R-01-013/AC-04
assert.deepEqual(
	messagePreviews({
		history: [
			{ event: { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "更早的用户消息" }] } } },
			{ event: { type: "assistant/message", data: { message: { content: [{ type: "text", text: "更早的回复" }] } } } },
			{ event: { type: "tool/call", data: { callId: "c1", name: "bash", arguments: "{}" } } },
		],
	}),
	{ userPreview: "更早的用户消息", agentPreview: "更早的回复" },
	"深翻累计事件：尾页无消息时预览取自更早页",
);
assert.deepEqual(
	messagePreviews({
		history: [
			{ event: { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "更早的用户消息" }] } } },
			{ event: { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "最新的用户消息" }] } } },
			{ event: { type: "assistant/message", data: { message: { content: [{ type: "text", text: "最新的回复" }] } } } },
		],
	}),
	{ userPreview: "最新的用户消息", agentPreview: "最新的回复" },
	"深翻累计事件：新页消息不被旧页遮蔽",
);

// ---- R-01-014/AC-05、R-01-013/AC-03、AC-04 深翻页序列、有界与部分失败保留 ----
const pageOf = (events, hasMore) => ({ events, hasMore });
const userEvent = (seq, text) => ({ event: { type: "user/message", seq, data: { source: { kind: "user" }, content: [{ type: "text", text }] } } });
const agentEvent = (seq, text) => ({ event: { type: "assistant/message", seq, data: { message: { content: [{ type: "text", text }] } } } });
const toolEvent = (seq) => ({ event: { type: "tool/call", seq, data: { callId: `c${seq}`, name: "bash", arguments: "{}" } } });
{
	const calls = [];
	const fetchPage = async (beforeSeq) => {
		calls.push(beforeSeq);
		return pageOf([userEvent(1, "用户"), agentEvent(2, "回复")], true);
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(calls.length, 1, "尾页含消息时一页即止，不深翻");
	assert.equal(result.error, null, "成功路径无 error");
}
{
	const calls = [];
	const fetchPage = async (beforeSeq) => {
		calls.push(beforeSeq);
		if (calls.length === 1) return pageOf([toolEvent(10)], true);
		return pageOf([userEvent(1, "更早用户"), agentEvent(2, "更早回复")], false);
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(calls.length, 2, "尾页无消息时向前深翻");
	assert.deepEqual(calls[1], 10, "beforeSeq 取上页页首事件 seq");
	assert.deepEqual(
		messagePreviews({ history: result.events }),
		{ userPreview: "更早用户", agentPreview: "更早回复" },
		"深翻后预览取自更早页",
	);
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return pageOf([toolEvent(100 - calls)], true);
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(calls, 3, "深翻最多 maxPages 页即止");
	assert.equal(result.events.length, 3, "已翻事件全部保留");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return pageOf([toolEvent(calls)], false);
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(calls, 1, "hasMore=false 即止");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		if (calls === 2) throw new Error("network");
		return pageOf([toolEvent(calls)], true);
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(result.events.length, 1, "深翻中途失败保留已得事件");
	assert.ok(result.error instanceof Error, "失败以 error 返回供降级展示");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return calls === 1 ? pageOf([toolEvent(1)], true) : null;
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(calls, 2, "业务错误（null）即停止");
	assert.equal(result.events.length, 1, "业务错误前已得事件保留");
}

// ---- R-02-003/AC-01 富卡字段并入签名后，进度/轨迹变化必触重重绘 ----
assert.notEqual(
	cardSignature([...entries, { ...entries[0], progress: 42 }]),
	cardSignature(entries),
	"progress 变化签必变",
);
assert.notEqual(
	cardSignature([...entries, { ...entries[0], timeline: [{ id: "x", label: "Read" }] }]),
	cardSignature(entries),
	"工作项时间线变化签名必变",
);
assert.notEqual(
	cardSignature([...entries, { ...entries[0], outputTokens: 42 }]),
	cardSignature(entries),
	"token 统计变化签名必变",
);
assert.notEqual(
	cardSignature([{ ...entries[0], cacheHitPct: 88 }, ...entries.slice(1)]),
	cardSignature(entries),
	"缓存命中率变化签名必变",
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

// ---- R-01-002/AC-05、R-01-010/AC-06 响应保持：打开的完成提醒会话仍为当前会话时，保持活动卡位置与"需要响应"呈现 ----
const holdBase = { id: "sB", displayTitle: "旧B", running: false, updatedAt: NOW - 1_000 };
// 帧间登记：上一帧完成提醒的会话成为当前会话（覆盖宿主同帧切换 current 并清除 completed 的原子时序）。
let held = updateCompletedHolds(new Set(), { ids: ["sB"], byId: { sB: { ...holdBase, completed: true } }, current: "sA" }, []);
assert.deepEqual([...held], [], "完成提醒会话未被打开时不登记保持");
held = updateCompletedHolds(held, { ids: ["sB"], byId: { sB: { ...holdBase, completed: false } }, current: "sB" }, ["sB"]);
assert.deepEqual([...held], ["sB"], "完成提醒会话被打开即登记保持（宿主原子帧时序）");
// 同帧登记：宿主先切 current、completed 尚未清除的时序。
assert.deepEqual(
	[...updateCompletedHolds(new Set(), { ids: ["sB"], byId: { sB: { ...holdBase, completed: true } }, current: "sB" }, [])],
	["sB"],
	"completed 与 current 同帧命中同样登记保持",
);
// 保持期间：活动区以 awaiting「需要响应」呈现并高亮当前，历史区排除，分区不变量不破。
const holdSnap = { ids: ["sB"], byId: { sB: { ...holdBase, completed: false } }, current: "sB" };
const heldEntries = buildEntries(holdSnap, [], {}, held);
assert.deepEqual(
	heldEntries.map((e) => [e.id, e.kind, e.pendingText, e.isCurrent]),
	[["sB", "awaiting", "需要响应", true]],
	"保持中会话以 awaiting「需要响应」留在活动区且保持当前高亮",
);
assert.deepEqual(
	awaitBadgeStats(heldEntries),
	{ waiting: 1, total: 1 },
	"响应保持中会话计入徽标等待分子（n 统计口径含响应保持）",
);
// 保持中发消息转 running：按运行中呈现。
const holdRunning = buildEntries({ ids: ["sB"], byId: { sB: { ...holdBase, running: true } }, current: "sB" }, [], {}, held);
assert.equal(holdRunning[0].kind, "running", "保持中会话开始运行时按运行中呈现");
// 用户一直停留在该会话：保持不解除；current 暂缺（导航瞬时态）同样不解除。
held = updateCompletedHolds(held, holdSnap, []);
assert.deepEqual([...held], ["sB"], "当前会话不变时保持不解除");
held = updateCompletedHolds(held, { ...holdSnap, current: null }, []);
assert.deepEqual([...held], ["sB"], "current 暂缺时不解除保持");
// 当前会话切走：解除保持，会话落入历史区。
held = updateCompletedHolds(
	held,
	{ ids: ["sA", "sB"], byId: { sA: { id: "sA", displayTitle: "主A", running: true }, sB: { ...holdBase, completed: false } }, current: "sA" },
	[],
);
assert.deepEqual([...held], [], "当前会话切走后解除保持");
assert.deepEqual(
	buildRecent(holdSnap, [], NOW, undefined, {}, [], held).map((e) => e.id),
	["sB"],
	"解除保持后会话进入历史区",
);
// 会话行消失：保持记账清理。
assert.deepEqual([...updateCompletedHolds(new Set(["sB"]), { ids: [], byId: {}, current: null }, [])], [], "会话行消失时保持记账清理");
// 列表快照在途/缺失（loading）时保持记账原样保留，不因瞬时 byId 缺失误解除。
assert.deepEqual([...updateCompletedHolds(new Set(["sB"]), undefined, [])], ["sB"], "列表快照缺失时保持记账保留");
assert.deepEqual([...updateCompletedHolds(new Set(["sB"]), { phase: "pending" }, [])], ["sB"], "列表快照在途时保持记账保留");
// 子代理不进入保持（完成提醒语义仅主会话）。
assert.deepEqual(
	[
		...updateCompletedHolds(
			new Set(),
			{ ids: ["m", "m-c1"], byId: { m: { id: "m", displayTitle: "主M", running: false }, "m-c1": { id: "m-c1", displayTitle: "子S", running: false, completed: true, parentId: "m" } }, current: "m-c1" },
			[],
		),
	],
	[],
	"子代理 completed 同帧命中也不登记保持",
);

// ---- R-01-016/AC-01、AC-02 非运行活动卡条目承载会话最后已知工作项时间线（数据路径）----
const settledTrace = [{ id: "w1", kind: "tool", label: "Bash", summary: "pnpm check", status: "done" }];
const awaitingTraceEntries = buildEntries(holdSnap, [], { sB: { timeline: settledTrace } }, new Set(["sB"]));
assert.equal(awaitingTraceEntries[0].kind, "awaiting", "响应保持中会话以 awaiting 卡呈现");
assert.deepEqual(awaitingTraceEntries[0].timeline, settledTrace, "awaiting 条目承载会话最近工作项时间线（R-01-016/AC-01）");
const pendingTraceEntries = buildEntries(pendingSnap, [], { sP: { timeline: settledTrace } });
assert.equal(pendingTraceEntries[0].kind, "awaiting", "待确认会话以 awaiting 卡呈现");
assert.deepEqual(pendingTraceEntries[0].timeline, settledTrace, "待确认 awaiting 条目同样承载时间线（R-01-016/AC-01）");
const parentTraceEntries = buildEntries(inheritedActivity, [], { root: { timeline: settledTrace }, parent: { timeline: settledTrace } });
assert.deepEqual(
	parentTraceEntries.filter((entry) => entry.kind === "parent").map((entry) => entry.timeline),
	[settledTrace, settledTrace],
	"parent 条目承载母会话最近工作项时间线（R-01-016/AC-02）",
);

// ---- R-01-010/AC-06 响应保持扩展：当前焦点下运行结束（宿主不置 completed）同样保持 ----
const focusRun = { ids: ["sB"], byId: { sB: { ...holdBase, running: true, completed: false } }, current: "sB" };
let heldFocus = updateCompletedHolds(new Set(), focusRun, ["sB"]);
assert.deepEqual([...heldFocus], [], "仍在运行时不登记保持（isOwnActiveRow 守卫）");
const focusDone = { ids: ["sB"], byId: { sB: { ...holdBase, running: false, completed: false } }, current: "sB" };
heldFocus = updateCompletedHolds(heldFocus, focusDone, ["sB"]);
assert.deepEqual([...heldFocus], ["sB"], "当前焦点下运行结束即登记保持");
assert.deepEqual(
	buildEntries(focusDone, [], {}, heldFocus).map((e) => [e.id, e.kind, e.pendingText, e.isCurrent]),
	[["sB", "awaiting", "需要响应", true]],
	"焦点下结束的会话以「需要响应」留在活动区",
);
assert.equal(buildRecent(focusDone, [], NOW, undefined, {}, [], heldFocus).length, 0, "焦点下结束的会话不入历史区");
assert.deepEqual(
	[...updateCompletedHolds(new Set(), { ids: ["sB"], byId: { sB: { ...holdBase, running: false, completed: true } }, current: "sA" }, ["sB"])],
	[],
	"非当前会话结束不登记保持（走宿主 completed 完成提醒路径）",
);
// 等待项（待确认/待审查）在焦点下被解除转空闲：同属自身活动变为非活动，同样登记保持。
const pendingWait = { ids: ["sB"], byId: { sB: { ...holdBase, running: false, completed: false, pendingInteraction: { kind: "approval" } } }, current: "sB" };
let heldPending = updateCompletedHolds(new Set(), pendingWait, ["sB"]);
assert.deepEqual([...heldPending], [], "等待未解除时不登记保持（isOwnActiveRow 守卫）");
heldPending = updateCompletedHolds(heldPending, focusDone, ["sB"]);
assert.deepEqual([...heldPending], ["sB"], "焦点下解除等待转空闲同样登记保持");
assert.deepEqual(
	[
		...updateCompletedHolds(
			new Set(),
			{
				ids: ["m", "m-c1"],
				byId: {
					m: { id: "m", displayTitle: "主M", running: false },
					"m-c1": { id: "m-c1", displayTitle: "子S", running: false, parentId: "m" },
				},
				current: "m-c1",
			},
			["m-c1"],
		),
	],
	[],
	"子代理在焦点下结束不登记保持",
);

// ---- R-01-010/AC-07 活动区→历史区迁移判定 ----
assert.deepEqual(
	movedToRecentIds(new Set(["sA", "sB"]), [{ id: "sA" }], [{ id: "sB" }]),
	["sB"],
	"上一帧活动区 id 离开活动区且出现于历史区判定为迁移",
);
assert.deepEqual(movedToRecentIds(new Set(["sB"]), [], []), [], "彻底消失（归档/滑出历史窗口）不判定为迁移");
assert.deepEqual(movedToRecentIds(new Set(), [{ id: "sB" }], []), [], "上一帧不在活动区不判定为迁移");
assert.deepEqual(movedToRecentIds(new Set(["sB"]), [{ id: "sB" }], []), [], "仍在活动区不判定为迁移");

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

// ---- R-01-010/AC-01 归档会话不入最近历史（不可选中，列出即成死卡） ----
const recentArchived = buildRecent(
	{
		ids: ["sKeep", "sGone"],
		byId: {
			sKeep: { id: "sKeep", displayTitle: "保留K", running: false, completed: false, updatedAt: NOW - 1_000 },
			sGone: { id: "sGone", displayTitle: "归档G", running: false, completed: false, updatedAt: NOW - 500 },
		},
		current: null,
	},
	[],
	NOW,
	undefined,
	{},
	["sGone"],
);
assert.deepEqual(
	recentArchived.map((e) => e.id),
	["sKeep"],
	"归档会话即使在 24h 窗口内也不入最近历史",
);
assert.deepEqual(
	buildRecent(
		{
			ids: ["sKeep", "sGone"],
			byId: {
				sKeep: { id: "sKeep", displayTitle: "保留K", running: false, completed: false, updatedAt: NOW - 1_000 },
				sGone: { id: "sGone", displayTitle: "归档G", running: false, completed: false, updatedAt: NOW - 500 },
			},
			current: null,
		},
		[],
		NOW,
		undefined,
		{},
		new Set(["sGone"]),
	).map((e) => e.id),
	["sKeep"],
	"归档集同样接受 Set 形态",
);

// ---- R-01-014/AC-01 列表在途显示加载指示而非空态 ----
assert.equal(listLoadState(null), "loading", "快照缺失视为列表在途");
assert.equal(listLoadState({ phase: "pending" }), "loading", "phase 为 pending 视为列表在途");
assert.equal(listLoadState({ phase: "ready" }), "ready", "phase 为 ready 才允许空态");
assert.equal(listLoadState({ phase: "ready", state: "error" }), "error", "列表错误轴归一为 error");
assert.equal(listLoadState({ phase: "ready", error: { code: "x" } }), "error", "携带 error 字段归一为 error");

// ---- R-01-014/AC-05 补充数据失败降级为空字段并可重试 ----
// （行为链详见 R-01-012/AC-01 的 detailLoadPlan 锚点：失败置空 → 可见期内不热重试 →
//  离开可见清理 → 重回可见允许重试。）
assert.equal(detailLoadPlan({ detail: { model: { model: "", reasoning: "" } } }).model, false, "失败置空即降级为空字段");

// ---- R-01-015/AC-02 拖拽宽度夹取 ｜ R-01-015/AC-04 持久化恢复归一 ----
assert.equal(clampPaneWidth(280), 280, "范围内宽度原样保留");
assert.equal(clampPaneWidth(199.6), 200, "拖拽越过下界夹取到最小 200px");
assert.equal(clampPaneWidth(480.4), 480, "拖拽越过上界夹取到最大 480px");
assert.equal(clampPaneWidth("360"), 360, "localStorage 字符串宽度解析恢复");
assert.equal(clampPaneWidth(null), 280, "无持久化记录回退默认 280px");
assert.equal(clampPaneWidth(""), 280, "空串回退默认 280px");
assert.equal(clampPaneWidth("abc"), 280, "非法持久化值回退默认 280px");
assert.equal(clampPaneWidth(999), 480, "越界持久化值夹取进允许范围");
assert.equal(clampPaneWidth(-5), 200, "负值持久化值夹取到最小 200px");

// ---- 重建 client bundle 并校验产物契约 ----
await mkdir(join(root, ".dsh-plugin"), { recursive: true });
execFileSync(process.execPath, [join(root, "scripts/build-client.mjs")], {
	cwd: root,
	stdio: "pipe",
});
const bundle = await readFile(join(root, ".dsh-plugin/client.js"), "utf8");
const clientSource = await readFile(join(root, "src/client.mjs"), "utf8");
// bundle 必须是可解析的合法 JS（new Function 只编译不执行）——防止 CSS 模板内
// 误插反引号这类"字符串检查能过、但 loader 导入即失败"的损坏。
assert.doesNotThrow(
	() => new Function(bundle),
	"bundle 必须是合法 JS（可被 loader 导入注册）",
);
assert.ok(!bundle.includes("sessionsListHas"), "点击不得以第二份 list 快照提前拦截");
assert.ok(!bundle.includes('document.addEventListener("click"'), "不得在 document 上拦截点击");
// R-01-008/AC-02 移动端抽屉经标题行整体激活收起（与桌面同一控件，无独立 × 按钮）
assert.ok(!bundle.includes("dap-close") && !bundle.includes("onCloseClick"), "不再保留独立关闭按钮：移动端与桌面同为标题行整体控件（R-01-008/AC-02）");
assert.ok(
	clientSource.includes("const onHeaderActivate = () => {\n\t\t\tif (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT})`).matches) {\n\t\t\t\ttogglePane(false);"),
	"移动端断点标题行激活即收起抽屉，而非折叠窄条（R-01-008/AC-02、R-01-011/AC-06）",
);
assert.ok(!/\.dap-collapse-hint \{\s*display: none/.test(bundle), "方向符号 « 两端断点一致呈现（R-01-008/AC-02）");
// R-01-011/AC-03 标题行整体作为桌面收起控件（无独立按钮）
assert.ok(bundle.includes('class="dap-header" role="button"'), "标题行整体作为可激活控件");
assert.ok(bundle.includes('header?.addEventListener("click", onHeaderActivate)'), "标题行绑定 click 收起");
assert.ok(bundle.includes('header?.addEventListener("keydown", onHeaderKeydown)'), "标题行支持 Enter/Space 键盘激活");
assert.ok(!bundle.includes("onCollapseClick") && !bundle.includes('class="dap-collapse"'), "不再保留独立收起按钮：标题行整体承担折叠");
// R-01-011/AC-04 折叠窄条竖排标题 + 计数、整体可点
assert.ok(bundle.includes('class="dap-rail-title"'), "折叠窄条显示竖排标题");
assert.ok(bundle.includes("writing-mode: vertical-rl"), "窄条标题竖排呈现");
assert.ok(/\.dap-rail \{[^]*?flex: 1;/.test(bundle), "窄条撑满窗格高度，整面均为展开命中区");
assert.ok(bundle.includes('[data-collapsed="true"] .dap-rail:hover,'), "折叠窄条悬停/聚焦高亮，与展开态标题行反馈对等");
// R-01-011/AC-06 移动端标题行激活解释为收起抽屉
assert.ok(bundle.includes("matchMedia(`(max-width: ${MOBILE_BREAKPOINT})`)"), "标题行收起经移动断点门控");
assert.ok(bundle.includes('rail?.addEventListener("click", onRailClick)'), "折叠窄条绑定自身 click");
assert.ok(bundle.includes('class="dap-rail" type="button"'), "折叠窄条使用原生 button 语义");
// R-01-015/AC-01 拖拽手柄实时调宽、主会话弹性让位
assert.ok(bundle.includes('class="dap-resize" aria-hidden="true"'), "窗格右缘提供拖拽调宽手柄");
assert.ok(bundle.includes('resize?.addEventListener("pointerdown", onResizeDown)'), "拖拽手柄绑定 pointerdown");
assert.ok(bundle.includes('resize.addEventListener("pointermove", onResizeMove)'), "拖拽经 pointermove 实时调宽");
assert.ok(bundle.includes('pane.style.setProperty("--dap-width", `${paneWidth}px`)'), "拖拽实时写入 --dap-width 令主会话弹性让位");
assert.ok(bundle.includes("resize.setPointerCapture(event.pointerId)"), "拖拽经 pointer capture 跟踪指针");
assert.ok(bundle.includes("resizeNotifyHandle = requestAnimationFrame("), "拖拽期间经 rAF 合帧派发 resize 通知（overlay 实时跟随）");
// R-01-015/AC-02 拖拽目标宽度经夹取
assert.ok(bundle.includes("clampPaneWidth(startWidth + move.clientX - startX)"), "拖拽目标宽度经 clampPaneWidth 夹取 200–480px");
// R-01-015/AC-03 折叠窄条与移动端抽屉不提供拖拽
assert.ok(bundle.includes('[data-collapsed="true"] .dap-resize { display: none; }'), "折叠窄条不提供拖拽调宽");
assert.ok(bundle.includes("[data-dsh-activity-pane] .dap-resize { display: none; }"), "移动端抽屉不提供拖拽调宽");
// R-01-015/AC-04 调宽持久化与启动恢复
assert.ok(bundle.includes("localStorage.getItem(WIDTH_STORAGE_KEY)"), "启动读取持久化宽度恢复");
assert.ok(bundle.includes("writeStoredPaneWidth(paneWidth)"), "拖拽结束写入持久化宽度");
assert.ok(bundle.includes('resize?.removeEventListener("pointerdown", onResizeDown)'), "unbind 移除拖拽监听（R-02-003/AC-02）");
assert.ok(bundle.includes("unbindPaneControls"), "窗格控制监听可清理");
assert.ok(bundle.includes("notifyLayoutChange"), "布局变化通知 sibling overlay 重测");
assert.ok(bundle.includes('window.dispatchEvent(new Event("resize"))'), "布局变化派发标准 resize 通知");
assert.ok(bundle.includes("pane !== renderedPane"), "新窗格实例必须重置渲染签名");
// R-01-013/AC-02 回归：卡片标题必须随快照更新——单卡渲染异常不得冻结其余卡片
// （此前渲染签名先于卡片循环提交且无异常隔离，故障卡及其后全部卡片永久滞留旧标题，
//  历史卡因此停在首条消息形态的 fallback 标题，与左侧栏脱节）。
assert.ok(
	clientSource.includes("if (renderOk) {\n\t\t\tlastSig = sig;") && !/if \(sig === lastSig\) return;\s*lastSig = sig;/.test(clientSource),
	"渲染签名仅在整轮卡片渲染成功后提交，不得在卡片循环前预先提交",
);
assert.equal(
	(clientSource.match(/logCardRenderError\(entry\.id, error\)/g) ?? []).length,
	2,
	"活动区与历史区卡片渲染均须逐卡 try/catch 异常隔离并上报",
);
assert.ok(bundle.includes("openRetryStates"), "跳转重试链必须可合并并清理");
assert.ok(bundle.includes("shouldCancelOpenRetry"), "打开重试链经统一取消判定防止过期链条拽回会话");
assert.ok(bundle.includes("escapeCssString"), "卡片定位选择器经统一转义");
assert.ok(!clientSource.includes("value.partial"), "history 响应不读取不存在的 partial 字段（宿主契约为 events/hasMore/projections）");
assert.ok(!clientSource.includes("timelineUserMessages"), "不重新引入 C-007/C-008 否决的 timelineUserMessages 投影");
assert.ok(bundle.includes("isSubagentRow(byId[id], byId)"), "子代理跳过必被 agent-busy 拒绝的 models 读取");
assert.ok(
	bundle.includes("let rec = reuseMap.get(entry.id);"),
	"renderCardIntoList 必须先取复用记录再判空：丢失该行会让 rec 未声明抛 ReferenceError，逐卡 catch 吞掉后整区空白",
);
assert.ok(
	!bundle.includes("[data-dsh-activity-pane] .dap-rail {\n  position: absolute;"),
	"折叠态展开按钮 .dap-rail 不得被绝对定位：撞名规则会把按钮压成 1px 竖线，折叠态窗格整体空白",
);
assert.ok(
	!bundle.includes("list.appendChild(rec.el)"),
	"渲染不得无条件 appendChild 移动卡片：卡片瞬时脱离文档会让浏览器取消按下/抬起之间的 click、让焦点卡失焦、丢失悬停态（会话活跃期高频渲染时窗格整体不响应）",
);
assert.ok(
	bundle.includes("list.insertBefore(rec.el, ref)"),
	"卡片仅在顺序/归属变化时移动 DOM（insertBefore 位置守卫）",
);
// ---- R-01-009/AC-02、R-01-009/AC-05、R-01-012/AC-01..04、R-01-013/AC-01..06 ----
assert.ok(bundle.includes("conversationTimeline"), "活动卡使用主会话 ChatSnapshot 工作项时间线");
assert.ok(!bundle.includes("dap-trace-time"), "工作项时间线不渲染行级耗时元素，对齐主会话窗口（R-01-009/AC-07、C-012）");
assert.ok(!bundle.includes("PROGRESS_THINK_BASE") && !bundle.includes("progressFloor"), "回合进度纯时间驱动，无思考基线/单调下限残留（R-01-009/AC-06、C-014）");
// R-01-009/AC-10
assert.ok(bundle.includes("mergeTraceStatus"), "渲染层状态合并经核心纯函数 mergeTraceStatus");
assert.ok(bundle.includes("api.history"), "冷会话使用 native history 一次性补齐");
assert.ok(bundle.includes("api.models"), "模型/reasoning 使用 native models 数据");
assert.ok(bundle.includes("dap-token-stats"), "token 统计 DOM 位于进度条之后");
assert.ok(
	bundle.includes('makeEl("span", "dap-token-main")') && bundle.includes('makeEl("span", "dap-token-time")'),
	"统计行双段结构：左列文本 + 右置时长（R-01-009/AC-05）",
);
assert.ok(bundle.includes("`输入 ${fmtTokens("), "统计行含输入/输出中文短标签（R-01-009/AC-05）");
assert.ok(
	bundle.indexOf("parts.push(`${Math.round(entry.rateTokS)} tok/s`") <
		bundle.indexOf("parts.push(`缓存 ${entry.cacheHitPct}%`)") &&
		bundle.indexOf("parts.push(`缓存 ${entry.cacheHitPct}%`)") <
			bundle.indexOf("parts.push(`输入 ${fmtTokens(entry.inputTokens) ?? entry.inputTokens}`)") &&
		bundle.indexOf("parts.push(`输入 ${fmtTokens(entry.inputTokens) ?? entry.inputTokens}`)") <
			bundle.indexOf("parts.push(`输出 ${fmtTokens(entry.outputTokens) ?? entry.outputTokens}`)"),
	"左列顺序对齐主窗口：tok/s、缓存命中、输入、输出（R-01-009/AC-05）",
);
assert.ok(!bundle.includes("≈"), "速率不再携带约等于符号（R-01-009/AC-05）");
assert.ok(bundle.includes("dap-history-line"), "历史卡包含用户/agent 两条消息预览行");
// R-01-003/AC-04
assert.ok(bundle.includes("parentId: m.isSub ? String(parentId) : null"), "活动卡条目保留直属母会话 id");
assert.ok(bundle.includes("function trackRuns(entries)"), "母会话轨道拓扑由纯函数 trackRuns 一次求出");
assert.ok(bundle.includes('[data-dsh-activity-pane] .dap-tracks {'), "列表内置绝对定位轨道层");
assert.ok(bundle.includes('[data-dsh-activity-pane] .dap-conn-track {'), "每个母会话一条连续轨道元素");
assert.ok(bundle.includes('trackEl.className = "dap-conn-track"'), "轨道元素使用独立类名");
assert.ok(bundle.includes('class="dap-tracks" aria-hidden="true"'), "轨道层为纯装饰、不进可访问性树");
assert.ok(
	bundle.includes("syncTracks(activeList, active, cardsById)"),
	"全部卡片写入后统一测量绘制轨道（读写分离，避免布局抖动）",
);
assert.ok(
	bundle.includes("function trackBoxes(run, rectOf, indentPx)") && bundle.includes("trackBoxes(run, rectOf, INDENT_PX)"),
	"竖轨与横线几何（母会话底缘 → 末级子卡中心、逐子卡横线、统一取整）在纯函数 trackBoxes 中推导并被可执行断言钉住，渲染层只做测量与写入",
);
assert.ok(
	bundle.includes("rec.el.getBoundingClientRect()") && !bundle.includes("rec.el.offsetTop"),
	"轨道测量必须用浮点矩形：offsetTop/offsetHeight 是整数舍入值，与 CSS 全精度定位的横线会随机差 1~2px",
);
assert.ok(bundle.includes("new ResizeObserver("), "卡片高度随流式内容变化时由 ResizeObserver 重算轨道");
assert.ok(
	bundle.includes("window.devicePixelRatio") && bundle.includes("Math.round(baseLeft * dpr) / dpr") && bundle.includes("queueTrackSync"),
	"轨道层必须整体对齐设备像素网格（层原点的小数相位会让 1px 线段粗细不稳），滚动后经 rAF 重对齐",
);
assert.ok(
	bundle.includes("cancelAnimationFrame(trackSyncHandle)"),
	"卸载时必须取消未执行的滚动重对齐 rAF 并清空轨道上下文，避免回调落到已移除列表",
);
assert.ok(bundle.includes('[data-dsh-activity-pane] .dap-conn-stub {'), "接入横线由轨道层元素绘制");
assert.ok(bundle.includes('el.className = "dap-conn-stub"'), "横线元素使用独立类名");
assert.ok(
	bundle.includes("Math.round(parent.left + indentPx / 2 + 1)") && bundle.includes("Math.round(rect.top + rect.height / 2)"),
	"全部线段坐标统一取整到 CSS 像素：小数坐标定位的 1px 线段被抗锯齿随机摊薄（粗细不一、端点错位）",
);
assert.ok(
	!bundle.includes('"data-connector"') && !bundle.includes(".dap-card[data-connector]::after"),
	"横线不得回退到卡片伪元素：CSS 按小数 50% 定位的横线相位随机，粗细不稳定",
);
assert.ok(
	!bundle.includes('.dap-card[data-connector]::before'),
	"竖向轨道不得再由卡片伪元素分段拼接：接缝端点落在随机亚像素相位上，断口与重叠并存不可控（T-033）",
);
assert.ok(
	!bundle.includes("data-last-child"),
	"末级收口由测量给出精确值，不得回退到 data-last-child + calc(50%+6px) 的 CSS 凑数",
);
assert.ok(
	!bundle.includes('el.className = "dap-rail"'),
	"轨道元素不得复用 dap-rail：该类已被折叠态展开按钮占用，撞名会使按钮被绝对定位成 1px 竖线（折叠态窗格整体空白）并被 querySelector 误取",
);
assert.ok(
	!bundle.includes("[data-dsh-activity-pane] .dap-rail {\n  position: absolute;"),
	"折叠态展开按钮 .dap-rail 不得被绝对定位：撞名规则会把按钮压成 1px 竖线，折叠态窗格整体空白",
);
assert.ok(
	clientSource.includes("const INDENT_PX = 16;") &&
		bundle.includes("Math.round(parent.left + indentPx / 2 + 1)") &&
		bundle.includes("renderCardIntoList(activeList, entry, cardsById, index, 1)"),
	"几何耦合钉住：INDENT_PX=16、轨道 left 由母会话卡片左缘测量推导（+半槽+1px border，取整后与横线起笔相接）与活动区卡片 offset=1（轨道层为首子节点），改任一必须同步",
);
// R-01-003/AC-05
assert.ok(bundle.includes("function activeSessionIds(byId = {})"), "活动子代理沿 parentId 链补齐活动祖先");
// ---- R-01-016/AC-01 等待卡保留最近工作项时间线 ----
assert.ok(
	bundle.includes('return [head, row, makeEl("div", "dap-trace"), makeEl("div", "dap-note")];'),
	"awaiting 骨架在标题行与 note 之间含时间线容器（R-01-016/AC-01）",
);
// ---- R-01-016/AC-02 parent 卡显示母会话最近工作项时间线 ----
assert.ok(
	bundle.includes('return [head, row, makeEl("div", "dap-trace"), track];'),
	"parent 骨架含时间线容器与进度条轨道（R-01-016/AC-02、AC-03）",
);
assert.ok(
	bundle.includes('if (entry.kind === "parent") {\n\t\t\tconst traceContainer = el.querySelector(".dap-trace");'),
	"parent 分支渲染自身时间线而非直接 return（R-01-016/AC-02）",
);
// ---- R-01-016/AC-03 parent 不确定态进度条（无百分比、条纹滚动动画） ----
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="parent"] .dap-fill {'),
	"parent 进度条由 data-kind 纯 CSS 驱动、不新增状态字段（R-01-016/AC-03）",
);
assert.equal(
	bundle.split('makeEl("span", "dap-pct")').length - 1,
	1,
	"百分比文本元素全 bundle 仅运行卡骨架一处创建（R-01-016/AC-03：parent 进度条无百分比文本）",
);
assert.equal(
	bundle.split('querySelector(".dap-pct")').length - 1,
	1,
	"百分比文本写入全 bundle 仅运行卡渲染分支一处（R-01-016/AC-03：parent 分支不写百分比）",
);
// ---- R-01-016/AC-04 时间线数据在途时显示加载指示、返回就地填充 ----
assert.ok(
	bundle.includes("renderTimelineArea(traceContainer, entry, nativePresentationSessionId(entry))"),
	"等待卡与 parent 卡复用 renderTimelineArea：在途显示加载行、返回就地填充（R-01-016/AC-04）",
);
// R-01-013/AC-07、R-01-013/AC-08
assert.ok(bundle.includes('dataset.role = "user"'), "用户消息行骨架静态标识 user 角色");
assert.ok(bundle.includes('dataset.role = "agent"'), "agent 回复行骨架静态标识 agent 角色");
assert.ok(bundle.includes("dap-history-icon"), "历史卡预览行带常驻角色图标段");
assert.ok(bundle.includes("dap-history-text"), "历史卡预览文本写入图标后的独立文本段");
// R-01-013/AC-08
assert.ok(bundle.includes("agentIcon.append(createRobotIcon())"), "agent 回复行使用机器人图标");
// R-01-012/AC-03（T-021 副作用守卫：历史卡换图标不影响时间线兜底）
assert.ok(bundle.includes('"Think" ? createThinkIcon() : createSparkleIcon()'), "时间线 assistant 兜底仍为 sparkle 图标");
assert.ok(bundle.includes("session.subscribe"), "运行卡通过 native session subscribe 接收实时推送");
assert.ok(
	clientSource.includes('const inject = ["connection", "sessions", "workspaces"];'),
	"sessions/workspaces 通过 client inject 注入，不依赖服务发现定时器",
);
assert.ok(!bundle.includes("serviceTimer"), "服务发现不得保留后台定时器");
assert.ok(!bundle.includes("frameProbeTimer"), "宿主 frame 发现不得保留后台定时器");
assert.ok(bundle.includes("conversationObserver"), "流式 DOM 观察绑定到 conversation seat");
assert.ok(bundle.includes("centerObserver"), "宿主结构变化通过 center 直接子节点通知处理");
assert.ok(bundle.includes("setInterval(() => queueSync(), CLOCK_MS)"), "仅保留运行时长显示所需的单一 1 秒时钟");
// R-01-014/AC-01
// R-01-014/AC-02
// R-01-014/AC-03
// R-01-014/AC-04
// ---- R-01-014 加载过程可见与渐进呈现 ----
assert.ok(bundle.includes("listLoadState"), "列表加载态经 listLoadState 归一");
assert.ok(bundle.includes('listState === "loading" ? "加载中…"'), "列表在途时活动区显示加载指示而非空态");
assert.ok(bundle.includes('"列表加载失败"'), "列表错误时显示失败文案而非空态");
assert.ok(bundle.includes("node.dataset.mode"), "加载指示与空态分模式渲染");
assert.ok(bundle.includes("dap-spinner"), "加载指示使用活动图标");
assert.ok(bundle.includes("loadingModel"), "模型字段级加载指示并入签名");
assert.ok(bundle.includes("loadingTimeline"), "时间线字段级加载指示并入签名");
assert.ok(bundle.includes("loadingPreviews"), "预览字段级加载指示并入签名");
assert.ok(bundle.includes("renderTraceLoading"), "时间线区数据在途时显示加载行");
assert.ok(bundle.includes("promise.then(queueSync, queueSync)"), "补充数据逐个完成即重绘（先就绪先显示）");
assert.ok(bundle.includes("LOAD_CONCURRENCY"), "冷数据读取经并发池限制慢网挤占");
assert.ok(bundle.includes("session.open"), "运行卡通过 native session open hydrate 非当前会话");
assert.ok(bundle.includes("sessionOpenLoads"), "session.open 请求与 cold history fallback 不重复");
assert.ok(!bundle.includes("events.mux"), "不常驻全局 mux，当前会话使用原生 session subscribe");
assert.ok(
	bundle.indexOf('makeEl("div", "dap-track")') < bundle.indexOf('makeEl("div", "dap-token-stats")'),
	"token 统计骨架位于进度条骨架之后",
);
assert.ok(
	bundle.indexOf('statsRow.append(makeEl("span", "dap-token-main"), makeEl("span", "dap-token-time"))') > -1,
	"统计行先左列后时长，时长段恒在行尾（R-01-009/AC-05）",
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
assert.ok(bundle.includes("bodyObserver?.disconnect()"), "卸载断开 body 观察者");
assert.ok(bundle.includes("disconnectAncestorObservers"), "卸载断开祖先链观察者");
assert.ok(bundle.includes("centerObserver?.disconnect()"), "卸载断开 center 结构观察者");
assert.ok(bundle.includes("conversationObserver?.disconnect()"), "卸载断开 conversation 观察者");
assert.ok(bundle.includes("removeEventListener"), "卸载移除事件监听");
const loadMaps = [new Map([["a", 1], ["b", 2]]), new Map([["b", 3], ["c", 4]])];
pruneInvisibleEntries(loadMaps, new Set(["b"]));
assert.deepEqual([...loadMaps[0].keys()], ["b"], "可见性清理保留可见记账");
assert.deepEqual([...loadMaps[1].keys()], ["b"], "loads 记账与详情同生命周期清理");
assert.ok(bundle.includes("pruneInvisibleEntries"), "可见性清理统一经 pruneInvisibleEntries");

// R-01-012/AC-05
// R-01-012/AC-06
// R-01-012/AC-07
// R-01-012/AC-08
// ---- 回归锚点：动作图标、错误呈现与标题摘要分隔符 ----
assert.ok(bundle.includes("createUserIcon"), "用户工作项使用人物 SVG 图标");
assert.ok(bundle.includes('item.kind === "user"'), "用户图标按工作项语义固定选择");
assert.ok(bundle.includes("createBashIcon"), "Bash 使用稳定的 canonical 图标");
assert.ok(bundle.includes('item.toolName === "bash"'), "Bash 图标不随原生行状态/展开态漂移");
assert.ok(bundle.includes('M11.4818 5.57813'), "Bash fallback 使用 DSH IconApiOutline14 路径");
// R-01-012/AC-03
// ---- 回归锚点：非当前会话 fallback 与主会话网页同一 canonical 图标表，选中/非选中态不漂移 ----
assert.ok(bundle.includes("fallbackTraceIcon"), "fallback 图标统一经 canonical 图标工厂");
assert.ok(bundle.includes("TOOL_ICON_FACTORIES"), "fallback 图标按 toolName 镜像原生 classifyTool 分类");
assert.ok(!bundle.includes('assistant: "✦"'), "fallback 不再使用字符画图标");
assert.ok(bundle.includes("createSearchIcon") && bundle.includes("M11.894845 6.647401"), "grep/glob fallback 使用 DSH IconSearchOutline16 路径");
assert.ok(bundle.includes("createGlobeIcon") && bundle.includes("M7.00018 0.353516"), "web_search fallback 使用 DSH IconGlobeOutline14 路径");
assert.ok(bundle.includes("createBrowseIcon") && bundle.includes("M11.2426 4.80473"), "read/web_fetch fallback 使用 DSH IconBrowseOutline16 路径");
assert.ok(bundle.includes("createEditIcon") && bundle.includes("M9.94076 1.34942"), "write/edit fallback 使用 DSH IconEditOutline16 路径");
assert.ok(bundle.includes("createThinkIcon"), "Think fallback 使用 DSH IconThinkOutline14 图标");
assert.ok(bundle.includes('item.kind === "context" ? "" : item.text'), "context 注入内容原文不作为摘要兜底上卡（R-01-012/AC-03）");
assert.ok(bundle.includes("matchNativeContextRow"), "context 原生行多行按内容文本匹配不错配首行");
assert.ok(bundle.includes('[class*="iconIdle"] svg'), "原生动作图标从 iconIdle 读取而非 disclosure 箭头");
assert.ok(bundle.includes("nativeIconsByTraceKey"), "错误状态复用此前缓存的动作图标");
assert.ok(bundle.includes("ancestorObservers"), "祖先链逐级观察保证视图级重挂载自愈");
assert.ok(bundle.includes("ICON_CACHE_MAX"), "图标缓存按当前会话修剪并限量，不随调用终身增长");
assert.ok(bundle.includes("nativeWorkItemPresentation(item, nativeCacheKey)"), "图标缓存按会话与工作项 key 隔离");
assert.ok(!bundle.includes('const cacheKey = String(item.id ?? "")'), "图标缓存不得使用空 id 共享 key");
assert.ok(!bundle.includes('disclosure?.querySelector("svg")'), "不得直接复制 disclosure 内第一个 SVG");
assert.ok(bundle.includes("tintSvgCurrentColor"), "错误图标显式归一到 currentColor");
assert.ok(bundle.includes('setAttribute("fill", "currentColor")'), "错误图标填充颜色跟随错误 CSS");
assert.ok(bundle.includes('setAttribute("stroke", "currentColor")'), "错误图标描边颜色跟随错误 CSS");
assert.ok(bundle.includes("dap-trace-separator"), "标题与摘要之间有圆点分隔符");
assert.ok(bundle.includes('main.append(makeEl("span", "dap-trace-separator"))'), "仅在标题和摘要同时存在时插入分隔符");
assert.ok(bundle.includes('[data-status="error"] .dap-trace-icon'), "错误时动作图标染红");
assert.ok(bundle.includes('[data-status="error"] .dap-trace-label'), "错误时动作标题染红");
assert.ok(bundle.includes('[data-status="error"] .dap-trace-summary'), "错误时动作摘要染红");
assert.ok(bundle.includes('summary.dataset.follow !== follow'), "流式摘要记录跟随态以区分钉行尾与回行首（R-01-012/AC-03）");
assert.ok(bundle.includes('summary.scrollLeft = follow === "end" ? summary.scrollWidth : 0'), "running 摘要钉行尾跟随流式输出、结束后回行首（R-01-012/AC-03）");
assert.ok(bundle.includes('.dap-trace-summary[data-follow="end"] { text-overflow: clip; }'), "钉行尾跟随时摘要不渲染省略号（镜像原生 ReasoningRow follow-end）");

// R-01-009/AC-09
// ---- 回归锚点：时间线几何/状态动画（R-01-009/AC-08、AC-09 呈现细节）----
// 轨道列从卡片内容左边起步：圆点盒子与 7px 标题圆点完全同盒（7px、left:0、圆心 x=3.5）——
// 分数位原点下 Chrome 对不同尺寸圆盒的吸附相位不同，同盒才能保证跨 DPR 渲染对齐；
// 5px 视觉圆点烘进径向渐变（核 0–2.5px），外环由渐变内半 + 1px box-shadow 外半拼成；
// 竖线 left 3px（圆心 x=3.5）与圆点严格同圆心，竖线贯穿首项圆点并向上引出，
// reduced-motion 只关闭宽度 transition，不关闭 answer-pet 同款状态脉冲/流式条纹。
assert.ok(bundle.includes(".dap-trace-item:last-child::after"), "时间线末项不画竖线（终点没入最末圆点）");
assert.ok(bundle.includes("margin: 1px 0 2px;"), "时间线整体与卡片内容左边界对齐");
assert.ok(bundle.includes("left: 3px; top: 0; bottom: -8px"), "1px 竖线（整数位）与圆点严格同圆心 x=3.5（对齐标题圆点）");
assert.ok(bundle.includes("color: #c7ced9; font-size: 10px; line-height: 14px;"), "工作项文字恢复原有 10px/14px 尺度");
assert.ok(bundle.includes("width: 12px; height: 12px; flex: none; display: inline-flex;"), "工作项图标容器保持 12px");
assert.ok(bundle.includes("display: block; width: 12px; height: 12px;"), "工作项 SVG 保持 12px");
assert.ok(bundle.includes('svg.setAttribute("width", "12")') && bundle.includes('svg.setAttribute("height", "12")'), "生成 SVG 强制写入 12px 尺寸");
assert.ok(bundle.includes("left: 0; top: 3px;\n  width: 7px; height: 7px;"), "时间线圆点盒子与标题圆点同盒（7px、left:0，跨 DPR 渲染对齐）");
assert.ok(bundle.includes("radial-gradient(circle, #778394 0 2.5px, rgba(119, 131, 148, .14) 2.5px 3.5px, transparent 3.5px)"), "5px 视觉圆点烘进径向渐变（实心核 0–2.5px + 外环内半）");
assert.ok(bundle.includes("box-shadow: 0 0 0 1px rgba(119, 131, 148, .14);"), "圆点半透明外环外半由 1px box-shadow 拼成（整体 2px 外环不变）");
assert.ok(bundle.includes(".dap-dot {\n  width: 7px; height: 7px;"), "标题圆点保持 7px（圆心 x=3.5，时间线圆点对齐基准）");
assert.ok(bundle.includes("padding-left: 14px"), "时间线文字轨道保持 14px 内缩");
assert.ok(bundle.includes(".dap-subtrace {\n  min-width: 0;"), "子代理容器不再 padding/border/overflow 包裹（不裁切圆点）");
assert.ok(bundle.includes(".dap-fill { transition: none; }"), "降低动效设置不关闭状态动画（对齐 answer-pet）");
assert.ok(bundle.includes("animation: dap-stripes 0.8s linear infinite"), "流式进度条保留向右滚动条纹动画");
assert.ok(bundle.includes("animation: dap-pulse 1.15s ease-in-out infinite"), "运行中蓝色节点保留脉冲动画");
assert.ok(bundle.includes("dataset.traceKey"), "同一流程节点复用 DOM，脉冲动画不因时钟刷新重置");
assert.ok(!bundle.includes(".dap-trace-item[data-status=\"running\"]::before {\n    animation: none !important;"), "降低动效设置不关闭运行点脉冲");

// R-01-013/AC-09
// 最近历史卡标题降为常规字重（不加粗），活动卡标题保持加粗。
assert.ok(bundle.includes('[data-kind="recent"] .dap-title {\n  font-weight: 400;'), "最近历史卡标题使用常规字重（不加粗）");
assert.ok(bundle.includes("white-space: nowrap; font-size: 12px; line-height: 16px; font-weight: 700;"), "活动卡标题保持加粗 700");

// R-01-013/AC-10
// 最近历史卡整体不透明度低于活动卡，弱化历史区视觉强调。
assert.ok(bundle.includes("background: rgba(22, 24, 29, 0.9);\n  border-color: transparent;\n  opacity: 0.8;"), "最近历史卡整体不透明度降为 0.8");

assert.ok(
	bundle.indexOf('[data-kind="recent"] {') < bundle.indexOf(".dap-card[data-opening]"),
	"recent 淡化规则位于 opening 脉冲规则之前，等待态由脉冲接管（R-01-013/AC-10 边界）",
);

// R-01-008/AC-04
// 移动端浮动开关固定在会话头部左上角、左边栏切换按钮（28px @ left:8px; top:12px）右侧，文案「活动」。
assert.ok(bundle.includes("position: fixed; top: 12px; left: 44px;"), "浮动开关位于左上角左边栏切换按钮右侧（left:44px）");
assert.ok(!bundle.includes(".dap-toggle {\n  position: fixed; top: 12px; right: 12px;"), "浮动开关不再位于右上角");
assert.ok(bundle.includes('"<span>活动</span><span class=\\"dap-toggle-count\\"></span>"'), "浮动开关文案为「活动」并保留计数徽标");

// R-01-008/AC-05
// 抽屉打开时浮动开关隐藏，关闭后恢复；显隐随 togglePane 单点同步。
assert.ok(bundle.includes(".dap-toggle[data-drawer-open] { display: none; }"), "抽屉打开时浮动开关隐藏");
assert.ok(bundle.includes('toggle.toggleAttribute("data-drawer-open", open)'), "开关显隐由 togglePane 单点同步");

// R-01-002/AC-04
// 等待标识徽标改用主题协调的柔和底，不再使用突兀的橙金渐变。
assert.ok(bundle.includes('.dap-badge {\n  flex: none; font-size: 10px; line-height: 14px; font-weight: 600;\n  color: color-mix(in srgb, currentColor 88%, transparent);\n  background: color-mix(in srgb, currentColor 12%, transparent);'), "等待标识徽标使用主题协调的柔和底色");
assert.ok(!bundle.includes('color: #221a10; background: linear-gradient(180deg, #ffd488, #e8a33d);'), "等待标识徽标不再使用橙金渐变");
// R-01-001/AC-04、AC-05、AC-06 徽标 n/m 计数；R-01-002/AC-06、AC-07 同色占比脉冲
assert.ok(bundle.includes("const countText = `${waiting}/${total}`;"), "数量徽标以 n/m 分数形式呈现");
assert.ok(
	bundle.includes("awaitBadgeStats(active)") && bundle.includes("awaitPulsePeriod(waiting, total)"),
	"计数与脉冲周期由核心纯函数单点派生",
);
assert.ok(
	bundle.includes("[data-dsh-activity-pane] .dap-count[data-awaiting] {\n  /* 底色/透明度/边框与等待卡完全一致") &&
		bundle.includes("[data-dsh-activity-pane] .dap-rail-count[data-awaiting] {\n  background: rgba(35, 31, 25, 0.97);"),
	"数量徽标等待态底色/透明度与等待卡完全一致（R-01-002/AC-06）",
);
assert.equal(
	(bundle.match(/background: rgba\(35, 31, 25, 0\.97\);\n  border-color: color-mix\(in srgb, #e8a33d 55%, transparent\)/g) ?? []).length,
	3,
);
assert.equal(
	(bundle.match(/box-shadow: 0 0 0 1px color-mix\(in srgb, #e8a33d 35%, transparent\);\n  animation: dap-await-pulse/g) ?? []).length,
	3,
	"三处镜像面等待态均带与等待卡相同的 1px 外环（R-01-002/AC-06）",
);
assert.ok(
	bundle.includes("@keyframes dap-await-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }"),
	"脉冲为亮度呼吸而非整体不透明度：底色全程可见不透底（R-01-002/AC-06 东家视觉反馈）",
);
assert.ok(!bundle.includes("linear-gradient(180deg, #ffb4b4, #f06a72)") && !bundle.includes("#2a1012"), "数量徽标不再使用红色渐变旧配色（时间线错误态红色不受影响）");
assert.equal(
	(bundle.match(/animation: dap-await-pulse var\(--dap-await-period/g) ?? []).length,
	3,
	"列头/窄条/移动开关三处镜像面统一接入占比驱动脉冲（R-01-002/AC-07）",
);
assert.ok(bundle.includes('el.style.setProperty("--dap-await-period", next)'), "渲染层按等待占比写入脉冲周期自定义属性");
assert.ok(
	bundle.includes(
		"body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-rail-count[data-awaiting],\nbody:not([data-ds-dark-theme]) .dap-toggle[data-awaiting] .dap-toggle-count {\n  background: var(--dsw-alias-state-warn-tertiary, rgb(254, 245, 231));\n  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));\n  box-shadow: none;\n}",
	),
	"浅色主题数量徽标覆盖声明体完整：等待卡浅色背景别名 + 浅色描边 + 去外环（防空规则回归）",
);
assert.ok(bundle.includes("`${total} 个活动会话，${waiting} 个等待响应`"), "数量徽标 aria-label 携带语义化计数说明");
assert.ok(bundle.includes("border-radius: 999px; padding: 0 7px;\n}\n/* 工作区徽标"), "等待标识徽标规则正确闭合，后续为工作区徽标注释与顶层规则（R-01-002/AC-04、R-01-003/AC-06 结构回归防护）");
assert.ok(
	bundle.includes("border: 1px solid transparent;\n  padding: 0 7px;\n}\n[data-dsh-activity-pane] .dap-count[data-awaiting] {"),
	"数量徽标基态规则正确闭合，紧随其后为等待态变体（R-01-001/AC-04 结构回归防护）",
);
// CSS 模板结构完整：花括号配平，不错位吞并后续规则（R-01-002/AC-04 结构回归防护）。
assert.equal(
	(bundle.match(/\{/g) ?? []).length,
	(bundle.match(/\}/g) ?? []).length,
	"bundle 花括号配平（CSS 模板不错位吞并后续规则）",
);

// R-01-001/AC-04
// 数量徽标紧跟标题文字（去掉 margin-left: auto），配色同样柔和化。
assert.ok(bundle.includes('[data-dsh-activity-pane] .dap-count {\n  flex: none;\n  font-size: 10px;'), "数量徽标紧跟标题文字（不再 margin-left: auto）");

// R-01-003/AC-06、AC-07
// 工作区徽标「文件夹图标+名称文本」双段：图标与左边栏工作区条目同源，字号不低于 10.5px。
assert.ok(bundle.includes("createWorkspaceFolderIcon"), "工作区徽标使用与左边栏同源的 canonical 文件夹图标工厂（R-01-003/AC-06）");
assert.ok(bundle.includes("M5.05582 0.518756L4.50669 0.86654"), "文件夹图标 path 与 dsh-client-ui-primitives IconFolderClose16 同源（R-01-003/AC-06）");
assert.ok(bundle.includes('[data-dsh-activity-pane] .dap-workspace {\n  width: fit-content; max-width: 100%; display: flex; align-items: center; gap: 3px;\n  overflow: hidden;\n  font-size: 10.5px; line-height: 14px;'), "工作区名称字号提升为 10.5px 且胶囊改「图标+文本」双段布局（R-01-003/AC-07）");
assert.ok(bundle.includes("[data-dsh-activity-pane] .dap-workspace-icon { flex: none; display: inline-flex; }"), "工作区图标 flex:none 不被挤压截断（R-01-003/AC-06 结构回归防护）");
assert.ok(bundle.includes(".dap-workspace-text {\n  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"), "省略号截断只作用于工作区名称文本段（R-01-003/AC-06 结构回归防护）");
assert.ok(bundle.includes("restoreTextField(workspaceText, entry.workspaceTitle)"), "工作区名称只写入文本段，不覆盖图标（R-01-003/AC-06）");
assert.ok(bundle.includes('workspace.append(workspaceIcon, makeEl("span", "dap-workspace-text"))'), "文件夹图标先于名称文本段加入胶囊（R-01-003/AC-06 顺序锚点）");
assert.ok(bundle.includes("if (workspaceText !== null) restoreTextField(workspaceText, entry.workspaceTitle)"), "热装旧骨架无文本段时容空跳过，不中断渲染（R-01-003/AC-06 健壮性）");

// R-01-010/AC-01、R-01-010/AC-05
// 两区分隔线上下各保留 10px 留白；历史区无内容时整段隐藏、分隔线不占位。
assert.ok(bundle.includes("border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);\n  padding: 10px 8px 0;\n  margin-top: 10px;"), "分隔线上下各 10px 留白");
assert.ok(bundle.includes(".dap-recent[hidden] { display: none; }"), "历史区无内容时整段隐藏（分隔线不占位）");

// R-01-010/AC-07
// 活动区→历史区迁移动画：旧卡克隆 ghost FLIP 平移淡降 + 真卡淡入，transitionend 收口，reduced-motion 降级。
assert.ok(bundle.includes("[data-dsh-activity-pane] > .dap-move-ghost"), "迁移 ghost 挂载于窗格内，卡片样式作用域生效（不虚框）");
assert.ok(bundle.includes("renderedPane.appendChild(plan.ghost)"), "ghost 挂载于窗格元素内（absolute、窗格相对坐标）");
assert.ok(bundle.includes("transition: transform 0.3s ease, width 0.3s ease, height 0.3s ease"), "ghost 平移同时形变至目标矩形（精准落位）");
assert.ok(bundle.includes("opacity 0.1s ease 0.2s"), "ghost 到位后才淡出（不在飞行途中消失）");
assert.ok(bundle.includes(".dap-move-in"), "目标最近卡迁移时淡入");
assert.ok(bundle.includes('"transitionend"'), "ghost 生命周期由 transitionend 收口（不引入定时器）");
assert.ok(bundle.includes('matchMedia?.("(prefers-reduced-motion: reduce)")'), "reduced-motion 时跳过迁移动画直接落位");

// R-01-004/AC-03
// 滚动条仅滚动时显示：thumb 默认透明、data-scrolling 时显示；Firefox 路径在 @supports 门内。
assert.ok(bundle.includes(".dap-scroll::-webkit-scrollbar-thumb {\n  background: transparent;"), "滚动条 thumb 默认透明（不滚动时不显示）");
assert.ok(bundle.includes(".dap-scroll[data-scrolling]::-webkit-scrollbar-thumb"), "滚动中经 data-scrolling 显示滚动条");
assert.ok(bundle.includes("@supports not selector(::-webkit-scrollbar)") && bundle.includes("scrollbar-color: transparent transparent"), "Firefox 路径以 @supports 门隔离（防 Chromium 丢弃伪元素规则）");
assert.ok(bundle.includes('scroll?.addEventListener("scroll", onScroll, { passive: true })'), "滚动监听置位 data-scrolling");
assert.ok(bundle.includes('scroll?.removeEventListener("scroll", onScroll);\n\t\t\tif (scrollHideTimer !== null) clearTimeout(scrollHideTimer);'), "unbind 同步清理滚动监听与隐藏定时器（R-02-003/AC-02）");

// ---- 回归锚点：浅色主题适配 ----
// 外壳以 body[data-ds-dark-theme] 标记深色（缺省即浅色）并翻转整套 --dsw-alias-* 变量；
// 暗色硬编码色仅在属性缺省时被浅色别名覆盖，深色规则保持原值。
assert.ok(bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card {"), "浅色卡片底色/描边/阴影有独立覆盖块");
assert.ok(bundle.includes("background: var(--dsw-alias-bg-layer-2, #ffffff);"), "浅色卡片底色取外壳 layer-2 别名");
assert.ok(bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item,\nbody:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-label {"), "浅色时间线文字取外壳 label-secondary 别名");
assert.ok(bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-track {"), "浅色进度轨道底色有覆盖");
assert.ok(bundle.includes("body:not([data-ds-dark-theme]) .dap-toggle {"), "浅色移动端浮动开关底色取外壳浮动按钮填充");
assert.ok(bundle.includes(".dap-card {\n  position: relative;\n  flex: none;\n  min-width: 0;\n  padding: 9px 11px;\n  border-radius: 14px;\n  background: rgba(29, 31, 37, 0.94);"), "深色卡片底色保持原值（浅色仅经覆盖块生效）");
assert.ok(bundle.includes("color: #c7ced9; font-size: 10px; line-height: 14px;"), "深色时间线文字保持原值");
assert.ok(!bundle.includes("@media (prefers-color-scheme"), "主题跟随外壳 data-ds-dark-theme 标记，不另读系统媒体查询（避免与外壳手动主题设置脱节）");
// 覆盖块必须不接管 ::before 状态圆点基色：基色规则若被覆盖会以更高优先级
// 压掉 running/done/error/stopped 状态色。
assert.ok(!bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item::before"), "浅色覆盖不接管 ::before 圆点（保留状态色）");
// R-01-006/AC-01 当前会话高亮在浅色下同样生效：浅色 .dap-card/:hover/[data-kind] 覆盖
// 的优先级均高于基态 [data-current] 规则，浅色块必须在其后重声明描边/光晕。
assert.ok(
	bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-current] {\n  border-color: color-mix(in srgb, #65a0ff 75%, transparent);\n  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);\n}"),
	"浅色块重声明当前会话描边与光晕（与深色同值）",
);
const lightCurrentAt = bundle.indexOf("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-current] {");
assert.ok(
	lightCurrentAt > bundle.indexOf("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card:hover {")
		&& lightCurrentAt > bundle.indexOf('body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="recent"] {'),
	"浅色 [data-current] 重声明位于 :hover 与 [data-kind=recent] 覆盖之后（同优先级后定义者胜）",
);


console.log("check: all assertions passed");
