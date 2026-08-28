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
	askQuestionsPreview,
	awaitBadgeStats,
	awaitBadgeTone,
	awaitNoteText,
	awaitPulsePeriod,
	timelineQuestionPreview,
	buildEntries,
	buildRecent,
	cardSignature,
	cleanPreview,
	clampPaneWidth,
	pagedHistoryEvents,
	delegationActive,
	progressAnchor,
	detailLoadPlan,
	conversationWorkItems,
	conversationTimelineFromHistory,
	foldWorkGroups,
	foldedConversationTimeline,
	foldedHistoryTimeline,
	historyInstructionAnchor,
	openTurnStartFromEvents,
	openTurnStartMissing,
	escapeCssString,
	firstPhysicalLine,
	fmtElapsedMs,
	fmtTokens,
	isActiveRow,
	shouldSubscribeToSession,
	activeSessionIds,
	completionReminder,
	errorReminder,
	ERROR_NOTE_MAX,
	ERROR_NOTE_FALLBACK,
	truncateErrorNote,
	trackBoxes,
	trackRuns,
	isSubagentRow,
	countBadgeState,
	listLoadState,
	messagePreviews,
	movedToRecentIds,
	movedToActiveIds,
	modelMetadata,
	needsHistorySnapshot,
	lastTurnEndFromEvents,
	lastTurnEndFromTimings,
	pendingText,
	progressHalfLifeSec,
	progressOf,
	pruneInvisibleEntries,
	pruneSubscriptions,
	runtimeStats,
	shouldCancelOpenRetry,
	subagentTitle,
	summarizeToolArguments,
	usageSummary,
	workspaceHue,
	resolveWorkspaceHues,
	workspaceInfoForSession,
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
	"原生快照已就绪且窗口数据齐全时不发 history 读取",
);
// R-01-013/AC-03、AC-04：最近卡窗口快照缺用户或 agent 预览时补读一次 history。
assert.equal(
	detailLoadPlan({ detail: { history: [{ event: { seq: 1 } }] }, snapshotReady: true, previewFallbackNeeded: true }).history,
	true,
	"最近卡预览不完整时即使已有早到 history 也重新补读一次",
);
assert.equal(
	detailLoadPlan({ detail: { history: [], previewFallbackLoaded: true }, snapshotReady: true, previewFallbackNeeded: true }).history,
	false,
	"最近卡预览 fallback 已尝试后可见期内不热重试",
);
// R-01-009/AC-06、R-01-012/AC-12 冷窗口兜底：快照就绪但窗口缺锚点数据（开放回合起点/用户行在窗口外）时补读 history
assert.equal(
	detailLoadPlan({ detail: {}, snapshotReady: true, windowComplete: false }).history,
	true,
	"快照就绪但窗口缺锚点数据时发起 history 补读",
);
assert.equal(
	detailLoadPlan({ detail: {}, snapshotReady: true, windowComplete: true }).history,
	false,
	"快照窗口锚点数据齐全时不发 history 读取",
);
assert.equal(
	detailLoadPlan({ detail: { history: [] }, snapshotReady: true, windowComplete: false }).history,
	false,
	"窗口补读失败置空后可见期内不热重试",
);

// ---- R-01-012/AC-16 模型选择切换经目录订阅推送更新，一次性读取仅作初值 ----
// 目录 store 快照形状（{current, groups, routable, status, ...}）与 RPC value 同形兼容，经同一归一。
assert.deepEqual(
	modelMetadata({
		current: { provider: "p", model: "m2", reasoningEffort: "low" },
		groups: [{ id: "p", models: [{ id: "m2", name: "Model M2", reasoning: { efforts: [{ id: "low", name: "Low" }] } }] }],
		routable: true,
		failures: [],
		status: "ready",
		error: null,
	}),
	{ model: "Model M2", reasoning: "Low" },
	"目录 store 推送快照直接归一为切换后的模型上下文",
);
// 订阅清理行为链：不可见 id 先 unsubscribe 再除名；可见 id 保留；单个 unsubscribe 抛错不阻断其余清理。
const subCalls = [];
const subMap = new Map([
	["stay", () => subCalls.push("stay")],
	["gone", () => subCalls.push("gone")],
	["bad", () => {
		throw new Error("unsubscribe failed");
	}],
	["gone2", () => subCalls.push("gone2")],
]);
pruneSubscriptions(subMap, new Set(["stay"]));
assert.deepEqual(subCalls, ["gone", "gone2"], "不可见订阅被 unsubscribe，抛错不阻断后续清理");
assert.deepEqual([...subMap.keys()], ["stay"], "可见订阅保留、其余除名，监听器不残留");
pruneSubscriptions(null, new Set()); // 非 Map 输入静默忽略

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
// ---- R-01-002/AC-01 待确认 ｜ R-01-002/AC-02 待审查/问题 ----
assert.equal(pendingText("approval"), "待确认");
assert.equal(pendingText("plan-review"), "待审查");
assert.equal(pendingText("question"), "问题");
assert.equal(pendingText("approval"), "待确认");

// ---- R-01-002/AC-03 完成提醒以绿色成功卡面呈现（C-040） ----
// 未知阻塞种类兜底「待处理」（不冒充已知类型）；完成态判定见下方 buildEntries 断言（R-01-001/AC-01）。
// 完成提醒卡不再显示类型徽标：pendingText 仅为阻塞等待承载（C-040）。
assert.equal(pendingText("unknown-kind"), "待处理");

// ---- R-01-002/AC-09 等待卡末行提示：动作+后果；待回复为提问 Q 行列表；完成提醒固定文案 ----
assert.equal(awaitNoteText("blocked", "approval"), "等待你确认授权后继续");
assert.equal(awaitNoteText("blocked", "plan-review"), "等待你审查计划后继续");
assert.equal(awaitNoteText("blocked", "question"), "等待你回答问题后继续", "问题不可得时回落动作说明");
assert.equal(awaitNoteText("blocked", "question", "Q：采用哪个方案方向？"), "Q：采用哪个方案方向？", "待回复末行为提问 Q 行列表，不带「等待你回答：」前缀");
assert.equal(awaitNoteText("done", undefined), "继续对话，或移入历史");
// 宽度上界回归（R-01-002/AC-09）：done 末行须与「移入历史」按钮同排在默认 280px 窗格
// 单行完整可见——内容区约 258px，按钮+gap 约占 66px，留文字约 192px；11px 全角字宽
// 即 11px/字符，故文案（含标点）不得超过 17 个全角字符。改长必触发省略号吃掉行动引导。
{
	const note = awaitNoteText("done", undefined);
	assert.ok(
		[...note].length <= 17,
		`完成提醒末行文案宽度上界：不超过 17 个全角字符（当前 ${[...note].length}，R-01-002/AC-09）`,
	);
}
assert.equal(awaitNoteText("blocked", "unknown-kind"), "等待你处理后继续", "未知阻塞种类中性兜底（评审修正）");

// ---- R-01-002/AC-09 提问 Q 行列表：逐条取问题正文首行、剥尾冒号、单条 Q：/多条 Qn: 前缀、最多 3 行 ----
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ header: "方案确认", question: "采用哪个方案方向？", options: [] }] })),
	"Q：采用哪个方案方向？",
	"单条问题的正文以「Q：」前缀展示（不显示 header，header 仅作正文缺失时回落）",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ header: "演示选择", question: "这是一个测试用的单项选择题，你会看到哪种效果？" }, { header: "多选演示", question: "再多试一个可多选的问题（可以都不选直接跳过吗？不行的话随便点）：" }] })),
	"Q1: 这是一个测试用的单项选择题，你会看到哪种效果？\nQ2: 再多试一个可多选的问题（可以都不选直接跳过吗？不行的话随便点）",
	"多条问题逐条以「Qn: 」前缀分行展示；行尾多余冒号剥除",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ question: "采用哪个方案方向？" }] })),
	"Q：采用哪个方案方向？",
	"未给出 header 时回落问题正文首行",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ header: "", question: "空 header 回落正文" }] })),
	"Q：空 header 回落正文",
	"空字符串 header 视同缺失",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ question: "第一行\n第二行不应出现" }] })),
	"Q：第一行",
	"多行问题取物理首行而非折叠拼接",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ header: "短标题\n长描述不应混入" }] })),
	"Q：短标题",
	"header 同样只取物理首行（仅作正文缺失回落）",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ header: "仅头问题" }, { question: "第二题" }] })),
	"Q1: 仅头问题\nQ2: 第二题",
	"多条问题逐条展示：header 仅作该条正文缺失时的回落",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ question: "问1" }, { question: "问2" }, { question: "问3" }, { question: "问4" }] })),
	"Q1: 问1\nQ2: 问2\nQ3: 问3\n…",
	"最多展示 3 条问题，其后以省略行收尾",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ question: "问1" }, { question: "问2" }, { question: "问3" }] })),
	"Q1: 问1\nQ2: 问2\nQ3: 问3",
	"恰 3 条问题全部展示、不加省略行",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ question: "问1" }, { options: [] }, { question: "问3" }, { question: "问4" }] })),
	"Q1: 问1\nQ3: 问3\nQ4: 问4",
	"中间问题不可得时跳过且不占号，编号按原数组位置延续",
);
assert.equal(
	askQuestionsPreview(JSON.stringify({ questions: [{ options: [] }, { question: "问2" }] })),
	"Q2: 问2",
	"原始多余 1 条时即使展示仅 1 行也保留 Qn: 前缀（C-042：单条前缀按原始条数判定）",
);
assert.equal(askQuestionsPreview(JSON.stringify({ questions: [{ options: [] }] })), null, "各条均无 header 也无正文时返回 null，由调用方回落动作说明");
assert.equal(askQuestionsPreview("not-json"), null);
assert.equal(askQuestionsPreview(JSON.stringify({ questions: [] })), null);
assert.equal(askQuestionsPreview(undefined), null);
// 提问 Q 行列表穿透折叠分组上浮组行；无提问行时返回 null。
assert.equal(
	timelineQuestionPreview([
		{ fold: true, label: "正在运行", question: null },
		{ fold: true, label: "正在运行", question: "Q1: 要合并回 main 吗？\nQ2: 需要先跑测试吗？" },
	]),
	"Q1: 要合并回 main 吗？\nQ2: 需要先跑测试吗？",
);
assert.equal(timelineQuestionPreview([{ fold: true, label: "已思考" }]), null);
assert.equal(timelineQuestionPreview(undefined), null);

// ---- R-01-003/AC-03 工作区归属 ----
const workspaces = [
	{ title: "Ops", path: "/srv/ops", sessionIds: ["sA"] },
	{ title: "Mail", path: "/srv/mail", sessionIds: [] },
];
assert.equal(workspaceInfoForSession("sA", workspaces).title, "Ops");
assert.equal(
	workspaceInfoForSession("sB", workspaces, { sB: { cwd: "/srv/mail" } }).title,
	"Mail",
);
assert.equal(workspaceInfoForSession("sX", workspaces).title, "");

// ---- R-01-003/AC-08 工作区身份归一与徽标色相稳定性 ----
assert.deepEqual(workspaceInfoForSession("sA", workspaces), { title: "Ops", key: "/srv/ops" }, "归属命中时身份以路径为准（R-01-003/AC-08）");
assert.deepEqual(
	workspaceInfoForSession("sB", workspaces, { sB: { cwd: "/srv/mail" } }),
	{ title: "Mail", key: "/srv/mail" },
	"cwd 匹配命中时身份同样以路径为准（R-01-003/AC-08）",
);
assert.deepEqual(workspaceInfoForSession("sX", workspaces), { title: "", key: "" }, "无归属时名称与身份皆空（R-01-003/AC-08）");
assert.deepEqual(
	workspaceInfoForSession("sC", [{ title: "Solo", sessionIds: ["sC"] }]),
	{ title: "Solo", key: "Solo" },
	"工作区无路径时身份以名称兜底（R-01-003/AC-08）",
);
assert.equal(workspaceHue(""), null, "空身份不派生色相（R-01-003/AC-08）");
assert.equal(workspaceHue("  "), null, "空白身份不派生色相（R-01-003/AC-08）");
assert.equal(workspaceHue("/srv/ops"), workspaceHue("/srv/ops"), "同一工作区身份恒得同一色相（R-01-003/AC-08）");
assert.notEqual(workspaceHue("/srv/ops"), workspaceHue("/srv/mail"), "不同工作区身份色相可区分（R-01-003/AC-08、AC-09）");
const hueOps = workspaceHue("/srv/ops");
assert.ok(Number.isInteger(hueOps), "色相为整数（R-01-003/AC-08）");
assert.equal(workspaceHue("Solo"), workspaceHue(String("So" + "lo")), "派生只依赖身份字符串、与运行状态无关（R-01-003/AC-08）");

// ---- R-01-003/AC-09 全弧均匀取色：[30,320] 避红弧、291 个取值 ----
for (const hueKey of ["/srv/ops", "/srv/mail", "/srv/web", "Solo", "/opt/alpha", "/opt/beta"]) {
	const hue = workspaceHue(hueKey);
	assert.ok(
		hue >= 30 && hue <= 320,
		`色相 ${hue} 落在避红弧 [30,320] 内，不落入红色警戒区（R-01-003/AC-09）`,
	);
}
// 长公共前缀的现实工作区身份两两可区分（djb2 低位聚集回归防护；
// 样本取自 T-070 后东家复现「同显蓝色」的现场路径形态，非任意键，勿随意替换）
const hueFamily = [
	"/home/cailei/proj/dsh-activity-pane",
	"/home/cailei/proj/dsh",
	"/home/cailei/proj/answer-pet",
	"/home/cailei/proj/blog",
	"/home/cailei/proj/notes",
];
const familyHues = hueFamily.map((key) => workspaceHue(key));
assert.equal(new Set(familyHues).size, hueFamily.length, "长公共前缀工作区色相两两不同（R-01-003/AC-09）");
// 聚集回归（性质级）：50 个长公共前缀身份应广泛分散，而非挤进相邻取值
const hueSpread = new Set();
for (let i = 0; i < 50; i += 1) hueSpread.add(workspaceHue(`/home/user/proj/ws-${i}`));
assert.ok(hueSpread.size >= 40, `50 个长前缀身份分散到 ${hueSpread.size} 个不同色相（≥40，R-01-003/AC-09）`);

// ---- R-01-003/AC-12 OKLCH 七色感知锚点 + 步进 3 跨色区槽位消解 ----
const workspaceHueAnchors = [55, 100, 145, 190, 235, 280, 325];
const realWorkspaceCluster = [
	"/home/cailei/ops",
	"/home/cailei/proj/docsim",
	"/home/cailei/proj/dsh-activity-pane",
	"/home/cailei/proj/dsh-control-center",
];
const resolvedCluster = resolveWorkspaceHues(realWorkspaceCluster);
assert.deepEqual(
	[...resolvedCluster.entries()],
	[
		["/home/cailei/ops", 280],
		["/home/cailei/proj/docsim", 55],
		["/home/cailei/proj/dsh-activity-pane", 190],
		["/home/cailei/proj/dsh-control-center", 100],
	],
	"真实撞槽子集以 +3 探测确定性拆分到蓝紫/橙/青/黄绿明显色区（R-01-003/AC-12）",
);
assert.deepEqual(
	[...resolveWorkspaceHues([...realWorkspaceCluster].reverse(), "", "  ", realWorkspaceCluster[0]).entries()],
	[...resolvedCluster.entries()],
	"输入顺序、重复项与空白身份不影响消解映射（R-01-003/AC-08、AC-12）",
);
assert.deepEqual([...resolveWorkspaceHues(null).entries()], [], "无身份集合返回空映射（R-01-003/AC-12）");
const sevenHues = [...resolveWorkspaceHues(Array.from({ length: 7 }, (_, index) => `/home/user/proj/seven-${index}`)).values()];
assert.deepEqual([...sevenHues].sort((a, b) => a - b), workspaceHueAnchors, "七个工作区恰占满七个避红 OKLCH 感知锚点（R-01-003/AC-12）");
const oklabHueDistance = (hueA, hueB, chroma) => {
	const a = hueA * Math.PI / 180;
	const b = hueB * Math.PI / 180;
	return Math.hypot(chroma * Math.cos(a) - chroma * Math.cos(b), chroma * Math.sin(a) - chroma * Math.sin(b));
};
for (let i = 0; i < sevenHues.length; i += 1)
	for (let j = i + 1; j < sevenHues.length; j += 1) {
		assert.ok(oklabHueDistance(sevenHues[i], sevenHues[j], 0.16) >= 0.11, "深色主题七锚点任意两色 OKLab 距离至少 0.11（R-01-003/AC-12）");
		assert.ok(oklabHueDistance(sevenHues[i], sevenHues[j], 0.15) >= 0.11, "浅色主题七锚点任意两色 OKLab 距离至少 0.11（R-01-003/AC-12）");
	}
const crowdedHues = resolveWorkspaceHues(Array.from({ length: 20 }, (_, index) => `/home/user/proj/crowded-${index}`));
assert.equal(crowdedHues.size, 20, "超容量集合仍为每个身份返回色相并有限终止（R-01-003/AC-12）");
assert.ok([...crowdedHues.values()].every((hue) => workspaceHueAnchors.includes(hue)), "超容量时仍只使用七个避红 OKLCH 感知锚点（R-01-003/AC-12）");
const anchorUses = workspaceHueAnchors.map((anchor) => [...crowdedHues.values()].filter((hue) => hue === anchor).length);
assert.ok(Math.max(...anchorUses) - Math.min(...anchorUses) <= 1, "超容量时七锚点复用计数差不超过 1（R-01-003/AC-12）");

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
const entries = buildEntries(snapshot, workspaces, {}, new Map([["sB", { lastTurnEnd: 1000, ackedAt: null }]]));
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
assert.equal(entries[0].workspaceKey, "/srv/ops", "活动条目携带工作区身份（路径优先，R-01-003/AC-08）");
assert.equal(entries[1].workspaceKey, "", "子代理徽标隐藏、身份置空（R-01-003/AC-08）");
assert.equal(entries[2].workspaceKey, "", "无归属条目身份为空（R-01-003/AC-08）");
const recentKeyEntries = buildRecent(
	{ ids: ["sA"], byId: { sA: { id: "sA", displayTitle: "主A", running: false, completed: false, updatedAt: 1000 } }, current: null },
	workspaces,
	2000,
);
assert.equal(recentKeyEntries[0]?.workspaceKey, "/srv/ops", "最近条目同样携带工作区身份（R-01-003/AC-08）");
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
	[["root", "running", 0], ["parent", "subagent", 1], ["child", "subagent", 2]],
	"委托周期中主会话母会话保持 running 呈现、子代理母会话保持 subagent 呈现，层级深度不变（R-01-003/AC-05）",
);
assert.deepEqual(
	buildEntries(inheritedActivity, []).map((entry) => entry.descendantActive),
	[true, true, false],
	"委托周期母会话携带 descendantActive 标记（R-01-003/AC-05）",
);
assert.deepEqual(buildRecent(inheritedActivity, [], 2000), [], "活动祖先不进入最近历史区");
assert.equal(
	shouldSubscribeToSession({ id: "parent", kind: "running" }, inheritedActivity.byId),
	false,
	"委托周期母会话不建立轮内状态订阅（宿主 running 为准，R-02-004/AC-01）",
);
// ---- R-01-002/AC-03、R-01-010/AC-06 委托周期压制完成提醒 ----
const delegCompleted = {
	ids: ["root", "child"],
	byId: {
		root: { id: "root", displayTitle: "母会话", running: false, updatedAt: 1900 },
		child: { id: "child", displayTitle: "活动子会话", running: true, parentId: "root" },
	},
	current: null,
};
assert.deepEqual(
	buildEntries(delegCompleted, []).map((entry) => [entry.id, entry.kind, entry.pendingText ?? null]),
	[["root", "running", null], ["child", "subagent", null]],
	"存在活动后代时完成确认不产出「已完成」、卡片保持运行呈现（R-01-002/AC-03）",
);
assert.deepEqual(
	buildEntries(delegCompleted, [], {}, null, new Set(["root"])).map((entry) => [entry.id, entry.kind, entry.pendingText ?? null]),
	[["root", "running", null], ["child", "subagent", null]],
	"存在活动后代时完成提醒不生效、卡片保持运行呈现（R-01-010/AC-06）",
);
assert.deepEqual(
	buildEntries({ ids: ["root"], byId: { root: delegCompleted.byId.root }, current: null }, [], {}, new Map([["root", { lastTurnEnd: 1500, ackedAt: null }]])).map((entry) => [entry.id, entry.kind, entry.pendingText ?? null, entry.waitClass ?? null, entry.noteText ?? null]),
	[["root", "awaiting", null, "done", "继续对话，或移入历史"]],
	"后代全部结束后完成提醒恢复显示（R-01-002/AC-03、AC-09）",
);
// ---- R-01-003/AC-05、R-01-009/AC-06 耗尽空窗（后代结束、settle 回合未启动）保持运行呈现 ----
const drainGap = {
	ids: ["root"],
	byId: { root: { id: "root", displayTitle: "母会话", running: false, updatedAt: 1900 } },
	current: null,
};
assert.deepEqual(
	buildEntries(drainGap, [], {}, null, new Set(["root"])).map((entry) => [entry.id, entry.kind, entry.pendingText ?? null, entry.descendantActive]),
	[["root", "running", null, false]],
	"耗尽空窗内委托周期保持运行呈现、完成提醒不生效；descendantActive 仍为当帧原始后代活性（R-01-003/AC-05、R-01-002/AC-03）",
);
assert.deepEqual(
	buildEntries(drainGap, [], {}, new Map([["root", { lastTurnEnd: 1500, ackedAt: null }]]), null).map((entry) => [entry.id, entry.kind, entry.waitClass ?? null]),
	[["root", "awaiting", "done"]],
	"无委托周期记账时同一快照回到等待呈现（空窗保持来自渲染层 delegatingIds 注入）",
);
// 分区不变量：空窗内不入最近历史，周期结束后才入。
const drainGapIdle = {
	ids: ["root"],
	byId: { root: { id: "root", displayTitle: "母会话", running: false, completed: false, updatedAt: 1900 } },
	current: null,
};
assert.equal(
	buildRecent(drainGapIdle, [], 2000, undefined, {}, [], null, new Set(["root"])).length,
	0,
	"耗尽空窗内委托周期会话不入最近历史（R-01-010 分区不变量）",
);
assert.equal(buildRecent(drainGapIdle, [], 2000, undefined, {}, [], null).length, 1, "委托周期结束后才入最近历史");
// delegationActive：耗尽宽限内视为委托周期（空窗保持），超时退出。
assert.equal(delegationActive({ mode: "delegating", anchor: 1000, turnStart: 9000, drainedAt: null }, 50000), true, "委托周期中视为活动");
assert.equal(delegationActive({ mode: "delegating", anchor: 1000, turnStart: 9000, drainedAt: 30000 }, 31000), true, "耗尽宽限内视为活动（空窗保持运行呈现）");
assert.equal(delegationActive({ mode: "delegating", anchor: 1000, turnStart: 9000, drainedAt: 30000 }, 91001), false, "耗尽宽限超时退出委托周期");
assert.equal(delegationActive({ mode: "turn", anchor: 1000, turnStart: 1000, drainedAt: null }, 50000), false, "非委托周期不视为活动");
assert.equal(delegationActive(null, 50000), false, "无记账不视为委托周期");
assert.equal(
	shouldSubscribeToSession({ id: "child", kind: "subagent" }, inheritedActivity.byId),
	true,
	"运行中的子代理建立轮内状态订阅",
);

// ---- R-01-001/AC-02 无活动会话时为空态 ｜ R-02-001/AC-01、R-02-001/AC-02 独立数据源 ----
// 核心映射只消费 DSH 原生快照结构（无任何第三方数据源引用）。
const snapshotOnly = { ids: [], byId: {}, current: null };
assert.deepEqual(buildEntries(snapshotOnly, []), [], "空快照产出空条目");

// ---- R-01-002/AC-01..02 等待优先于运行态 ｜ 阻塞等待条目携带 waitClass/pendingKind/noteText ----
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
assert.equal(pendingEntries[0].waitClass, "blocked", "待确认为阻塞等待（R-01-002/AC-08）");
assert.equal(pendingEntries[0].pendingKind, "approval");
assert.equal(pendingEntries[0].noteText, "等待你确认授权后继续", "阻塞等待备注行说明动作与后果（R-01-002/AC-09）");
// 待回复卡：备注行附时间线末条 ask 工作项的提问 Q 行列表（R-01-002/AC-09）。
const questionSnap = {
	ids: ["sQ"],
	byId: { sQ: { id: "sQ", displayTitle: "主Q", running: false, pendingInteraction: "question" } },
	current: null,
};
const questionEntries = buildEntries(questionSnap, [], {
	sQ: {
		timeline: [
			{
				fold: true,
				label: "正在运行",
				summary: "等待回答",
				question: "Q1: 这是一个测试用的单项选择题，你会看到哪种效果？\nQ2: 再多试一个可多选的问题（可以都不选直接跳过吗？不行的话随便点）",
			},
		],
	},
});
assert.equal(questionEntries[0].pendingText, "问题");
assert.equal(questionEntries[0].pendingKind, "question");
assert.equal(
	questionEntries[0].noteText,
	"Q1: 这是一个测试用的单项选择题，你会看到哪种效果？\nQ2: 再多试一个可多选的问题（可以都不选直接跳过吗？不行的话随便点）",
	"待回复末行为提问 Q 行列表，不带「等待你回答：」前缀",
);
const questionFallback = buildEntries(questionSnap, [], { sQ: { timeline: [] } });
assert.equal(questionFallback[0].noteText, "等待你回答问题后继续", "问题不可得时回落动作说明");

// ---- R-01-002/AC-06 计数徽标底色跟随等待构成（C-040、C-043）：错误 > 阻塞 > 完成 ----
assert.equal(awaitBadgeTone([]), null, "无等待行动无 tone");
assert.equal(awaitBadgeTone([{ kind: "running" }]), null, "运行卡不参与 tone");
assert.equal(awaitBadgeTone([{ kind: "awaiting", waitClass: "done" }]), "done", "全部等待为完成提醒时取绿色调");
assert.equal(awaitBadgeTone([{ kind: "subagent", waitClass: "blocked" }]), null, "子代理不计入 tone");
assert.equal(awaitBadgeTone([{ kind: "awaiting", waitClass: "error" }]), "error", "存在错误提醒即取红色调（最紧迫）");
assert.equal(
	awaitBadgeTone([{ kind: "awaiting", waitClass: "done" }, { kind: "awaiting", waitClass: "blocked" }]),
	"blocked",
	"存在任一阻塞等待即取金色调：紧迫信号优先于完成提醒",
);
assert.equal(
	awaitBadgeTone([{ kind: "awaiting", waitClass: "done" }, { kind: "awaiting", waitClass: "error" }]),
	"error",
	"错误提醒优先于完成提醒",
);
assert.equal(
	awaitBadgeTone([
		{ kind: "awaiting", waitClass: "done" },
		{ kind: "awaiting", waitClass: "error" },
		{ kind: "awaiting", waitClass: "blocked" },
	]),
	"error",
	"错误 > 阻塞 > 完成 优先级（C-043）",
);

// ---- R-01-001/AC-05 徽标计数口径：只统计主会话，子代理不计入 ｜ R-01-002/AC-06 阻塞计数 ----
assert.deepEqual(awaitBadgeStats([]), { waiting: 0, blocked: 0, total: 0 }, "空列表为 0/0（R-01-001/AC-06）");
assert.deepEqual(
	awaitBadgeStats([
		{ id: "a", kind: "running" },
		{ id: "b", kind: "awaiting", waitClass: "blocked" },
		{ id: "c", kind: "awaiting", waitClass: "done" },
		{ id: "d", kind: "subagent" },
	]),
	{ waiting: 2, blocked: 1, total: 3 },
	"分子=awaiting 主会话数，分母=running+awaiting 主会话数；blocked 只计阻塞等待",
);
// ---- R-01-002/AC-07 脉冲周期：随等待行动占比单调加快、两端封闭、非法输入不脉冲 ----
assert.equal(awaitPulsePeriod(0, 3), null, "无等待行动返回 null：不脉冲");
assert.equal(awaitPulsePeriod(-1, 3), null, "负分子归一为不脉冲");
assert.equal(awaitPulsePeriod(2, 1), null, "分子大于分母视为非法输入");
assert.equal(awaitPulsePeriod(2, undefined), null, "非法分母归一为不脉冲");
assert.equal(awaitPulsePeriod(1, 1), 0.5, "全部活动主会话处于等待行动时达到频率上限（最短周期）");
const periodQuarter = awaitPulsePeriod(1, 4);
const periodHalf = awaitPulsePeriod(2, 4);
const periodThreeQuarters = awaitPulsePeriod(3, 4);
assert.ok(periodHalf < periodQuarter && periodThreeQuarters < periodHalf, "等待行动占比越高周期越短（频率单调加快）");
assert.ok(periodThreeQuarters > 0.5 && periodQuarter < 1.6, "部分等待行动的周期落在封闭区间内");
// ---- R-01-001/AC-01 可重复的确定性渲染（见下） ｜ R-02-003/AC-01 渲染签名去重 ----
const e1 = buildEntries(snapshot, workspaces);
const e2 = buildEntries(snapshot, workspaces);
assert.equal(cardSignature(e1), cardSignature(e2), "相同状态签名相等→跳过重绘");
assert.notEqual(
	cardSignature(e1),
	cardSignature([{ ...e1[0], title: "改" }]),
	"状态变化签名必变",
);
assert.notEqual(
	cardSignature(e1),
	cardSignature([{ ...e1[0], workspaceKey: "/srv/elsewhere" }]),
	"工作区身份变化签名必变，徽标色相随之重绘（R-01-003/AC-08）",
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
const timeline = conversationWorkItems(chatSnapshot);
assert.deepEqual(timeline.map((item) => item.text), ["用户任务\n补充", "已完成\n详情", "read", "正在输出"], "工作项严格按主窗口 order 取最近 4 项并包含当前项");
assert.equal(timeline[2].detail, "/tmp/a", "工具详情沿用白名单摘要");
assert.equal(timeline[2].label, "Read", "工具标题复用主网页的 Read 语义");
assert.equal(timeline[2].toolName, "read", "工作项保留原始 tool name（折叠分组成员派生输入）");
assert.equal(timeline[2].callId, "c1", "工作项保留 call id（折叠分组成员派生输入）");
assert.equal(timeline[2].summary, "/tmp/a", "工具行摘要与标题分层");
const thinkItem = conversationWorkItems({
	chat: { order: ["think"], nodes: { get: () => ({ kind: "assistant-step", data: { turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "Planning path" }] } }) } },
})[0];
assert.equal(thinkItem.label, "思考", "推理工作项 label 为中文「思考」（R-01-012/AC-10）");
assert.equal(thinkItem.summary, "Planning path", "推理工作项摘要单独保留");
const grepItem = conversationWorkItems({
	chat: { order: ["grep"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "grep-1", call: { name: "grep", argsRaw: '{"pattern":"foo"}' } } } }) } },
})[0];
assert.equal(grepItem.label, "Grep", "grep 标题与主会话网页一致");
const globItem = conversationWorkItems({
	chat: { order: ["glob"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "glob-1", call: { name: "glob", argsRaw: "{}" } } } }) } },
})[0];
assert.equal(globItem.label, "Glob", "glob 标题与主会话网页一致（SEARCH_TITLES: glob → Glob）");
const webFetchItem = conversationWorkItems({
	chat: { order: ["wf"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "wf-1", call: { name: "web_fetch", argsRaw: '{"url":"https://a.b"}' } } } }) } },
})[0];
assert.equal(webFetchItem.label, "Fetch", "web_fetch 标题与主会话网页一致（WEB_TITLES: web_fetch → Fetch）");
const cordisItem = conversationWorkItems({
	chat: { order: ["c"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "c-1", call: { name: "cordis_run", argsRaw: "{}" } } } }) } },
})[0];
assert.equal(cordisItem.label, "Run Cordis Plugin", "cordis 动作标题使用主会话网页完整动宾文案");
const outsideCurrent = conversationWorkItems({
	chat: { order: ["u1", "u2", "u3", "u4", "u5"], nodes: { get: (key) => ({ key, kind: "user", data: { content: [{ type: "text", text: key }] } }) } },
	partial: { turn: 2, step: 0, blocks: [{ kind: "text", text: "当前项" }] },
});
assert.deepEqual(outsideCurrent.map((item) => item.text), ["u3", "u4", "u5", "当前项"], "当前项不在 order 时仅替换最旧项并保持 order 尾部");
const oldAssistantCurrent = conversationWorkItems({
	chat: {
		order: ["oldAssistant", "u2", "u3", "u4", "u5"],
		nodes: { get: (key) => key === "oldAssistant" ? { key, kind: "assistant-step", data: { blocks: [{ kind: "text", text: "旧当前" }] } } : { key, kind: "user", data: { content: [{ type: "text", text: key }] } } },
	},
	partial: { turn: 3, step: 0, blocks: [{ kind: "text", text: "当前更新" }] },
});
assert.deepEqual(oldAssistantCurrent.map((item) => item.text), ["u3", "u4", "u5", "当前更新"], "order 尾部外的旧 assistant 被 live 当前项原位替换");
// R-01-012/AC-09、AC-10 数据层 label 中文归一：正文「助手」、思考「思考」
const bodyLabelItems = conversationWorkItems({
	chat: { order: ["bd"], nodes: { get: (key) => ({ key, kind: "assistant-step", data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "text", text: "纯正文" }] } }) } },
});
assert.equal(bodyLabelItems[0].label, "助手", "正文工作项 label 为中文「助手」（R-01-012/AC-09）");
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
		// R-01-012/AC-05 冷路径用户行同样携带「用户」标签
		{ id: "user:1", kind: "user", icon: "user", label: "用户", text: "历史用户", detail: null, status: "done" },
		{ id: "assistant:2", kind: "assistant", icon: "assistant", text: "历史回复", detail: null, status: "done" },
	],
	"冷会话 history 按原始事件顺序降级",
);

// ---- R-01-017 折叠时间线（无条件折叠分组呈现，不依赖 dsh-auto-collapse）----
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
// R-01-012/AC-05 用户行 label 为中文「用户」（与 assistant 行「助手/思考」标签同构）
assert.equal(folded[0].label, "用户", "用户输入项 label 为中文「用户」（R-01-012/AC-05）");
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
	[{ id: "k", kind: "assistant", label: "思考", text: "正文输出", summary: "推理前置", detail: "推理前置", icon: "assistant", status: "done" },
	 { id: "q", kind: "tool", toolName: "grep", label: "Grep", summary: "a", icon: "search", status: "done" }],
	4);
assert.equal(split[0].fold, true, "reasoning 先行独立成思考组");
assert.equal(split[0].label, "已思考", "纯思考完成组标题为已思考（R-01-017/AC-03）");
assert.equal(split[0].summary, "推理前置", "思考组摘要为该推理文本（R-01-017/AC-04）");
assert.equal(split[0].icon, "assistant", "思考组行图标为思考图标");
// R-01-017/AC-02 reasoning+正文同节点剥离：推理只归组摘要，正文行不得重复显示推理文本（验收修正）
// R-01-012/AC-09 正文行 label 为中文「助手」
assert.equal(split[1].label, "助手", "正文行不再复用思考标签，label 为中文「助手」（R-01-012/AC-09）");
assert.equal(split[1].text, "正文输出", "正文为独立行且内容保留");
assert.equal(split[1].summary, "正文输出", "正文行摘要为正文而非推理文本");
assert.equal(split[1].detail, null, "正文行剥离推理文本");
assert.equal(split[1].stripNative, true, "正文行带 stripNative 标记，剥离推理文本避免重复呈现");
assert.ok(!String(split[1].summary).includes("推理"), "正文行不与组摘要重复");
assert.equal(split[2].fold, true, "正文后的工具独立成组");
// R-01-017/AC-02 验收反馈：工具组行后紧跟的同节点正文行不得与组摘要重复推理文本（东家现场场景）
const dedup = foldWorkGroups(
	[{ id: "t1", kind: "tool", toolName: "bash", label: "Bash", summary: "ls -la", icon: "bash", status: "done" },
	 { id: "k1", kind: "assistant", label: "思考", text: "这是正文", summary: "推理文本", detail: "推理文本", icon: "assistant", status: "done" }],
	4);
assert.equal(dedup[0].label, "运行了命令", "前组标题为运行了命令（R-01-017/AC-03）");
assert.equal(dedup[0].summary, "推理文本", "推理文本归组摘要（R-01-017/AC-04）");
assert.equal(dedup[0].icon, "bash", "tool 组行图标为命令图标（IconApiOutline14，与 auto-collapse chip 同源）");
assert.equal(dedup[1].label, "助手", "下一行为正文行而非思考行，label 为中文「助手」（R-01-012/AC-09）");
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
	{ id: "b1", kind: "assistant", label: "助手", text: "正文一", summary: "正文一", icon: "assistant", status: "done" },
	{ id: "t2", kind: "tool", toolName: "bash", label: "Bash", summary: "b", icon: "bash", status: "done" },
	{ id: "b2", kind: "assistant", label: "助手", text: "正文二", summary: "正文二", icon: "assistant", status: "done" },
	{ id: "t3", kind: "tool", toolName: "grep", label: "Grep", summary: "c", icon: "search", status: "done" },
];
const manyGroups = foldWorkGroups(manyFlat, 4);
assert.equal(manyGroups.length, 4, "折叠呈现下最多显示最近 4 个分组行（R-01-017/AC-06）");
assert.equal(manyGroups[3].id, "fold:work:t3", "顺序与主窗口一致，末位为最新工作项所在组");
assert.equal(manyGroups[0].kind, "assistant", "窗口内首行为最近正文（更早的用户项与 t1 组被挤出）");
assert.equal(manyGroups[0].text, "正文一", "正文行内容保留");
const groupIdStable = foldWorkGroups(manyFlat, 4)[3];
assert.equal(groupIdStable.id, manyGroups[3].id, "分组 id 稳定供渲染层 DOM 复用");

// ---- R-01-012/AC-12～AC-15 指令锚行：末尾进入、触顶停留、第二行顶替（C-039）----
const anchorNodes = new Map([
	["a-u1", { key: "a-u1", kind: "user", anchorSeq: 1, data: { content: [{ type: "text", text: "修复登录页" }] } }],
	["a-b1", { key: "a-b1", kind: "assistant-step", anchorSeq: 2, data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "text", text: "正文一" }] } }],
	["a-t1", { key: "a-t1", kind: "tool-call", anchorSeq: 3, data: { root: { kind: "tool-result", callId: "a-t1", call: { name: "bash", argsRaw: '{"command":"make"}' }, isError: false } } }],
	["a-b2", { key: "a-b2", kind: "assistant-step", anchorSeq: 4, data: { status: "settled", turn: 1, step: 1, blocks: [{ kind: "text", text: "正文二" }] } }],
	["a-t2", { key: "a-t2", kind: "tool-call", anchorSeq: 5, data: { root: { kind: "tool-result", callId: "a-t2", call: { name: "grep", argsRaw: '{"pattern":"x"}' }, isError: false } } }],
	["a-b3", { key: "a-b3", kind: "assistant-step", anchorSeq: 6, data: { status: "settled", turn: 1, step: 2, blocks: [{ kind: "text", text: "正文三" }] } }],
]);
const anchorBaseOrder = ["a-u1", "a-b1", "a-t1", "a-b2", "a-t2", "a-b3"];
const anchorTimeline = (order, nodes = anchorNodes, limit = 4) =>
	foldedConversationTimeline({ chat: { order, nodes: { get: (key) => nodes.get(key) } } }, limit);
const anchorIds = (rows) => rows.map((row) => row.id);
// AC-12：时间线为空时首条用户消息直接占据第一行并停留为锚行
const firstOnly = anchorTimeline(["a-u1"]);
assert.deepEqual(anchorIds(firstOnly), ["a-u1"], "空时间线首条用户消息独占第一行（R-01-012/AC-12）");
assert.equal(firstOnly[0].anchor, true, "空时间线首条用户消息直接停留为指令锚行（R-01-012/AC-12）");
assert.equal(firstOnly[0].kind, "user", "锚行保留用户行语义供渲染层复用图标/标签/下划线（R-01-012/AC-12）");
assert.equal(firstOnly[0].label, "用户", "锚行 label 为中文「用户」（R-01-012/AC-05）");
assert.equal(firstOnly[0].text, "修复登录页", "锚行内容为指令文本（R-01-012/AC-12）");
// AC-13：用户消息随新行到达滚动至第一行时停留为锚行，不再参与后续滚动
const shortPin = anchorTimeline(["a-u1", "a-b1", "a-t1"]);
assert.deepEqual(anchorIds(shortPin), ["a-u1", "a-b1", "fold:work:a-t1"], "短窗口内用户消息位于第一行即停留（R-01-012/AC-13）");
assert.equal(shortPin[0].anchor, true, "第一行用户消息以锚行停留（R-01-012/AC-13）");
const touchTop = anchorTimeline(["a-u1", "a-b1", "a-t1", "a-b2"]);
assert.deepEqual(anchorIds(touchTop), ["a-u1", "a-b1", "fold:work:a-t1", "a-b2"], "滚动触顶瞬间行位置不变（R-01-012/AC-13）");
assert.equal(touchTop[0].anchor, true, "触顶用户行停留为锚行（R-01-012/AC-13）");
const anchored = anchorTimeline(anchorBaseOrder);
assert.deepEqual(anchorIds(anchored), ["a-u1", "a-b2", "fold:work:a-t2", "a-b3"], "触顶后锚行停留首行、其后为最近 3 个工作显示行（R-01-012/AC-13、R-01-017/AC-06）");
assert.equal(anchored[0].anchor, true, "停留行以 anchor 标记前置语义（R-01-012/AC-13）");
assert.ok(anchored.slice(1).every((row) => row.anchor !== true), "仅首行带锚标记（R-01-012/AC-13）");
// AC-14：新工作项进入时间线，锚行位置与内容保持不变，仅推动其后工作显示行
const laterNodes = new Map(anchorNodes);
laterNodes.set("a-t3", { key: "a-t3", kind: "tool-call", anchorSeq: 7, data: { root: { kind: "tool-result", callId: "a-t3", call: { name: "bash", argsRaw: '{"command":"ls"}' }, isError: false } } });
assert.deepEqual(anchorIds(anchorTimeline([...anchorBaseOrder, "a-t3"], laterNodes)), ["a-u1", "fold:work:a-t2", "a-b3", "fold:work:a-t3"], "新动作进入时锚行不变、仅其后工作行滚动（R-01-012/AC-14）");
// AC-12 核心回归：回合结束后新指令作为普通显示行追加在时间线末尾，已有内容不清空
const turn2Nodes = new Map(anchorNodes);
turn2Nodes.set("a-u2", { key: "a-u2", kind: "user", anchorSeq: 7, data: { content: [{ type: "text", text: "追加指令" }] } });
const arrived = anchorTimeline([...anchorBaseOrder, "a-u2"], turn2Nodes);
assert.deepEqual(anchorIds(arrived), ["a-u1", "fold:work:a-t2", "a-b3", "a-u2"], "新指令到达末尾时旧锚停留、工作行保留不清空（R-01-012/AC-12、AC-14）");
assert.equal(arrived.at(-1).kind, "user", "新指令为时间线末行普通用户行（R-01-012/AC-12）");
assert.equal(arrived.at(-1).anchor ?? false, false, "新指令尚未滚动至第二行，不带锚标记（R-01-012/AC-15）");
// AC-12：新指令随后续新行到达向上滚动
turn2Nodes.set("a-b4", { key: "a-b4", kind: "assistant-step", anchorSeq: 8, data: { status: "settled", turn: 2, step: 0, blocks: [{ kind: "text", text: "正文四" }] } });
const scrolled = anchorTimeline([...anchorBaseOrder, "a-u2", "a-b4"], turn2Nodes);
assert.deepEqual(anchorIds(scrolled), ["a-u1", "a-b3", "a-u2", "a-b4"], "新指令随新行到达向上滚动一行（R-01-012/AC-12）");
// AC-15：新指令滚动至第二行时取代旧锚行成为第一行，其后各行上移一行、暂减一行
turn2Nodes.set("a-b5", { key: "a-b5", kind: "assistant-step", anchorSeq: 9, data: { status: "settled", turn: 2, step: 1, blocks: [{ kind: "text", text: "正文五" }] } });
const replaced = anchorTimeline([...anchorBaseOrder, "a-u2", "a-b4", "a-b5"], turn2Nodes);
assert.deepEqual(anchorIds(replaced), ["a-u2", "a-b4", "a-b5"], "新指令到第二行时顶替旧锚、其后各行上移且暂减一行（R-01-012/AC-15）");
assert.equal(replaced[0].anchor, true, "顶替后新指令停留为第一行锚行（R-01-012/AC-15）");
assert.equal(replaced[0].text, "追加指令", "顶替行内容为新指令（R-01-012/AC-15）");
assert.ok(!replaced.some((row) => row.text === "修复登录页"), "旧指令锚行随顶替消失（R-01-012/AC-15）");
// AC-15：顶替后新行到达恢复总预算，不从窗口之外回填旧行
turn2Nodes.set("a-b6", { key: "a-b6", kind: "assistant-step", anchorSeq: 10, data: { status: "settled", turn: 2, step: 2, blocks: [{ kind: "text", text: "正文六" }] } });
const refilled = anchorTimeline([...anchorBaseOrder, "a-u2", "a-b4", "a-b5", "a-b6"], turn2Nodes);
assert.deepEqual(anchorIds(refilled), ["a-u2", "a-b4", "a-b5", "a-b6"], "顶替后新行到达恢复 4 行（R-01-012/AC-15）");
// AC-15 短窗同口径：时间线不足一窗时，更近用户消息位于显示第二行即顶替（按行位置而非窗口计数）
const shortReplace = anchorTimeline(["a-u1", "a-u2", "a-b1"], turn2Nodes);
assert.deepEqual(anchorIds(shortReplace), ["a-u2", "a-b1"], "短窗口内新指令位于第二行即顶替旧锚（R-01-012/AC-15）");
assert.equal(shortReplace[0].anchor, true, "顶替后新指令停留为第一行锚行（R-01-012/AC-15）");
const shortNoReplace = anchorTimeline(["a-u1", "a-b1", "a-u2"], turn2Nodes);
assert.deepEqual(anchorIds(shortNoReplace), ["a-u1", "a-b1", "a-u2"], "新指令位于第三行时旧锚停留、不顶替（R-01-012/AC-15）");
assert.equal(shortNoReplace[0].anchor, true, "旧锚停留至新指令滚动至第二行（R-01-012/AC-15）");
assert.equal(refilled[0].anchor, true, "恢复后新指令保持第一行锚行（R-01-012/AC-15）");
// limit 边界：max=1 时窗口收缩为空、仅锚行一行
const tinyWindow = foldedConversationTimeline({ chat: { order: anchorBaseOrder, nodes: { get: (key) => anchorNodes.get(key) } } }, 1);
assert.equal(tinyWindow.length, 1, "max=1 时总行数 1：锚行独占、窗口收缩为空（R-01-012/AC-13）");
assert.equal(tinyWindow[0].anchor, true, "max=1 时锚行仍停留首行（R-01-012/AC-13）");
assert.equal(tinyWindow[0].text, "修复登录页", "max=1 时锚行内容正确（R-01-012/AC-13）");
// AC-15 负向：空文本用户行不参与停留与顶替，仅作为普通显示行滚动
const emptyHeadNodes = new Map(anchorNodes);
emptyHeadNodes.set("a-e2", { key: "a-e2", kind: "user", anchorSeq: 7, data: { content: [{ type: "text", text: "  " }] } });
emptyHeadNodes.set("a-b4", { key: "a-b4", kind: "assistant-step", anchorSeq: 8, data: { status: "settled", turn: 2, step: 0, blocks: [{ kind: "text", text: "正文四" }] } });
const emptyScroll = anchorTimeline([...anchorBaseOrder, "a-e2", "a-b4"], emptyHeadNodes);
assert.deepEqual(anchorIds(emptyScroll), ["a-u1", "a-b3", "a-e2", "a-b4"], "空文本用户行作为普通行滚动、不顶替旧锚（R-01-012/AC-15）");
assert.equal(emptyScroll[0].text, "修复登录页", "空文本行到达后旧锚保留（R-01-012/AC-15）");
const emptyShort = anchorTimeline(["a-e2", "a-b1"], emptyHeadNodes);
assert.deepEqual(anchorIds(emptyShort), ["a-e2", "a-b1"], "空文本用户行在时间线内按普通显示行（R-01-012/AC-15）");
assert.ok(emptyShort.every((row) => row.anchor !== true), "空文本用户行永不停留为锚行（R-01-012/AC-15）");
// ×3 扩窗收集不足时经廉价前走命中窗口前的用户节点（不做全序转换）
const longNodes = new Map([["L-u1", { key: "L-u1", kind: "user", anchorSeq: 0, data: { content: [{ type: "text", text: "深层指令" }] } }]]);
const longOrder = ["L-u1"];
for (let n = 0; n < 7; n += 1) {
	const bKey = `L-b${n}`;
	const tKey = `L-t${n}`;
	longNodes.set(bKey, { key: bKey, kind: "assistant-step", anchorSeq: n * 2 + 1, data: { status: "settled", turn: 1, step: n, blocks: [{ kind: "text", text: `正文${n}` }] } });
	longNodes.set(tKey, { key: tKey, kind: "tool-call", anchorSeq: n * 2 + 2, data: { root: { kind: "tool-result", callId: tKey, call: { name: "bash", argsRaw: '{"command":"echo"}' }, isError: false } } });
	longOrder.push(bKey, tKey);
}
const deepAnchor = foldedConversationTimeline({ chat: { order: longOrder, nodes: { get: (key) => longNodes.get(key) } } });
assert.equal(deepAnchor[0]?.anchor, true, "×3 扩窗收集不足时经廉价前走命中窗口前的用户节点（R-01-012/AC-12）");
assert.equal(deepAnchor[0]?.text, "深层指令", "前走命中的锚行内容正确（R-01-012/AC-12）");
// steering 消息按用户输入行归一参与锚行
const steeringAnchor = foldedConversationTimeline({
	chat: {
		order: ["s1", "a-b1", "a-t1", "a-b2", "a-t2", "a-b3"],
		nodes: { get: (key) => key === "s1"
			? { key: "s1", kind: "steering", anchorSeq: -1, data: { content: [{ type: "text", text: "插话补充" }] } }
			: anchorNodes.get(key) },
	},
});
assert.equal(steeringAnchor[0]?.anchor, true, "steering 消息按用户输入行归一参与锚行停留（R-01-012/AC-13）");
assert.equal(steeringAnchor[0]?.text, "插话补充", "steering 锚行内容正确（R-01-012/AC-13）");
// hidden 用户节点不入锚
const hiddenAnchor = foldedConversationTimeline({
	chat: {
		order: ["h1", "a-b1", "a-t1", "a-b2", "a-t2", "a-b3"],
		nodes: { get: (key) => key === "h1"
			? { key: "h1", kind: "user", visibility: "hidden", anchorSeq: -1, data: { content: [{ type: "text", text: "隐藏消息" }] } }
			: anchorNodes.get(key) },
	},
});
assert.ok(hiddenAnchor.every((row) => row.anchor !== true), "hidden 用户节点不作为指令锚行（R-01-012/AC-12）");
// AC-13 触顶停留：更近的用户输入行滚动触顶后停留为首行锚行，旧指令行不再出现
const switchNodes = new Map();
const switchOrder = ["w-u1"];
switchNodes.set("w-u1", { key: "w-u1", kind: "user", anchorSeq: 1, data: { content: [{ type: "text", text: "第一轮指令" }] } });
for (let n = 1; n <= 4; n += 1) switchNodes.set(`w-b${n}`, { key: `w-b${n}`, kind: "assistant-step", anchorSeq: n + 1, data: { status: "settled", turn: 1, step: n, blocks: [{ kind: "text", text: `正文${n}` }] } });
switchOrder.push("w-b1", "w-b2", "w-b3", "w-b4");
switchNodes.set("w-u2", { key: "w-u2", kind: "user", anchorSeq: 6, data: { content: [{ type: "text", text: "第二轮指令" }] } });
switchOrder.push("w-u2");
for (let n = 5; n <= 9; n += 1) switchNodes.set(`w-b${n}`, { key: `w-b${n}`, kind: "assistant-step", anchorSeq: n + 2, data: { status: "settled", turn: 1, step: n, blocks: [{ kind: "text", text: `正文${n}` }] } });
switchOrder.push("w-b5", "w-b6", "w-b7", "w-b8", "w-b9");
const switchedAnchor = foldedConversationTimeline({ chat: { order: switchOrder, nodes: { get: (key) => switchNodes.get(key) } } });
assert.equal(switchedAnchor[0]?.anchor, true, "更近的用户输入行滚动触顶后停留为新锚行（R-01-012/AC-13）");
assert.equal(switchedAnchor[0]?.text, "第二轮指令", "新锚行内容为更近的用户输入行（R-01-012/AC-13）");
assert.ok(!switchedAnchor.some((row) => row.text === "第一轮指令"), "被取代的旧指令行不再出现（R-01-012/AC-13）");
// 空文本用户输入行不作锚（前缀扫描与前走同口径）
const emptyUserAnchor = foldedConversationTimeline({
	chat: {
		order: ["e1", "a-b1", "a-t1", "a-b2", "a-t2", "a-b3"],
		nodes: { get: (key) => key === "e1"
			? { key: "e1", kind: "user", anchorSeq: -1, data: { content: [{ type: "text", text: "   " }] } }
			: anchorNodes.get(key) },
	},
});
assert.ok(emptyUserAnchor.every((row) => row.anchor !== true), "空文本用户输入行不作为指令锚行（R-01-012/AC-15）");
// 冷 history 路径同口径指令锚行（R-01-012/AC-12）：页内全部事件折叠后套用同一窗口/锚行选择
const hUser = (seq, text) => ({ event: { type: "user/message", seq, data: { source: { kind: "user" }, content: [{ type: "text", text }] } } });
const hAgent = (seq, text) => ({ event: { type: "assistant/message", seq, data: { message: { content: [{ type: "text", text }] } } } });
const hToolCall = (seq, callId, name = "bash", argsRaw = "{}") => ({ event: { type: "tool/call", seq, data: { turn: 1, step: 0, callId, name, arguments: argsRaw } } });
// canonical tool/result 事件形状（dsh-tool-cordis SessionEvent 契约）：data = { turn, step, message: ToolResultMessage, error? }。
const hToolResult = (seq, callId, { isError = false, error = null, text = "ok" } = {}) => ({
	event: {
		type: "tool/result",
		seq,
		data: {
			turn: 1,
			step: 0,
			message: { source: { kind: "tool", callId }, content: [{ type: "tool-result", toolCallId: callId, content: [{ type: "text", text }], isError }] },
			...(error === null ? {} : { error }),
		},
	},
});
const hToolDone = (seq) => hToolResult(seq, `hc${seq}`);
const histAnchored = foldedHistoryTimeline([hUser(1, "冷指令"), hAgent(2, "回复一"), hToolDone(3), hToolDone(4), hAgent(5, "回复二"), hToolDone(6)]);
assert.equal(histAnchored.length, 4, "冷 history 路径锚行计入总预算：含锚行合计不超过 4（R-01-012/AC-13）");
assert.equal(histAnchored[0].anchor, true, "冷路径最近用户消息滚动触顶后停留为首行锚行（R-01-012/AC-13）");
assert.equal(histAnchored[0].kind, "user", "冷路径锚行保留用户行语义（R-01-012/AC-12）");
assert.equal(histAnchored[0].text, "冷指令", "冷路径锚行内容为最近用户消息（R-01-012/AC-13）");
assert.ok(histAnchored.slice(1).every((row) => row.anchor !== true), "冷路径仅首行带锚标记（R-01-012/AC-13）");
const histInWindow = foldedHistoryTimeline([hUser(1, "近指令"), hAgent(2, "回复")]);
assert.equal(histInWindow.length, 2, "冷路径短时间线全量展示（R-01-012/AC-12）");
assert.equal(histInWindow[0].anchor, true, "冷路径用户消息占据第一行即停留为锚行（R-01-012/AC-13）");
assert.ok(foldedHistoryTimeline([hAgent(1, "仅回复"), hToolDone(2)]).every((row) => row.anchor !== true), "history 无用户消息时不造锚行");
// ---- R-01-016/AC-01 回归：冷 history 路径 tool/result 按 canonical 形状落定同 callId 的 tool/call 项——
//     已完成会话的等待卡时间线不残留 running 行（修复前 call 项永久 running，被活动保留逻辑钉为尾行蓝闪，
//     违反 R-01-009/AC-09「仅执行中行闪烁」与 AC-10「非运行中不适用尾部提升」的呈现前提）----
const coldPair = conversationTimelineFromHistory([hToolCall(1, "hc1"), hToolResult(2, "hc1")], 10);
assert.equal(coldPair.length, 1, "history 中同 callId 的 call/result 配对为一项，不产生重复行");
assert.equal(coldPair[0].status, "done", "结果到达后调用项落定 done，不残留 running");
assert.equal(coldPair[0].label, "Bash", "配对项沿用 call 事件的工具名（result 事件不携带 name/arguments）");
const coldDoneCard = foldedHistoryTimeline([hUser(1, "任务"), hToolCall(2, "hc2"), hToolResult(3, "hc2"), hAgent(4, "完成")]);
assert.ok(coldDoneCard.length > 0 && coldDoneCard.every((row) => row.status !== "running"), "已完成会话冷时间线无 running 行：等待卡尾行不蓝闪（R-01-016/AC-01）");
const coldError = conversationTimelineFromHistory([hToolCall(1, "hc3"), hToolResult(2, "hc3", { isError: true, text: "boom\nstack" })], 10);
assert.equal(coldError[0].status, "error", "isError 结果落定 error");
assert.equal(coldError[0].summary, "boom", "error 摘要取结果内容首行（原生 resultText 语义）");
const coldInterrupted = conversationTimelineFromHistory([hToolCall(1, "hc4"), hToolResult(2, "hc4", { error: { name: "Error", code: "interrupted" }, text: "" })], 10);
assert.equal(coldInterrupted[0].status, "stopped", "interrupted 结果落定 stopped 而非 error");
const coldOrphan = conversationTimelineFromHistory([hToolResult(1, "hc9")], 10);
assert.equal(coldOrphan.length, 1, "call 在窗口外的孤儿 result 仍成行（信息不丢失）");
assert.equal(coldOrphan[0].status, "done", "孤儿 result 落定 done，不造 running 行");
// historyInstructionAnchor：尾扫最近一条非空文本真实用户消息（R-01-012/AC-12 快照窗口外兜底）
assert.equal(historyInstructionAnchor([hUser(1, "旧指令"), hAgent(2, "回复"), hUser(3, "新指令")])?.text, "新指令", "锚行取最近一条用户消息");
assert.equal(historyInstructionAnchor([hUser(1, "  "), hAgent(2, "回复")]), null, "空文本用户消息不作锚");
assert.equal(historyInstructionAnchor([{ event: { type: "user/message", seq: 1, data: { source: { kind: "recall" }, content: [{ type: "text", text: "召回" }] } } }]), null, "非真实用户来源不作锚");
assert.equal(historyInstructionAnchor([hAgent(1, "仅回复")]), null, "无用户消息返回 null");
assert.equal(historyInstructionAnchor(null), null, "非数组输入归一 null");
// history fallback anchor 作为 foldedConversationTimeline 的显式输入（R-01-012/AC-12、C-035、C-039）。
const anchorRow = historyInstructionAnchor([hUser(9, "兜底指令")]);
// C-039：快照窗口内有新指令但旧锚已滚出尾窗时，fallbackAnchor 充当停留锚行，新指令自末尾参与滚动
const fallScrollNodes = new Map(anchorNodes);
fallScrollNodes.set("a-u2", { key: "a-u2", kind: "user", anchorSeq: 7, data: { content: [{ type: "text", text: "追加指令" }] } });
const fallScroll = foldedConversationTimeline(
	{ chat: { order: ["a-b1", "a-t1", "a-b2", "a-u2"], nodes: { get: (key) => fallScrollNodes.get(key) } }, running: true, pending: [] },
	4,
	"",
	false,
	false,
	anchorRow,
);
assert.deepEqual(fallScroll.map((row) => row.id), [anchorRow.id, "fold:work:a-t1", "a-b2", "a-u2"], "窗口外旧锚经 fallback 停留首行，新指令末尾进入不清空（R-01-012/AC-12、AC-14）");
assert.equal(fallScroll.at(-1).anchor ?? false, false, "新指令未达第二行前不带锚标记（R-01-012/AC-15）");
// fallback 与窗口内最近用户行同文本时判为同一消息：不双行、不顶替
const sameTextAnchor = historyInstructionAnchor([hUser(9, "追加指令")]);
const fallDedup = foldedConversationTimeline(
	{ chat: { order: ["a-b1", "a-t1", "a-b2", "a-u2"], nodes: { get: (key) => fallScrollNodes.get(key) } }, running: true, pending: [] },
	4,
	"",
	false,
	false,
	sameTextAnchor,
);
assert.deepEqual(fallDedup.map((row) => row.id), ["a-b1", "fold:work:a-t1", "a-b2", "a-u2"], "fallback 与窗口内用户行同消息时不产生双行（R-01-012/AC-15）");
assert.ok(fallDedup.every((row) => row.anchor !== true), "同消息 fallback 不造锚行（R-01-012/AC-15）");
// fallback 充当的停留锚行同样被滚动至第二行的新指令顶替（AC-15 统一口径）
const fallReplaced = foldedConversationTimeline(
	{ chat: { order: ["a-b1", "a-t1", "a-u2", "a-b2", "a-b3"], nodes: { get: (key) => fallScrollNodes.get(key) } }, running: true, pending: [] },
	4,
	"",
	false,
	false,
	anchorRow,
);
assert.deepEqual(fallReplaced.map((row) => row.id), ["a-u2", "a-b2", "a-b3"], "fallback 停留锚行被滚动至第二行的新指令顶替、暂减一行（R-01-012/AC-15）");
assert.equal(fallReplaced[0].anchor, true, "顶替 fallback 的新指令停留为第一行锚行（R-01-012/AC-15）");
// R-01-009/AC-11 与自然窗口共存：首行用户行停留为锚行，真实 running 行保留末行
const natLiveNodes = new Map(anchorNodes);
natLiveNodes.set("a-live", { key: "a-live", kind: "assistant-step", anchorSeq: 7, data: { status: "running", turn: 2, step: 0, blocks: [{ kind: "reasoning", text: "正在执行的内容" }] } });
const natLive = foldedConversationTimeline(
	{ chat: { order: ["a-u1", "a-b1", "a-live"], nodes: { get: (key) => natLiveNodes.get(key) } }, running: true, pending: [] },
);
assert.equal(natLive[0]?.anchor, true, "自然窗口首行用户行停留为锚行（R-01-012/AC-13）");
assert.equal(natLive.at(-1)?.status, "running", "真实 running 行保留末行（R-01-009/AC-11）");
assert.equal(natLive.at(-1)?.summary, "正在执行的内容", "末行保留真实活动文字（R-01-009/AC-11）");

// R-01-009/AC-11：history 锚行参与核心单次选择，真实 running 行即使位于四工作行首位也必须保留为末行。
const fallbackActivityNodes = new Map([
	["live-first", { key: "live-first", kind: "assistant-step", data: { status: "running", turn: 2, step: 0, blocks: [{ kind: "reasoning", text: "真正当前正在执行的内容" }] } }],
	["done-1", { key: "done-1", kind: "assistant-step", data: { status: "settled", turn: 2, step: 1, blocks: [{ kind: "text", text: "较新完成消息一" }] } }],
	["done-2", { key: "done-2", kind: "assistant-step", data: { status: "settled", turn: 2, step: 2, blocks: [{ kind: "text", text: "较新完成消息二" }] } }],
	["done-3", { key: "done-3", kind: "assistant-step", data: { status: "settled", turn: 2, step: 3, blocks: [{ kind: "text", text: "较新完成消息三" }] } }],
]);
const fallbackActivity = foldedConversationTimeline(
	{ chat: { order: [...fallbackActivityNodes.keys()], nodes: { get: (key) => fallbackActivityNodes.get(key) } }, running: true, pending: [] },
	4,
	"",
	false,
	false,
	anchorRow,
);
assert.deepEqual(fallbackActivity.map((row) => row.id), [anchorRow.id, "done-2", "done-3", "fold:work:live-first"], "history 锚行 + 最近两条历史工作行 + 真实活动末行，总计 4 行（R-01-009/AC-11、R-01-012/AC-12）");
assert.equal(fallbackActivity.at(-1)?.summary, "真正当前正在执行的内容", "末行保留真实活动文字，不由旧尾内容冒充（R-01-009/AC-11）");
assert.equal(fallbackActivity.at(-1)?.status, "running", "真实当前活动末行保持 running 蓝闪状态（R-01-009/AC-11）");
// 多个真实 live 显示行共存时，最新 live 分组占据末行，较早 live 行只参与剩余历史名额。
const multiLiveNodes = new Map([
	["multi-done-1", { key: "multi-done-1", kind: "assistant-step", data: { status: "settled", turn: 4, step: 1, blocks: [{ kind: "text", text: "多 live 前完成一" }] } }],
	["multi-done-2", { key: "multi-done-2", kind: "assistant-step", data: { status: "settled", turn: 4, step: 2, blocks: [{ kind: "text", text: "多 live 前完成二" }] } }],
]);
const multiLive = foldedConversationTimeline(
	{
		chat: { order: [...multiLiveNodes.keys()], nodes: { get: (key) => multiLiveNodes.get(key) } },
		partial: { turn: 4, step: 3, blocks: [{ kind: "text", text: "正在流式回复" }] },
		runningCalls: [{ callId: "live-call", name: "bash", argsRaw: '{"command":"pnpm check"}', turn: 4, step: 4 }],
		running: true,
		pending: [],
	},
	4,
	"",
	false,
	false,
	anchorRow,
);
assert.equal(multiLive.length, 4, "多个 live 行与锚行仍遵守四行总预算（R-01-009/AC-11、R-01-012/AC-12）");
assert.equal(multiLive.filter((row) => row.live === true && row.status === "running").length, 2, "partial 与 running call 的真实 live 身份穿透折叠层（R-01-009/AC-11）");
assert.equal(multiLive.at(-1)?.id, "fold:work:live-call", "多个 live 行取最新 live 分组置于末行（R-01-009/AC-11）");
assert.equal(multiLive.at(-1)?.summary, "pnpm check", "最新 live 分组末行保留当前调用内容（R-01-009/AC-11）");
// 无真实 running 时仍保留 AC-10 尾部持续标志，但 history 锚行与工作预算由同一选择完成。
const fallbackPromotedNodes = new Map(Array.from({ length: 4 }, (_, index) => {
	const n = index + 1;
	return [`fallback-done-${n}`, { key: `fallback-done-${n}`, kind: "assistant-step", data: { status: "settled", turn: 3, step: n, blocks: [{ kind: "text", text: `完成消息${n}` }] } }];
}));
const fallbackPromoted = foldedConversationTimeline(
	{ chat: { order: [...fallbackPromotedNodes.keys()], nodes: { get: (key) => fallbackPromotedNodes.get(key) } }, running: true, pending: [] },
	4,
	"",
	false,
	false,
	anchorRow,
);
assert.deepEqual(fallbackPromoted.map((row) => row.id), [anchorRow.id, "fallback-done-2", "fallback-done-3", "fallback-done-4"], "history 锚行占一格，最近三工作行回填（R-01-012/AC-12）");
assert.equal(fallbackPromoted.at(-1)?.status, "running", "无真实活动行时仅提升所选末行作为持续标志（R-01-009/AC-10）");


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

// ---- R-01-009/AC-06 回合进度：y = t/(t+k)，半衰期每帧按最新实测速率校准、允许回退（C-014、C-025、C-044）----
assert.equal(progressOf({ elapsedMs: 0 }), 0, "回合起点过原点 0%");
assert.equal(progressOf({ elapsedMs: 120_000 }), 18.2, "无速率保守默认半衰期 540s（20 tok/s 起步基准）2 分钟显示 18.2%");
assert.equal(progressOf({ elapsedMs: 360_000 }), 40, "保守默认下 6 分钟显示 40%");
assert.ok(progressOf({ elapsedMs: 86_400_000 }) < 100, "超长回合渐近 100% 永不到达");
const pEarly = progressOf({ elapsedMs: 30_000 });
const pLate = progressOf({ elapsedMs: 300_000 });
assert.ok(pLate > pEarly && pEarly > 0, "固定半衰期下随已耗时单调递增且先快后慢");
assert.ok(progressOf({ elapsedMs: Number.NaN }) === 0 && progressOf({ elapsedMs: -1 }) === 0, "非法已耗时归一为 0");
assert.ok(progressOf({}) === 0, "缺省入参归一为 0");
assert.equal(progressOf({ elapsedMs: 240_000, halfLifeSec: 240 }), 50, "校准半衰期 240s 时 4 分钟显示 50%");
assert.equal(progressOf({ elapsedMs: 120_000, halfLifeSec: 240 }), 33.3, "校准半衰期下 2 分钟显示 33.3%");
// 允许回退（C-044）：同一已耗时下 k 变化直接反映为进度变化——速率回落（k 回升）进度随之回退
assert.equal(progressOf({ elapsedMs: 300_000, halfLifeSec: 120 }), 71.4, "快速率（k=120）5 分钟显示 71.4%");
assert.equal(progressOf({ elapsedMs: 300_000, halfLifeSec: 540 }), 35.7, "速率回落 20 tok/s（k=540）同一时刻显示 35.7%（允许回退）");
assert.ok(
	progressOf({ elapsedMs: 300_000, halfLifeSec: 540 }) < progressOf({ elapsedMs: 300_000, halfLifeSec: 120 }),
	"k 回升时进度随之下调（实时估计语义，单调承诺撤销）",
);
assert.equal(progressOf({ elapsedMs: 120_000, halfLifeSec: Number.NaN }), 18.2, "非法半衰期回退保守默认 540s");
assert.equal(progressOf({ elapsedMs: 120_000, halfLifeSec: 0 }), 18.2, "非正半衰期回退保守默认 540s");
// 半衰期速率校准（progressHalfLifeSec）：k = clamp(120×90÷r, 60, 600)，r 为全会话累计输出速率 tok/s
assert.equal(progressHalfLifeSec({ rateTokS: 90 }), 120, "基准速率 90 tok/s 半衰期 120s（行为与校准前一致）");
assert.equal(progressHalfLifeSec({ rateTokS: 45 }), 240, "45 tok/s 半衰期按比例拉长为 240s");
assert.equal(progressHalfLifeSec({ rateTokS: 20 }), 540, "20 tok/s 半衰期 540s（与保守起步基点同值，起步值可被实测无缝接续）");
assert.equal(progressHalfLifeSec({ rateTokS: 180 }), 60, "180 tok/s 夹取下界 60s");
assert.equal(progressHalfLifeSec({ rateTokS: 300 }), 60, "超高速率仍夹取下界 60s");
assert.equal(progressHalfLifeSec({ rateTokS: 10 }), 600, "10 tok/s 夹取上界 600s");
assert.equal(progressHalfLifeSec({}), 540, "无可用速率取保守默认 540s（20 tok/s 起步基准）");
assert.ok(
	progressHalfLifeSec({ rateTokS: Number.NaN }) === 540 &&
		progressHalfLifeSec({ rateTokS: 0 }) === 540 &&
		progressHalfLifeSec({ rateTokS: -5 }) === 540,
	"非法/非正速率回退保守默认 540s",
);
// 注：R-01-009/AC-06 的"回合切换归零重计"由渲染层 turnTimings 新回合起点保证，属 GUI 验收项（scripts/acceptance.mjs）。
// ---- R-01-009/AC-06 委托周期进度锚点：周期内连续、周期外回合切换归零 ----
const anchorIdle = progressAnchor(null, { descendantActive: false, hostStartTime: null, now: 1000 });
assert.deepEqual(anchorIdle, { mode: "idle", anchor: null, turnStart: null, drainedAt: null }, "无后代无回合为 idle");
const anchorTurnA = progressAnchor(anchorIdle, { descendantActive: false, hostStartTime: 1000, now: 1000 });
// deepEqual 全形状比较同时验证状态不承载半衰期（C-044：冻结/继承/重捕获语义已废弃）
assert.deepEqual(anchorTurnA, { mode: "turn", anchor: 1000, turnStart: 1000, drainedAt: null }, "回合起点即锚点（且不承载 halfLifeSec）");
assert.equal(progressAnchor(anchorTurnA, { descendantActive: false, hostStartTime: 1000, now: 5000 }).anchor, 1000, "同回合锚点不变");
assert.equal(progressAnchor(anchorTurnA, { descendantActive: false, hostStartTime: 9000, now: 9000 }).anchor, 9000, "无活动后代时回合切换归零重计");
const anchorDeleg = progressAnchor(anchorTurnA, { descendantActive: true, hostStartTime: 1000, now: 2000 });
assert.deepEqual(anchorDeleg, { mode: "delegating", anchor: 1000, turnStart: 1000, drainedAt: null }, "进入委托周期锚点保持");
const anchorDelegIdle = progressAnchor(anchorDeleg, { descendantActive: true, hostStartTime: null, now: 8000 });
assert.equal(anchorDelegIdle.anchor, 1000, "自身回合结束后委托周期锚点连续（不归零、不打满）");
const anchorDelegNewTurn = progressAnchor(anchorDelegIdle, { descendantActive: true, hostStartTime: 9000, now: 9000 });
assert.equal(anchorDelegNewTurn.anchor, 1000, "settle 触发的新回合委托周期内不归零");
const anchorDrained = progressAnchor(anchorDelegNewTurn, { descendantActive: false, hostStartTime: 9000, now: 12000 });
assert.equal(anchorDrained.anchor, 1000, "后代全部结束、处理回合在飞时锚点仍连续");
assert.deepEqual(
	progressAnchor(anchorDrained, { descendantActive: false, hostStartTime: null, now: 20000 }),
	{ mode: "idle", anchor: null, turnStart: null, drainedAt: null },
	"处理回合完成即委托周期结束",
);
assert.equal(
	progressAnchor(anchorIdle, { descendantActive: false, hostStartTime: 30000, now: 30000 }).anchor,
	30000,
	"委托周期结束后新回合归零重计",
);
assert.deepEqual(
	progressAnchor(null, { descendantActive: true, hostStartTime: null, now: 42000 }),
	{ mode: "delegating", anchor: 42000, turnStart: null, drainedAt: null },
	"无已知起点时以进入委托周期时刻为起点（冷启动）",
);
// 后代耗尽后宽限内开始的新回合视为 settle 处理回合（锚点连续），超时视为全新回合（归零）。
const anchorDrainWait = progressAnchor(anchorDelegNewTurn, { descendantActive: false, hostStartTime: null, now: 30000 });
assert.equal(anchorDrainWait.mode, "delegating", "后代耗尽、无开放回合时委托周期不立即退出");
assert.equal(anchorDrainWait.drainedAt, 30000, "耗尽时刻记账供 settle 回合归属判定");
assert.equal(
	progressAnchor(anchorDrainWait, { descendantActive: false, hostStartTime: 31000, now: 31000 }).anchor,
	1000,
	"耗尽后宽限内开始的 settle 处理回合锚点连续（不归零）",
);
assert.equal(
	progressAnchor(anchorDrainWait, { descendantActive: false, hostStartTime: 91001, now: 91001 }).anchor,
	91001,
	"耗尽宽限超时后开始的新回合归零重计",
);
// 冷窗口回合起点兜底（R-01-009/AC-06）：history 事件尾扫——尾部最近边界为 turn/start 即开放回合起点
const turnStartEv = (seq, turn, time) => ({ event: { type: "turn/start", seq, time, data: { turn } } });
const turnEndEv = (seq, turn, time) => ({ event: { type: "turn/end", seq, time, data: { turn } } });
assert.equal(
	openTurnStartFromEvents([turnStartEv(1, 1, 1000), turnEndEv(2, 1, 2000), turnStartEv(3, 2, 5000)]),
	5000,
	"尾部边界为 turn/start 时返回其时刻（快照窗口外开放回合起点兜底）",
);
assert.equal(
	openTurnStartFromEvents([turnStartEv(1, 1, 1000), turnEndEv(2, 1, 2000)]),
	null,
	"尾部边界为 turn/end 时无开放回合",
);
assert.equal(
	openTurnStartFromEvents([turnStartEv(1, 1, 1000), turnEndEv(2, 1, 2000), turnStartEv(3, 2, 5000)], 3),
	null,
	"history 开放回合落后于快照已知回合（minTurn）时判为陈旧不采用",
);
assert.equal(openTurnStartFromEvents([turnStartEv(1, 1, Number.NaN)]), null, "turn/start 时刻非法时无可用起点");
assert.equal(openTurnStartFromEvents([]), null, "空事件无开放回合起点");
assert.equal(openTurnStartFromEvents(null), null, "非数组输入归一 null");
// 补读触发口径（R-01-009/AC-06）：仅「运行中 + 轮内订阅已建立 + 快照无开放回合起点」算缺口
assert.equal(
	openTurnStartMissing({ snapshotReady: true, running: true, hasLiveness: true, liveStartTime: null }),
	true,
	"运行中且快照无开放回合起点判定为缺口（超长回合冷窗口）",
);
assert.equal(
	openTurnStartMissing({ snapshotReady: true, running: true, hasLiveness: true, liveStartTime: 1000 }),
	false,
	"窗口内含开放回合起点时不是缺口",
);
assert.equal(
	openTurnStartMissing({ snapshotReady: true, running: false, hasLiveness: false, liveStartTime: null }),
	false,
	"等待/空闲会话（非运行、无 liveness 记录）不算缺口、不触发补读",
);
assert.equal(
	openTurnStartMissing({ snapshotReady: true, running: true, hasLiveness: false, liveStartTime: null }),
	false,
	"轮内订阅尚未建立时不算缺口（下一帧建立后再判定）",
);
assert.equal(
	openTurnStartMissing({ snapshotReady: false, running: true, hasLiveness: true, liveStartTime: null }),
	false,
	"快照未就绪走 historyNeeded 原路径，不算窗口缺口",
);

// ---- R-01-009/AC-07 工作项时间线的状态与主会话窗口语义摘要（无行级耗时，C-012）----
const statusTimeline = conversationWorkItems({
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
const runningTimeline = conversationWorkItems({
	chat: { order: [], nodes: { get: () => undefined } },
	runningCalls: [{ callId: "rc1", name: "web_search", argsRaw: '{"query":"dsh","url":"https://x"}', turn: 1, step: 0, time: 100 }],
});
assert.equal(runningTimeline[0].status, "running", "进行中工具调用状态为 running");
assert.equal(runningTimeline[0].detail, "dsh", "进行中工具参数摘要按 search variant 参数键取 query");
// R-01-009/AC-10 重构等价性钉住（评审）：live 项存在时不提升尾部 done 项——
// 旧守卫 liveItems.length===0 与现守卫 !some(running) 在可达语义上等价
// （live 项恒为 running：partial 硬编码 running，runningCalls 无 result kind）。
const livePlusTail = conversationWorkItems({
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
const idleGapTimeline = conversationWorkItems(idleGapSnapshot);
assert.equal(idleGapTimeline[0].status, "running", "运行中无 live 项时尾部已定案工具项提升为 running");
const idleGapSettled = conversationWorkItems({ ...idleGapSnapshot, running: false });
assert.equal(idleGapSettled[0].status, "done", "非运行中尾部已定案项保持 done");
assert.notEqual(idleGapTimeline[0], idleGapSettled[0], "提升产出克隆而非复用原引用");
const pendingIdle = conversationWorkItems({ ...idleGapSnapshot, pending: [{ kind: "approval" }] });
assert.equal(pendingIdle[0].status, "done", "等待用户行动时尾部不提升");
// pending 期间残留 running 行全部落定：等待卡时间线不再闪烁（R-01-016）。
const pendingRunning = foldedConversationTimeline({
	chat: { order: ["p1"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "被打断的思考" }] } }) } },
	running: false,
	pending: [{ kind: "approval" }],
}, 4, "");
assert.ok(pendingRunning.length > 0 && pendingRunning.every((row) => row.status !== "running"), "pending 期间无执行中显示行（不闪烁）");
assert.equal(pendingRunning.at(-1)?.status, "done", "pending 残留 running 行落定为 done");
// 正文流出 ⇒ 推理落定：live 正文行保持 running，拆入组的思考成员落定（R-01-017/AC-02）。
const liveTextFold = foldedConversationTimeline({
	chat: { order: [], nodes: { get: () => null } },
	running: true,
	partial: { turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "先想" }, { kind: "text", text: "正文输出中" }] },
}, 4, "");
const liveTextBody = liveTextFold.at(-1);
const liveTextGroup = liveTextFold.find((row) => row.fold === true);
assert.equal(liveTextBody?.status, "running", "流式正文行保持 running（真实在飞项）");
assert.ok(liveTextGroup !== undefined && liveTextGroup.status === "done", "正文流出后思考组落定，不与正文行同闪");
// 渲染层 idle 判定路径：等待卡使用冻结快照（running=true、无 pending 字段），idle=true 时残留 running 行同样落定（R-01-016）。
const frozenSnap = {
	chat: { order: ["f1"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "冻结时的思考" }] } }) } },
	running: true,
};
const frozenIdle = foldedConversationTimeline(frozenSnap, 4, "", false, true);
assert.ok(frozenIdle.length > 0 && frozenIdle.every((row) => row.status !== "running"), "idle=true 时冻结快照残留 running 行全部落定");
const frozenLive = foldedConversationTimeline(frozenSnap, 4, "", false, false);
assert.ok(frozenLive.some((row) => row.status === "running"), "idle=false 时冻结快照保持原状态（运行卡实时路径不受影响）");
// 委托周期（存在活动后代）视同运行中：尾部提升继续（R-01-009/AC-10）。
const delegatingFold = foldedConversationTimeline({ ...idleGapSnapshot, running: false }, 4, "", true);
assert.equal(delegatingFold[0].status, "running", "委托周期中尾部已定案项同样提升为 running");
// pending + 活动后代：快照级 idle 落定让位于委托语义（R-01-016 例外、R-01-009/AC-10）。
const pendingDescendant = foldedConversationTimeline({ ...frozenSnap, pending: [{ kind: "approval" }] }, 4, "", true);
assert.ok(pendingDescendant.some((row) => row.status === "running"), "pending 且后代活跃时快照 idle 落定不生效（保留在飞呈现）");
// 落定在分组之前：组标题由已定案成员派生，不出现 done 圆点配「正在思考」（R-01-017/AC-03）。
assert.equal(frozenIdle.at(-1)?.label, "已思考", "idle 落定后组标题随成员落定（不再显示「正在思考」）");
const nonDelegatingFold = foldedConversationTimeline({ ...idleGapSnapshot, running: false }, 4);
assert.equal(nonDelegatingFold[0].status, "done", "非运行且非委托周期尾部不提升");
const errorTail = conversationWorkItems({
	chat: { order: ["t"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "c2", call: { name: "bash", argsRaw: '{"command":"bad"}' }, isError: true } } }) } },
	running: true,
});
assert.equal(errorTail[0].status, "error", "尾部 error 项不提升，错误标识优先");
const stoppedTail = conversationWorkItems({
	chat: { order: ["t"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "c3", call: { name: "bash", argsRaw: '{"command":"sleep 9"}' }, isError: true, error: { code: "interrupted" } } } }) } },
	running: true,
});
assert.equal(stoppedTail[0].status, "stopped", "尾部 stopped 项不提升");
const userTail = conversationWorkItems({
	chat: { order: ["u"], nodes: { get: () => ({ kind: "user", data: { content: [{ type: "text", text: "任务" }] } }) } },
	running: true,
});
assert.equal(userTail[0].status, "done", "尾部用户输入项保持 done（提升不适用）");
const liveTailUnchanged = conversationWorkItems({ ...idleGapSnapshot, runningCalls: [{ callId: "rc9", name: "grep", argsRaw: '{"pattern":"x"}', turn: 1, step: 0 }] });
assert.equal(liveTailUnchanged.map((item) => item.status).join(","), "done,running", "live 项存在时不额外提升已定案项");
const midRunningTimeline = conversationWorkItems({
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

// ---- R-01-012/AC-03 fallback 文字镜像原生 keyed/通用行，选中/非选中态不漂移 ----
const todoItem = conversationWorkItems({
	chat: { order: ["td"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "td1", call: { name: "todo_write", argsRaw: '{"todos":[{"content":"写代码","status":"completed"},{"content":"写测试","status":"in_progress"},{"content":"部署","status":"pending"}]}' }, isError: false } } }) } },
})[0];
assert.equal(todoItem.label, "更新任务清单", "todo_write 标题镜像原生 keyed 行");
assert.equal(todoItem.detail, "1/3 已完成 · 写测试", "todo_write 摘要复刻原生进度文案");
const askRunning = conversationWorkItems({
	chat: { order: [], nodes: { get: () => undefined } },
	runningCalls: [{ callId: "q1", name: "ask_user_question", argsRaw: '{"questions":[]}', turn: 1, step: 0 }],
})[0];
assert.equal(askRunning.label, "提问", "ask_user_question 标题镜像原生 keyed 行");
assert.equal(askRunning.detail, "等待回答", "ask 进行中摘要镜像原生等待文案");
const askAnswered = conversationWorkItems({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q2", call: { name: "ask_user_question", argsRaw: "{}" }, isError: false, content: [{ type: "text", text: '{"answers":[{"selected":["a"]},{"selected":[],"custom":""}]}' }] } } }) } },
})[0];
assert.equal(askAnswered.detail, "1/2 已回答", "ask 定案摘要复刻原生已答计数");
const askAnsweredMultiBlock = conversationWorkItems({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q2m", call: { name: "ask_user_question", argsRaw: "{}" }, isError: false, content: [{ type: "text", text: '{"answers":[{"selected":["a"]},' }, { type: "text", text: '{"selected":[]}]}' }] } } }) } },
})[0];
assert.equal(askAnsweredMultiBlock.detail, "1/2 已回答", "ask 多块结果文本以空串拼接解析（镜像原生 join 语义）");
const askCancelled = conversationWorkItems({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q3", call: { name: "ask_user_question", argsRaw: "{}" }, isError: true, error: { name: "AskError", code: "ASK_CANCELLED" } } } }) } },
})[0];
assert.equal(askCancelled.detail, "已取消", "ask 取消摘要镜像原生");
assert.equal(askCancelled.status, "error", "ask 取消保持 error 状态");
const askAborted = conversationWorkItems({
	chat: { order: ["q"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "q4", call: { name: "ask_user_question", argsRaw: "{}" }, isError: true, error: { name: "AskError", code: "ASK_ABORTED" } } } }) } },
})[0];
assert.equal(askAborted.detail, "已中断", "ask 中断摘要镜像原生");
assert.equal(askAborted.status, "stopped", "ask 中断状态归 stopped（镜像原生）");
const unknownTool = conversationWorkItems({
	chat: { order: ["x"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "x1", call: { name: "my_mcp_tool", argsRaw: '{"note":"hi"}' } } } }) } },
})[0];
assert.equal(unknownTool.label, "Tool call", "未知工具标题镜像原生 others variant");
assert.equal(unknownTool.detail, "my_mcp_tool · hi", "未知工具摘要带 `工具名 · ` 前缀（镜像原生）");
const cordisDefine = conversationWorkItems({
	chat: { order: ["cd"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-call", callId: "cd1", call: { name: "cordis_define", argsRaw: '{"name":"my-plugin"}' } } } }) } },
})[0];
assert.equal(cordisDefine.label, "注册 Cordis 插件", "cordis_define 标题镜像原生 keyed 行");
assert.equal(cordisDefine.detail, "my-plugin", "cordis_define 摘要取插件名参数（keyed 行无前缀）");
const failedBash = conversationWorkItems({
	chat: { order: ["f"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "f1", call: { name: "bash", argsRaw: '{"command":"bad","description":"跑坏命令"}' }, isError: true, content: [{ type: "text", text: "boom happened\nstack line" }] } } }) } },
})[0];
assert.equal(failedBash.status, "error", "失败 bash 状态为 error");
assert.equal(failedBash.detail, "boom happened", "错误态摘要取结果输出首行（镜像原生 errorSummary）");
const interruptedBash = conversationWorkItems({
	chat: { order: ["i"], nodes: { get: () => ({ kind: "tool-call", data: { root: { kind: "tool-result", callId: "i1", call: { name: "bash", argsRaw: '{"command":"sleep 9"}' }, isError: true, error: { name: "Error", code: "interrupted" } } } }) } },
})[0];
assert.equal(interruptedBash.status, "stopped", "interrupted 归 stopped（镜像原生）");
assert.equal(interruptedBash.detail, "sleep 9", "stopped 不套用错误首行，保持参数摘要");
const thinkSettled = conversationWorkItems({
	chat: { order: ["th"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "settled", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "第一段\n第二段" }] } }) } },
})[0];
assert.equal(thinkSettled.summary, "第一段", "Think 摘要镜像原生 firstLine");
const thinkStreaming = conversationWorkItems({
	chat: { order: ["th"], nodes: { get: () => ({ kind: "assistant-step", data: { status: "running", turn: 1, step: 0, blocks: [{ kind: "reasoning", text: "第一段\n进行中段" }] } }) } },
})[0];
assert.equal(thinkStreaming.summary, "进行中段", "流式 Think 摘要镜像原生 latestLine");
const contextItem = conversationWorkItems({
	chat: { order: ["cx"], nodes: { get: () => ({ kind: "context", data: { content: [{ type: "text", text: "<system_prompt>…</system_prompt>" }], source: { kind: "agent-instructions", changes: [{ path: "AGENTS.md" }] }, provenance: { role: "inject", label: "AGENTS.md" } } }) } },
})[0];
assert.equal(contextItem.label, "上下文注入", "context 工作项标题镜像原生 ContextInjectionRow（注入）");
assert.equal(contextItem.summary, "AGENTS.md", "context 工作项摘要为来源标识而非注入内容原文");
const contextRecall = conversationWorkItems({
	chat: { order: ["cx"], nodes: { get: () => ({ kind: "context", data: { content: [{ type: "text", text: "召回内容" }], provenance: { role: "recall", label: "旧会话" } } }) } },
})[0];
assert.equal(contextRecall.label, "跨会话召回", "context 工作项标题镜像原生召回文案");
const contextNoProvenance = conversationWorkItems({
	chat: { order: ["cx"], nodes: { get: () => ({ kind: "context", data: { content: [{ type: "text", text: "<system_prompt>…</system_prompt>" }] } }) } },
})[0];
assert.equal(contextNoProvenance.label, "上下文注入", "provenance 缺失时回退注入标题（镜像原生 unreadable 兜底）");
assert.equal(contextNoProvenance.summary, "", "无来源标识时摘要为空，注入内容原文不上卡");
// R-01-012/AC-02
const unlocatedPartial = conversationWorkItems({
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
assert.deepEqual(conversationWorkItems(chatSnapshot, 0), [], "limit=0 返回空时间线");
assert.deepEqual(
	conversationWorkItems({ chat: { order: [], nodes: { get: () => undefined } } }),
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

// ---- R-01-014/AC-05、R-01-013/AC-03、AC-04 回溯翻页序列：一直向前翻到命中最近用户消息或翻尽 ----
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
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(calls.length, 1, "尾页含用户消息时一页即止，不回溯");
	assert.equal(result.error, null, "成功路径无 error");
}
{
	const calls = [];
	const fetchPage = async (beforeSeq) => {
		calls.push(beforeSeq);
		if (calls.length === 1) return pageOf([toolEvent(10)], true);
		return pageOf([userEvent(1, "更早用户"), agentEvent(2, "更早回复")], false);
	};
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(calls.length, 2, "尾页无用户消息时向前回溯");
	assert.deepEqual(calls[1], 10, "beforeSeq 取上页页首事件 seq");
	assert.deepEqual(
		messagePreviews({ history: result.events }),
		{ userPreview: "更早用户", agentPreview: "更早回复" },
		"回溯后预览取自更早页",
	);
}
// R-01-013/AC-03 回溯承诺：一直向前翻，直到命中最近一条用户消息——
// 实证约 28% 会话的最后用户消息距尾部 >150 事件（旧 3 页上限外）。
{
	const calls = [];
	const fetchPage = async (beforeSeq) => {
		calls.push(beforeSeq);
		if (calls.length === 4) return pageOf([toolEvent(1), userEvent(2, "深处用户")], false);
		return pageOf([toolEvent(100 - calls.length)], true);
	};
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(calls.length, 4, "用户消息在第 4 页（远超旧 3 页上限）时仍持续回溯直至命中");
	assert.deepEqual(
		messagePreviews({ history: result.events }),
		{ userPreview: "深处用户", agentPreview: "" },
		"回溯命中远处用户消息即止；agent 预览缺失不影响停止条件",
	);
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return pageOf([toolEvent(100 - calls)], calls < 5);
	};
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(calls, 5, "全程无用户消息时回溯直至翻尽（hasMore=false），不以固定页数截断");
	assert.equal(result.events.length, 5, "已翻事件全部保留");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return pageOf([toolEvent(calls)], false);
	};
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(calls, 1, "hasMore=false 即止");
}
{
	// 显式 maxPages 仍作护栏（防畸形数据的显式界；默认 Infinity 即无界）。
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return pageOf([toolEvent(calls)], true);
	};
	const result = await pagedHistoryEvents({ fetchPage, maxPages: 3 });
	assert.equal(calls, 3, "显式 maxPages 护栏仍生效（默认无界）");
	assert.equal(result.events.length, 3, "护栏内已翻事件全部保留");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		if (calls === 2) throw new Error("network");
		return pageOf([toolEvent(calls)], true);
	};
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(result.events.length, 1, "回溯中途失败保留已得事件");
	assert.ok(result.error instanceof Error, "失败以 error 返回供降级展示");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return calls === 1 ? pageOf([toolEvent(1)], true) : null;
	};
	const result = await pagedHistoryEvents({ fetchPage });
	assert.equal(calls, 2, "业务错误（null）即停止");
	assert.equal(result.events.length, 1, "业务错误前已得事件保留");
}
// requireOpenTurnStart（R-01-009/AC-06 冷窗口兜底）：用户消息命中但开放回合起点未命中时继续回溯
{
	const calls = [];
	const fetchPage = async (beforeSeq) => {
		calls.push(beforeSeq);
		if (calls.length === 1) return pageOf([userEvent(50, "用户"), agentEvent(51, "回复")], true);
		return pageOf([{ event: { type: "turn/start", seq: 1, time: 1000, data: { turn: 1 } } }, toolEvent(2)], false);
	};
	const result = await pagedHistoryEvents({ fetchPage, requireOpenTurnStart: true });
	assert.equal(calls.length, 2, "用户消息命中但无开放回合起点时继续回溯（R-01-009/AC-06）");
	assert.equal(openTurnStartFromEvents(result.events), 1000, "回溯命中开放回合起点时刻");
}
{
	let calls = 0;
	const fetchPage = async () => {
		calls += 1;
		return pageOf([userEvent(calls * 2, "u"), agentEvent(calls * 2 + 1, "a")], calls < 2);
	};
	await pagedHistoryEvents({ fetchPage, requireOpenTurnStart: true });
	assert.equal(calls, 2, "无开放回合起点且翻尽（hasMore=false）即止，不以固定页数截断");
}
// R-01-013/AC-03、AC-04 多页取序：回溯组合的多页事件按旧→新排列，预览必须取最近命中而非最早
{
	assert.deepEqual(
		messagePreviews({
			history: [toolEvent(1), userEvent(2, "最早用户"), agentEvent(3, "最早回复"), toolEvent(4), userEvent(5, "最近用户"), agentEvent(6, "最近回复")],
		}),
		{ userPreview: "最近用户", agentPreview: "最近回复" },
		"多页回溯后预览取最近用户/agent 消息首行而非最早页",
	);
	assert.deepEqual(
		messagePreviews({
			history: [userEvent(1, "唯一用户"), agentEvent(2, "回复"), userEvent(3, "最新用户")],
		}),
		{ userPreview: "最新用户", agentPreview: "回复" },
		"最近用户消息在尾部的场景取尾部而非最早",
	);
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
// 真实"最近历史"是已处理（running:false 且无未确认完成）的非活动会话；
// 「待打开E」为宿主 completed 边沿标志但无完成登记——按 C-030 口径不受活动判定。
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
// R-01-001/AC-01、R-01-002/AC-03（C-030）：宿主 completed 边沿标志本身不再驱动显示——
// 无完成登记（completions 无记录）时 completed 行视为不活动，落入历史区。
const recentUncompleted = buildRecent(recentSnap, [], NOW);
assert.deepEqual(
	recentUncompleted.map((e) => e.id),
	["sAwait", "sB"],
	"completed 边沿标志不参与活动/历史判定；无完成登记时按历史窗口入历史区（C-030）",
);
// 完成登记存在时（未确认完成）：待开 E 显示为完成提醒并排除出历史区（AC-03、R-01-010/AC-06）。
const recentAcks = new Map([
	["sAwait", { lastTurnEnd: NOW - 1_000, ackedAt: null }],
	["sAwait2", { lastTurnEnd: NOW - 900, ackedAt: NOW - 2_000 }],
]);
const recent = buildRecent(recentSnap, [], NOW, undefined, {}, [], recentAcks);
assert.deepEqual(
	recent.map((e) => e.id),
	["sB"],
	"完成登记表中未确认完成的会话留在活动区、排除出历史区；已确认的不再排除（仍按窗口入区）",
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
}, [], recentAcks);
assert.deepEqual(
	recentWithPreviews[0],
	{
		id: "sB",
		kind: "recent",
		depth: 0,
		title: "旧B",
		workspaceTitle: "",
		workspaceKey: "",
		model: "Model M",
		reasoning: "High",
		userPreview: "用户首行",
		agentPreview: "回复首行",
		isCurrent: false,
		activityAt: NOW - 3_600_000,
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
const recentAfterIdle = buildRecent(recentSnap, [], NOW, undefined, {}, [], recentAcks);
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
	"历史区按最后活动时间倒序",
);

// ---- R-01-010/AC-08 最后活动时间：turn/end 提取与 max 归一 ----
assert.equal(lastTurnEndFromEvents([]), null, "空 history 无回合结束时刻");
assert.equal(
	lastTurnEndFromEvents([{ event: { type: "user/message", time: 100 } }]),
	null,
	"无 turn/end 时回退 null（中断会话不抛错）",
);
assert.equal(
	lastTurnEndFromEvents([
		{ event: { type: "turn/end", time: 1000, data: { turn: 1 } } },
		{ event: { type: "user/message", time: 2000 } },
		{ event: { type: "turn/end", time: 3000, data: { turn: 2 } } },
	]),
	3000,
	"history 取最后一条 turn/end 的时刻",
);
assert.equal(
	lastTurnEndFromEvents([
		{ event: { type: "turn/end", time: 1000, data: { turn: 1 } } },
		{ event: { type: "turn/end", data: { turn: 2 } } },
	]),
	1000,
	"最后 turn/end 缺有效 time 时继续向前取更早有效回合",
);
assert.equal(lastTurnEndFromTimings(new Map()), null, "无回合计时回退 null");
assert.equal(
	lastTurnEndFromTimings(new Map([[1, { startTime: 100 }]])),
	null,
	"回合未结束（无 endTime）不计",
);
assert.equal(
	lastTurnEndFromTimings(new Map([
		[1, { startTime: 100, endTime: 900 }],
		[2, { startTime: 1000 }],
		[3, { startTime: 2000, endTime: 2500 }],
	])),
	2500,
	"turnTimings 取最大 endTime，忽略未结束回合",
);
const refineSnap = {
	ids: ["sTurn", "sPrompt", "sNone"],
	byId: {
		sTurn: { id: "sTurn", displayTitle: "回合", running: false, updatedAt: NOW - 10_000 },
		sPrompt: { id: "sPrompt", displayTitle: "消息", running: false, updatedAt: NOW - 1_000 },
		sNone: { id: "sNone", displayTitle: "无回合", running: false, updatedAt: NOW - 5_000 },
	},
	current: null,
};
const refined = buildRecent(refineSnap, [], NOW, undefined, {}, [], null, null, {
	sTurn: NOW - 2_000, // 回合结束晚于宿主时间 → 精化为回合结束时刻
	sPrompt: NOW - 3_000, // 回合结束早于宿主时间（消息未处理）→ 取较新者
});
assert.deepEqual(
	refined.map((e) => [e.id, e.activityAt]),
	[["sPrompt", NOW - 1_000], ["sTurn", NOW - 2_000], ["sNone", NOW - 5_000]],
	"activityAt 取宿主列表时间与回合结束时刻的较新者并据此排序（R-01-010/AC-08）",
);

// ---- R-01-010/AC-09 数据在途先按宿主列表时间，到达后精化 ----
const unrefined = buildRecent(refineSnap, [], NOW);
assert.deepEqual(
	unrefined.map((e) => [e.id, e.activityAt]),
	[["sPrompt", NOW - 1_000], ["sNone", NOW - 5_000], ["sTurn", NOW - 10_000]],
	"回合结束时刻在途时先按宿主列表时间判定、排序与显示（R-01-010/AC-09）",
);
// 窗口下界语义：宿主时间超窗的会话不读取历史，即使回合在窗内结束也不入区（C-020 明示缺口）。
const crossWindow = buildRecent(
	{ ids: ["sLong"], byId: { sLong: { id: "sLong", displayTitle: "长回合", running: false, updatedAt: NOW - 25 * 3_600_000 } }, current: null },
	[],
	NOW,
	undefined,
	{},
	[],
	null,
	null,
	{ sLong: NOW - 1_000 },
);
assert.equal(crossWindow.length, 0, "宿主时间超窗的会话不入历史区（跨窗长回合缺口，C-020）");

// ---- R-01-002/AC-03、AC-05、AC-10～AC-12、R-01-010/AC-06 完成确认：未确认完成提醒保留活动卡；
//     显式确认（按钮）或新回合隐式更替后解除；打开/切走/刷新不解除（C-030）----
const holdBase = { id: "sB", displayTitle: "旧B", running: false, updatedAt: NOW - 1_000 };
const acks = (lastTurnEnd, ackedAt = null) => new Map([["sB", { lastTurnEnd, ackedAt }]]);
// completionReminder 成立判定：仅主会话、lastTurnEnd > ackedAt（无 ackedAt 视同未确认）。
assert.equal(completionReminder(holdBase, { lastTurnEnd: 1000, ackedAt: null }, false), true, "有未确认完成即成立");
assert.equal(completionReminder(holdBase, { lastTurnEnd: 1000, ackedAt: 999 }, false), true, "ackedAt 早于 lastTurnEnd 仍成立");
assert.equal(completionReminder(holdBase, { lastTurnEnd: 1000, ackedAt: 1000 }, false), false, "ackedAt 齐平 lastTurnEnd 不成立");
assert.equal(completionReminder(holdBase, { lastTurnEnd: 1000, ackedAt: 2000 }, false), false, "ackedAt 晚于 lastTurnEnd 不成立");
assert.equal(completionReminder(holdBase, null, false), false, "无完成登记不成立（升级不回溯补发提醒）");
assert.equal(completionReminder(holdBase, { lastTurnEnd: 0, ackedAt: null }, false), false, "lastTurnEnd 非法不作数");
assert.equal(completionReminder({ id: "m-c1", parentId: "m", displayTitle: "子S" }, { lastTurnEnd: 1000, ackedAt: null }, true), false, "子代理不产生完成提醒");
// 打开/切换当前会话不解除（AC-05）：完成提醒成立与 current 无关。
// R-01-002/AC-05 打开或切换当前会话不解除完成提醒：判定与 current 无关（C-030）。
const holdSnap = { ids: ["sB"], byId: { sB: holdBase }, current: "sA" };
const confirmEntries = buildEntries(holdSnap, [], {}, acks(1000));
assert.deepEqual(
	confirmEntries.map((e) => [e.id, e.kind, e.pendingText ?? null, e.waitClass, e.noteText, e.isCurrent]),
	[["sB", "awaiting", null, "done", "继续对话，或移入历史", false]],
	"未确认完成提醒以 awaiting 完成提醒条目（胶囊「已完成」+固定正文）留在活动区，是否当前会话无关",
);
assert.deepEqual(
	awaitBadgeStats(confirmEntries),
	{ waiting: 1, blocked: 0, total: 1 },
	"完成提醒计入徽标等待分子但不计阻塞（R-01-002/AC-06）",
);
assert.deepEqual(
	buildRecent(holdSnap, [], NOW, undefined, {}, [], acks(1000)).map((e) => e.id),
	[],
	"未确认完成提醒不入历史区（分区不变量）",
);
// running 抑制：完成提醒在运行期间按运行卡呈现（C-030 呈现层抑制条件不变）。
const confirmRunning = buildEntries({ ids: ["sB"], byId: { sB: { ...holdBase, running: true } }, current: null }, [], {}, acks(1000));
assert.equal(confirmRunning[0].kind, "running", "完成提醒在运行期间被呈现抑制");
// 显式确认（AC-10）：ackedAt 前移即解除，会话退出活动区、转入历史区。
const ackedMap = acks(1000, 1500);
assert.deepEqual(
	buildEntries(holdSnap, [], {}, ackedMap).map((e) => [e.id, e.kind]),
	[],
	"确认后完成提醒解除、退出活动区",
);
assert.deepEqual(
	buildRecent(holdSnap, [], NOW, undefined, {}, [], ackedMap).map((e) => e.id),
	["sB"],
	"确认后会话进入历史区",
);
// 新回合隐式更替：lastTurnEnd 前移后旧确认游标不再覆盖新回合（仍未确认则对新回合成立）。
assert.equal(completionReminder(holdBase, { lastTurnEnd: 2000, ackedAt: 1500 }, false), true, "新回合完成后提醒针对新回合重新成立");
// 委托周期抑制：后代活动期间完成提醒不生效（呈现不依赖宿主 completed）。
const delegDoneMix = { ids: ["root", "root-c1"], byId: { root: holdBase, "root-c1": { id: "root-c1", displayTitle: "子S", parentId: "root", running: true } }, current: null };
assert.deepEqual(
	buildEntries(delegDoneMix, [], {}, acks(1000), new Set(["root"])).map((e) => [e.id, e.pendingText ?? null]),
	[["root", null], ["root-c1", null]],
	"委托周期中完成提醒不生效",
);
// 阻塞等待优先：pendingInteraction 时按对应文案呈现而非完成提醒。
const pendingMixSnap = { ids: ["sB"], byId: { sB: { ...holdBase, pendingInteraction: "approval" } }, current: null };
assert.deepEqual(
	buildEntries(pendingMixSnap, [], {}, acks(1000)).map((e) => [e.id, e.kind, e.pendingText, e.waitClass]),
	[["sB", "awaiting", "待确认", "blocked"]],
	"阻塞等待优先于完成提醒呈现",
);

// ---- R-01-002/AC-13 错误提醒：最近回合以错误结束 → 红色等待卡；随新回合覆盖解除；
//     无确认按钮（不消费 ack 游标）；刷新恢复；后代/运行抑制；错误信息正文 ----
const errAcks = (lastTurnEndKind, error, ackedAt = null) =>
	new Map([["sB", { lastTurnEnd: 1000, lastTurnEndKind, lastTurnEndError: error, ackedAt }]]);
assert.equal(errorReminder({ id: "sB", displayTitle: "旧B" }, { lastTurnEndKind: "error" }, false), true, "error 回合结束即成立");
assert.equal(errorReminder({ id: "sB", displayTitle: "旧B" }, { lastTurnEndKind: "completed" }, false), false, "正常回合不成立");
assert.equal(errorReminder({ id: "sB", displayTitle: "旧B" }, { lastTurnEndKind: "error", ackedAt: 99999 }, false), true, "错误提醒不消费 ack 游标（ackedAt 不影响成立）");
assert.equal(errorReminder({ id: "sB", displayTitle: "旧B" }, null, false), false, "无登记不成立（升级不回溯补发错误提醒）");
assert.equal(errorReminder({ id: "m-c1", parentId: "m", displayTitle: "子S" }, { lastTurnEndKind: "error" }, true), false, "子代理不产生错误提醒");
const errEntries = buildEntries(holdSnap, [], {}, errAcks("error", "The engine is currently overloaded, please try again later"));
assert.deepEqual(
	errEntries.map((e) => [e.id, e.kind, e.pendingText ?? null, e.waitClass, e.noteText]),
	[["sB", "awaiting", null, "error", "The engine is currently overloaded, please try again later"]],
	"error 回合以 awaiting 错误提醒条目留在活动区（红色卡面、正文为错误信息）",
);
assert.deepEqual(
	buildEntries(holdSnap, [], {}, errAcks("error", "")).map((e) => [e.id, e.waitClass, e.noteText]),
	[["sB", "error", ERROR_NOTE_FALLBACK]],
	"error 回合无错误信息时回落固定文案（R-01-002/AC-09）",
);
assert.ok(ERROR_NOTE_MAX > 0, "错误信息截断上限为正数");
assert.equal(ERROR_NOTE_FALLBACK, "回合以错误结束，请检查会话");
assert.equal(truncateErrorNote("短错误"), "短错误", "不超限原样返回");
assert.equal(truncateErrorNote("x".repeat(ERROR_NOTE_MAX)), "x".repeat(ERROR_NOTE_MAX), "恰在上限时原样返回、不加省略号");
assert.equal(
	truncateErrorNote("x".repeat(ERROR_NOTE_MAX + 1)),
	`${"x".repeat(ERROR_NOTE_MAX)}…`,
	"超限截断至上限字符并以省略号收尾（省略号不计入上限）",
);
assert.equal(truncateErrorNote("😀".repeat(ERROR_NOTE_MAX + 1)), `${"😀".repeat(ERROR_NOTE_MAX)}…`, "按 Unicode 码点截断，代理对字符不被劈开");
assert.equal(truncateErrorNote(null), "", "非字符串入参返回空串（防御性边界）");
assert.deepEqual(
	awaitBadgeStats(errEntries),
	{ waiting: 1, blocked: 0, total: 1 },
	"错误提醒计入徽标等待分子但不计阻塞（R-01-002/AC-06）",
);
assert.deepEqual(
	buildRecent(holdSnap, [], NOW, undefined, {}, [], errAcks("error", "boom")).map((e) => e.id),
	[],
	"错误提醒中会话不入历史区（分区不变量，R-01-010/AC-06）",
);
// 优先级：同一登记上 error 优先于 done（lastTurnEndKind 为 error 时兼有未确认完成）。
assert.deepEqual(
	buildEntries(holdSnap, [], {}, errAcks("error", "boom", 1000)).map((e) => [e.id, e.waitClass]),
	[["sB", "error"]],
	"错误提醒优先于完成提醒呈现（C-043）",
);
// 抑制与覆盖：运行期间按运行卡呈现；新回合（kind 覆盖为正常原因）即解除错误提醒——
// 未确认时落入完成提醒（turn/end 照常登记 lastTurnEnd），已确认后完全退出活动区。
const errRunning = buildEntries({ ids: ["sB"], byId: { sB: { ...holdBase, running: true } }, current: null }, [], {}, errAcks("error", "boom"));
assert.equal(errRunning[0].kind, "running", "错误提醒在运行期间被呈现抑制");
const clearedErr = buildEntries(holdSnap, [], {}, errAcks("completed", null));
assert.deepEqual(
	clearedErr.map((e) => [e.id, e.kind, e.waitClass]),
	[["sB", "awaiting", "done"]],
	"新回合正常结束后错误提醒覆盖解除：未确认时转为完成提醒（绿卡）",
);
const clearedErrAcked = buildEntries(holdSnap, [], {}, errAcks("completed", null, 2000));
assert.deepEqual(clearedErrAcked.map((e) => [e.id, e.kind]), [], "新回合正常结束且已确认后完全退出活动区（错误提醒无确认按钮语义）");
// 委托周期抑制：后代活动期间错误提醒不生效。
const delegErrMix = { ids: ["root", "root-c1"], byId: { root: holdBase, "root-c1": { id: "root-c1", displayTitle: "子S", parentId: "root", running: true } }, current: null };
const delegErrAcks = new Map([["root", { lastTurnEnd: 1000, lastTurnEndKind: "error", lastTurnEndError: "boom", ackedAt: null }]]);
assert.deepEqual(
	buildEntries(delegErrMix, [], {}, delegErrAcks, new Set(["root"])).map((e) => e.id),
	["root", "root-c1"],
	"委托周期中错误提醒不生效（保持运行呈现）",
);

// ---- R-01-016/AC-01 等待卡条目承载会话最后已知工作项时间线（数据路径）----
const settledTrace = [{ id: "w1", kind: "tool", label: "Bash", summary: "pnpm check", status: "done" }];
const awaitingTraceEntries = buildEntries(holdSnap, [], { sB: { timeline: settledTrace } }, acks(1000));
assert.equal(awaitingTraceEntries[0].kind, "awaiting", "完成提醒中会话以 awaiting 卡呈现");
assert.deepEqual(awaitingTraceEntries[0].timeline, settledTrace, "awaiting 条目承载会话最近工作项时间线（R-01-016/AC-01）");
const pendingTraceEntries = buildEntries(pendingSnap, [], { sP: { timeline: settledTrace } });
assert.equal(pendingTraceEntries[0].kind, "awaiting", "待确认会话以 awaiting 卡呈现");
assert.deepEqual(pendingTraceEntries[0].timeline, settledTrace, "待确认 awaiting 条目同样承载时间线（R-01-016/AC-01）");

// ---- R-01-010/AC-07 活动区→历史区迁移判定 ----
assert.deepEqual(
	movedToRecentIds(new Set(["sA", "sB"]), [{ id: "sA" }], [{ id: "sB" }]),
	["sB"],
	"上一帧活动区 id 离开活动区且出现于历史区判定为迁移",
);
assert.deepEqual(movedToRecentIds(new Set(["sB"]), [], []), [], "彻底消失（归档/滑出历史窗口）不判定为迁移");
assert.deepEqual(movedToRecentIds(new Set(), [{ id: "sB" }], []), [], "上一帧不在活动区不判定为迁移");
assert.deepEqual(movedToRecentIds(new Set(["sB"]), [{ id: "sB" }], []), [], "仍在活动区不判定为迁移");

// ---- R-01-010/AC-07 历史区→活动区迁移判定（反向，与 movedToRecentIds 镜像）----
assert.deepEqual(
	movedToActiveIds(new Set(["rA", "rB"]), [{ id: "rB" }], [{ id: "rA" }]),
	["rB"],
	"上一帧历史区 id 离开历史区且出现于活动区判定为反向迁移",
);
assert.deepEqual(movedToActiveIds(new Set(["rB"]), [], []), [], "彻底消失（归档/滑出历史窗口）不判定为反向迁移");
assert.deepEqual(movedToActiveIds(new Set(), [{ id: "rB" }], []), [], "上一帧不在历史区不判定为反向迁移");
assert.deepEqual(movedToActiveIds(new Set(["rB"]), [], [{ id: "rB" }]), [], "仍在历史区不判定为反向迁移");

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

// ---- R-01-014/AC-06 数量标识在途显示加载指示而非冒充计数 ｜ R-01-002/AC-06 脉冲门控 ----
assert.deepEqual(
	countBadgeState("loading", 0, 0),
	{ mode: "loading", text: "", ariaText: "活动会话计数加载中", awaiting: false },
	"列表在途归一为加载指示，不冒充 0/0",
);
assert.equal(countBadgeState("loading", 1, 3).awaiting, false, "在途期即便有等待计数也不触发脉冲");
assert.equal(countBadgeState("error", 0, 0).mode, "count", "错误轴不归一为加载指示");
assert.deepEqual(
	countBadgeState("ready", 0, 0),
	{ mode: "count", text: "0/0", ariaText: "0 个活动会话", awaiting: false },
	"就绪空态仍显示 0/0（R-01-001/AC-06）",
);
assert.deepEqual(
	countBadgeState("ready", 1, 3, 1),
	{ mode: "count", text: "1/3", ariaText: "3 个活动会话，1 个等待你答复", awaiting: true },
	"存在阻塞等待：脉冲开启，aria 表达等你答复（R-01-002/AC-06）",
);
assert.deepEqual(
	countBadgeState("ready", 2, 3, 1),
	{ mode: "count", text: "2/3", ariaText: "3 个活动会话，1 个等待你答复，1 个已完成", awaiting: true },
	"混合态 aria 同时携带阻塞与完成计数",
);
assert.deepEqual(
	countBadgeState("ready", 2, 3, 0),
	{ mode: "count", text: "2/3", ariaText: "3 个活动会话，2 个已完成", awaiting: true },
	"仅完成提醒同样开启脉冲：两类等待行为一致（R-01-002/AC-06，C-037 翻案 C-028）",
);

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
// 折叠分组为时间线唯一来源；指令槽位派生与渲染不残留（R-01-018 已删除，C-019）
assert.ok(
	bundle.includes("foldedConversationTimeline") && bundle.includes("foldWorkGroups"),
	"折叠分组派生函数进入 bundle（R-01-017）",
);
assert.ok(
	bundle.includes("openTurnStartFromEvents") && bundle.includes("requireOpenTurnStart"),
	"开放回合起点 history 兜底进入 bundle（R-01-009/AC-06 冷窗口兜底）",
);
assert.ok(
	bundle.includes("historyInstructionAnchor") && bundle.includes("memoTimelineAnchor") && bundle.includes("foldedHistoryTimeline") && !bundle.includes("withInstructionAnchor"),
	"history 锚行作为核心时间线输入且 client 不再二次裁剪（R-01-009/AC-11、R-01-012/AC-12、C-035）",
);
assert.ok(!bundle.includes("renderSlot") && !bundle.includes("dap-slot"), "指令槽位渲染无残留（C-019）");
assert.ok(!bundle.includes("rememberLastUser") && !bundle.includes("lastUserFromEvents") && !bundle.includes("foldedTimelineWithSlot") && !bundle.includes("foldWorkGroupsWithSlot"), "槽位派生家族无残留（C-019）");
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
assert.ok(bundle.includes("foldedConversationTimeline"), "活动卡时间线由折叠分组唯一来源派生（R-01-012、R-01-017）");
assert.ok(!bundle.includes("dap-trace-time"), "工作项时间线不渲染行级耗时元素，对齐主会话窗口（R-01-009/AC-07、C-012）");
assert.ok(!bundle.includes("PROGRESS_THINK_BASE") && !bundle.includes("progressFloor"), "回合进度纯时间驱动，无思考基线/单调下限残留（R-01-009/AC-06、C-014）");
assert.ok(bundle.includes("progressHalfLifeSec"), "bundle 含半衰期速率校准函数（R-01-009/AC-06、C-025、C-044）");
assert.ok(
	bundle.includes("halfLifeSec: progressHalfLifeSec({ rateTokS })"),
	"进度赋值每帧按最新实测速率现算半衰期（R-01-009/AC-06、C-044）",
);
assert.ok(
	!bundle.includes("halfLifeSec: anchor.halfLifeSec"),
	"锚点状态不再承载半衰期（C-044：k 不随锚点捕获冻结）",
);
// R-01-009/AC-10
// R-01-017 无条件折叠（C-017）：检测探测与原生行呈现机器不得残留
assert.ok(!bundle.includes("dshcf") && !bundle.includes("autoCollapseActive"), "无 dsh-auto-collapse 探测残留（R-01-017、C-017）");
assert.ok(!bundle.includes("nativeWorkItemRow") && !bundle.includes("cloneNativeIcon") && !bundle.includes("nativeIconsByTraceKey"), "原生行匹配/图标克隆机器无残留（C-017）");
assert.ok(!bundle.includes("mergeTraceStatus") && !bundle.includes("allowNativePresentation"), "行状态直接采用核心派生值，无合并/切换层（C-017）");
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
		bundle.includes("renderCardIntoList(activeList, entry, cardsById, index, 1, hueByWorkspace)"),
	"几何耦合钉住：INDENT_PX=16、轨道 left 由母会话卡片左缘测量推导（+半槽+1px border，取整后与横线起笔相接）与活动区卡片 offset=1（轨道层为首子节点），改任一必须同步",
);
// R-01-003/AC-05
assert.ok(bundle.includes("function activeSessionIds(byId = {})"), "活动子代理沿 parentId 链补齐活动祖先");
// ---- R-01-016/AC-01 等待卡保留最近工作项时间线 ----
assert.ok(
	bundle.includes('return [head, row, makeEl("div", "dap-trace"), foot];'),
	"awaiting 骨架在标题行与末行两段（胶囊+正文）之间含时间线容器（R-01-016/AC-01，C-043）",
);
// ---- R-01-002/AC-10 完成提醒卡「移入历史」按钮 ----
assert.ok(
	bundle.includes('noteRow.append(makeEl("div", "dap-note"), makeConfirmButton());'),
	"awaiting 正文行为「正文+按钮」行容器，胶囊已移至首行；按钮仅完成提醒卡显示（R-01-002/AC-08、AC-10，C-043）",
);
assert.ok(bundle.includes('button.className = "dap-confirm"') && bundle.includes('button.textContent = "移入历史"'), "完成提醒卡按钮以「移入历史」文案呈现（R-01-002/AC-10，C-040）");
assert.ok(
	bundle.includes('confirm.addEventListener("click"') && bundle.includes("event.stopPropagation()") && bundle.includes("confirm.addEventListener(\"keydown\", (event) => event.stopPropagation())") && bundle.includes('ackCompletion(id)'),
	"按钮点击/键盘激活写回 ack 且阻断卡片跳转（R-01-002/AC-10）",
);
assert.ok(bundle.includes('confirm.hidden = entry.waitClass !== "done"'), "仅完成提醒卡显示「移入历史」按钮，阻塞等待卡不显示（R-01-002/AC-10）");
assert.ok(bundle.includes("new window.EventSource(`${ACK_API_BASE}/acks/stream`)"), "完成确认状态经 SSE 通道订阅（R-01-002/AC-11、AC-12）");
// R-01-002/AC-12 缺陷回归：移动 PWA 后台恢复后 ack 通道必须自愈（EventSource CLOSED/半开
// 不再自动重连），否则完成等待中的会话被误判入历史区直至整页重载。
assert.ok(
	bundle.includes('document.addEventListener("visibilitychange", onVisibilityResume)') && bundle.includes('window.addEventListener("pageshow", onPageShow)'),
	"回到前台/bfcache 还原触发 ack 通道自愈（R-01-002/AC-12）",
);
assert.ok(
	bundle.includes("function resumeAcksChannel()") && bundle.includes("function connectAcksStream()") && bundle.includes("acksSource?.close()"),
	"ack 通道自愈经无条件重建 SSE 连接收敛（连接即收全量快照，R-01-002/AC-12）",
);
assert.ok(
	bundle.includes('document.removeEventListener("visibilitychange", onVisibilityResume)') && bundle.includes('window.removeEventListener("pageshow", onPageShow)'),
	"卸载时移除 ack 通道自愈监听（R-01-002/AC-12）",
);
assert.ok(bundle.includes("fetch(`${ACK_API_BASE}/ack`"), "确认写回经宿主侧 ack 路由（R-01-002/AC-10、AC-11）");
assert.ok(
	!bundle.includes("updateCompletedHolds") && !bundle.includes("heldCompletedIds") && !bundle.includes("prevActiveMainIds"),
	"响应保持易失记账全套移除（C-030）",
);
// ---- R-01-003/AC-05 委托周期保持运行呈现：parent 卡形态已废除 ----
assert.ok(
	!bundle.includes('entry.kind === "parent"') && !bundle.includes('[data-kind="parent"]'),
	"parent 分支与样式全部移除，委托母会话保持运行卡呈现（R-01-003/AC-05）",
);
assert.equal(
	bundle.split('makeEl("span", "dap-pct")').length - 1,
	1,
	"百分比文本元素全 bundle 仅运行卡骨架一处创建（R-01-009/AC-06）",
);
assert.equal(
	bundle.split('querySelector(".dap-pct")').length - 1,
	1,
	"百分比文本写入全 bundle 仅运行卡渲染分支一处（R-01-009/AC-06）",
);
// ---- R-01-016/AC-04 时间线数据在途时显示加载指示、返回就地填充 ----
assert.ok(
	bundle.split("renderTimelineArea(traceContainer, entry").length - 1 === 3 && !bundle.includes("nativePresentationSessionId"),
	"运行/subagent/等待卡统一复用 renderTimelineArea：在途显示加载行、返回就地填充（R-01-016/AC-04）",
);
// R-01-013/AC-07、R-01-013/AC-08
assert.ok(bundle.includes('dataset.role = "user"'), "用户消息行骨架静态标识 user 角色");
assert.ok(bundle.includes('dataset.role = "agent"'), "agent 回复行骨架静态标识 agent 角色");
assert.ok(bundle.includes("dap-history-icon"), "历史卡预览行带常驻角色图标段");
assert.ok(bundle.includes("dap-history-text"), "历史卡预览文本写入图标后的独立文本段");
// R-01-013/AC-07、AC-08 最近卡预览行对齐时间线形式：角色标签 + 圆点分隔符 + 12px 图标盒
assert.ok(bundle.includes("dap-history-label"), "历史卡预览行带角色标签段（R-01-013/AC-07、AC-08）");
assert.ok(bundle.includes('userLabel.textContent = "用户"'), "用户消息行带「用户」标签（R-01-013/AC-07）");
assert.ok(bundle.includes('agentLabel.textContent = "助手"'), "agent 回复行带「助手」标签（R-01-013/AC-08）");
assert.ok(bundle.includes("dap-history-separator"), "历史卡预览行标签与文本之间带圆点分隔符（R-01-013/AC-07、AC-08）");
assert.ok(
	bundle.includes(".dap-history-icon svg { display: block; width: 12px; height: 12px; }") &&
	!bundle.includes(".dap-history-icon svg { display: block; width: 10px; height: 10px; }"),
	"历史卡角色图标盒 12px，与时间线图标一致（R-01-013/AC-07、AC-08）",
);
// R-01-013/AC-08
assert.ok(bundle.includes("agentIcon.append(createRobotIcon())"), "agent 回复行使用机器人图标");
// R-01-012/AC-09、AC-11 回归：机器人图标为 Lucide bot 改造的小电视几何——去双耳、双 45° 外撇短斜天线
//（ISC 许可，来源声明见 LICENSE/README）；几何与清晰化选型见 C-021
assert.ok(bundle.includes("M10 8L7 5M14 8L17 5"), "机器人图标为双斜短天线小电视几何（R-01-012/AC-09）");
assert.ok(!bundle.includes("M2 14h2") && !bundle.includes("M20 14h2") && !bundle.includes("M12 8V4H8"), "机器人图标无双耳与旧单折线天线残留（C-021）");
assert.ok(
	bundle.includes('"stroke-width": "2.2"') && !bundle.includes('"stroke-width": "1.3"'),
	"机器人描边 2.2（12/22 缩放渲染 1.2px），旧 1.3px 细描边不残留（R-01-012/AC-11）",
);
assert.ok(
	!bundle.includes('data-icon="robot"] .dap-trace-icon svg'),
	"机器人字形与其他时间线图标同用 12px 盒，无 13px 半像素偏移覆盖（R-01-012/AC-11）",
);
// R-01-012/AC-11 机器人图标 viewBox 保框（1 3 22 18）保持显示尺度，与同盒 canonical 图标一致
assert.ok(bundle.includes('viewBox: "1 3 22 18"'), "机器人图标 viewBox 保框保持显示尺度，不因留白显小（R-01-012/AC-11）");
assert.ok(!bundle.includes('viewBox: "0 0 24 24"'), "机器人图标不使用留白 24 框（R-01-012/AC-11）");
// R-01-012/AC-03（T-021 副作用守卫：历史卡换图标不影响时间线兜底）
// R-01-012/AC-09 时间线 assistant 行图标：正文行机器人图标（与最近卡 agent 角色标识同源）、思考行思考图标，按 detail 有无分流而非比较 label 文案
assert.ok(bundle.includes('? createThinkIcon() : createRobotIcon()'), "时间线 assistant 正文行使用机器人图标、思考行使用思考图标（R-01-012/AC-09）");
assert.ok(!bundle.includes('label === "Think"') && !bundle.includes('label === "Assistant"'), "图标分流不比较 label 显示文案（R-01-012/AC-09）");
// R-01-012/AC-10 时间线数据层无英文 Think/Assistant 标签残留
assert.ok(!bundle.includes('"Think"') && !bundle.includes('"Assistant"'), "bundle 无英文 Think/Assistant 标签残留（R-01-012/AC-10）");
assert.ok(bundle.includes('"思考"') && bundle.includes('"助手"'), "bundle 含中文「思考」「助手」标签（R-01-012/AC-09、AC-10）");
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
// R-01-014/AC-06 数量标识在途显示加载指示而非冒充计数
assert.ok(bundle.includes("countBadgeState"), "数量标识在途态经 countBadgeState 归一");
assert.ok(bundle.includes("setCountBadgeContent"), "三处数量标识在途接入加载指示");
assert.ok(bundle.includes("活动会话计数加载中"), "数量标识加载态 aria 文案不冒充计数");
assert.ok(
	bundle.includes('.dap-count .dap-spinner') && bundle.includes('.dap-rail-count .dap-spinner') && bundle.includes('.dap-toggle-count .dap-spinner'),
	"三处数量标识均有加载指示样式",
);
assert.ok(bundle.includes("loadingModel"), "模型字段级加载指示并入签名");
assert.ok(bundle.includes("loadingTimeline"), "时间线字段级加载指示并入签名");
assert.ok(bundle.includes("loadingPreviews"), "预览字段级加载指示并入签名");
assert.ok(bundle.includes("renderTraceLoading"), "时间线区数据在途时显示加载行");
assert.ok(bundle.includes("promise.then(queueSync, queueSync)"), "补充数据逐个完成即重绘（先就绪先显示）");
assert.ok(bundle.includes("LOAD_CONCURRENCY"), "冷数据读取经并发池限制慢网挤占");
assert.ok(bundle.includes("session.open"), "运行卡通过 native session open hydrate 非当前会话");
assert.ok(bundle.includes("sessionOpenLoads"), "session.open 请求与 cold history fallback 不重复");
// R-01-012/AC-16 模型目录订阅：store 推送更新、只订阅不 load、随可见性/卸载清理
assert.ok(bundle.includes('ctx.get("modelDirectories")'), "模型实时选择来自原生 modelDirectories 服务（可选软依赖）");
assert.ok(bundle.includes("directory.store.subscribe"), "订阅目录 store 推送模型选择变更");
assert.ok(!bundle.includes("directory.load("), "不调用目录 load()，不与 select() 竞争 generation（C-024）");
assert.ok(bundle.includes("pruneSubscriptions(modelDirectorySubs, visibleIds)"), "模型目录订阅随可见性先 unsubscribe 再除名");
assert.ok(bundle.includes("pruneSubscriptions(modelDirectorySubs, new Set())"), "卸载时模型目录订阅整体退订归零");
assert.ok(bundle.includes("detail.modelLive"), "目录订阅已产值时晚到的一次性 RPC 不回写旧值");
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
// R-02-004/AC-02（演进，C-030）：完成确认写回是唯一 HTTP 请求——自家宿主侧路由、
// 用户操作触发的一次性 POST，非状态轮询；轮内状态仍只来自原生订阅推送与 SSE 推送。
// fetch 唯一性由下条断言钉住：轮询需要重复请求，唯一 fetch 即排除轮询形态。
assert.ok(
	(bundle.match(/fetch\(/g) ?? []).length === 1 && bundle.includes("fetch(`${ACK_API_BASE}/ack`"),
	"唯一的 fetch 调用是完成确认写回，指向宿主侧自家路由（R-01-002/AC-10、C-030）",
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
assert.ok(bundle.includes("item.fold === true"), "折叠组行图标按组类别固定选择，不随成员状态或展开态漂移（R-01-012/AC-03、AC-08）");
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
// 原生行匹配/图标克隆/图标缓存机器已随逐项镜像移除（C-017），由上方负向守卫覆盖。
assert.ok(!bundle.includes('disclosure?.querySelector("svg")'), "不得直接复制 disclosure 内第一个 SVG");
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-trace-item[data-status="error"] .dap-trace-icon') &&
	bundle.includes('data-status="error"] .dap-trace-label'),
	"错误分组行经 CSS 整体染色：图标、组标题与摘要跟随错误色（R-01-012/AC-06）",
);
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
// 5px 视觉圆点由 7px border-box 的实体背景 + 1px border 原生圆角裁剪，避免硬停色 gradient 八边形；
// 竖线 left 3px（圆心 x=3.5）与圆点严格同圆心，竖线贯穿首项圆点并向上引出；
// 竖线为容器 ::before 单元素整条绘制（零拼接，对齐层级连接线 .dap-conn-track 原则）——
// 逐项分段曾在接缝处双线叠加、半透明相加成亮带（T-069）；
// reduced-motion 只关闭宽度 transition，不关闭 answer-pet 同款状态脉冲/进度条纹。
assert.ok(bundle.includes(".dap-trace::before,\n[data-dsh-activity-pane] .dap-subtrace::before"), "时间线竖线为容器级单元素整条绘制（零拼接接缝，T-069）");
assert.ok(!bundle.includes(".dap-trace-item::after"), "时间线不再逐项分段自绘竖线（接缝叠加成亮带，T-069）");
assert.ok(!bundle.includes("bottom: -8px"), "逐项竖线下探 8px 的拼接几何已移除（T-069）");
assert.ok(bundle.includes(".dap-trace:has(> :only-child)::before"), "单项时间线（含加载行）不画竖线（沿用原末项不画线语义）");
assert.ok(bundle.includes("margin: 1px 0 2px;"), "时间线整体与卡片内容左边界对齐");
assert.ok(bundle.includes("left: 3px; top: 0; bottom: 7px"), "1px 竖线（整数位）与圆点严格同圆心 x=3.5，终点没入最末圆点（对齐标题圆点）");
assert.ok(bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace::before"), "浅色主题时间线竖线色覆盖迁移到容器级规则（T-069）");
assert.ok(bundle.includes("color: #c7ced9; font-size: 10px; line-height: 14px;"), "工作项文字恢复原有 10px/14px 尺度");
assert.ok(bundle.includes("width: 14px; height: 14px;") && !bundle.includes("width: 14px; height: 14px; padding: 1px;"), "工作项图标容器为真实 14px 盒、无占位的 padding 环（R-01-012、C-019）");
assert.ok(bundle.includes("width: fit-content;\n  max-width: 100%;") && bundle.includes("linear-gradient(rgba(139, 152, 165, .55), rgba(139, 152, 165, .55))") && !bundle.includes("repeating-linear-gradient(90deg, rgba(139, 152, 165, .55)") && !bundle.includes("rgba(88, 201, 143, .1)") && !bundle.includes("border-bottom: 1px dashed"), "时间线用户消息行下划线改实线且宽度仅为图标+文字内容宽（背景渐变绘制、不占 14px 行高），无整行虚线与浅绿平底残留（R-01-012/AC-05、C-022）");
assert.ok(bundle.includes("linear-gradient(var(--dsw-alias-label-tertiary, rgb(129, 133, 140)), var(--dsw-alias-label-tertiary, rgb(129, 133, 140)))"), "浅色主题用户行下划线同改实线（alias 变量色）（R-01-012/AC-05）");
assert.ok(bundle.includes("anchor: true") && bundle.includes("isUserChatNode"), "指令锚行由核心派生并前置返回，找锚只做廉价 kind 检查（R-01-012/AC-12）");
assert.ok(bundle.includes("display: block; width: 12px; height: 12px;"), "工作项 SVG 保持 12px");
assert.ok(bundle.includes('svg.setAttribute("width", String(width))'), "canonical 图标经 createInlineIcon 统一写入尺寸（默认 12px）");
assert.ok(bundle.includes("left: 0; top: 3px;\n  width: 7px; height: 7px;"), "时间线圆点盒子与标题圆点同盒（7px、left:0，跨 DPR 渲染对齐）");
assert.ok(bundle.includes("box-sizing: border-box; border: 1px solid rgba(119, 131, 148, .14); border-radius: 50%;"), "7px 同盒内以 1px border 留出 5px 视觉实心核并经原生圆角裁剪（R-01-009/AC-09、C-036）");
assert.ok(bundle.includes("background: #778394; background-clip: padding-box;"), "时间线圆点使用实体背景与 padding-box 裁剪，不绕过 border-radius（R-01-009/AC-09）");
assert.ok(bundle.includes("background: #65a0ff; border-color: rgba(101,160,255,.16);"), "running 圆点保留蓝色实心核与同色半透明内环（R-01-009/AC-09）");
assert.ok(!bundle.includes("radial-gradient(circle,"), "时间线圆点不再使用 2.5px 硬停色 radial-gradient（R-01-009/AC-09、C-036）");
assert.ok(bundle.includes("box-shadow: 0 0 0 1px rgba(119, 131, 148, .14);"), "圆点半透明外环外半由 1px box-shadow 拼成（整体 2px 外环不变）");
assert.ok(bundle.includes(".dap-dot {\n  width: 7px; height: 7px;"), "标题圆点保持 7px（圆心 x=3.5，时间线圆点对齐基准）");
assert.ok(bundle.includes("padding-left: 14px"), "时间线文字轨道保持 14px 内缩");
assert.ok(bundle.includes(".dap-subtrace {\n  position: relative;   /* 容器级整条竖线的定位基准 */\n  min-width: 0;"), "子代理容器不再 padding/border/overflow 包裹（不裁切圆点），并为容器级整条竖线提供定位基准（T-069）");
assert.ok(bundle.includes(".dap-fill { transition: none; }"), "降低动效设置不关闭状态动画（对齐 answer-pet）");
// R-01-009/AC-08：进度条仅存于运行卡骨架，条纹挂在 .dap-fill 基础规则上——
// 会话运行全程（含工具/思考阶段与委托周期母会话）持续向右滚动，不再经流式阶段门控。
assert.ok(bundle.includes(".dap-fill {\n  position: absolute; inset: 0 auto 0 0; width: 0%;\n  border-radius: 6px;\n  background: repeating-linear-gradient(90deg, #58c98f 0 10px, #3fbf86 10px 20px);\n  background-size: 200% 100%;"), "进度条基础规则携带条纹渐变，运行全程呈现（R-01-009/AC-08）");
assert.ok(bundle.includes("animation: dap-stripes 0.8s linear infinite;"), "进度条条纹持续向右滚动动画（R-01-009/AC-08）");
assert.ok(!bundle.includes("data-streaming"), "条纹不再经 data-streaming 流式门控（R-01-009/AC-08）");
assert.ok(!bundle.includes("entry.streaming"), "streaming 派生字段随条纹门控移除（R-01-009/AC-08）");
assert.ok(bundle.indexOf('const track = makeEl("div", "dap-track");') > bundle.indexOf('return [head, row, makeEl("div", "dap-trace"), noteRow];'), "进度条骨架仅属运行卡，非运行卡不呈现条纹（R-01-009/AC-08）");
assert.ok(bundle.includes("animation: dap-pulse 1.15s ease-in-out infinite"), "运行中蓝色节点保留脉冲动画");
assert.ok(bundle.includes("dataset.traceKey"), "同一流程节点复用 DOM，脉冲动画不因时钟刷新重置");
assert.ok(!bundle.includes(".dap-trace-item[data-status=\"running\"]::before {\n    animation: none !important;"), "降低动效设置不关闭运行点脉冲");

// R-01-013/AC-09
// 最近历史卡标题降为常规字重（不加粗），活动卡标题保持加粗。
assert.ok(bundle.includes('[data-kind="recent"] .dap-title {\n  font-weight: 400;'), "最近历史卡标题使用常规字重（不加粗）");
assert.ok(bundle.includes("white-space: nowrap; font-size: 12px; line-height: 16px; font-weight: 700;"), "活动卡标题保持加粗 700");

// R-01-013/AC-10
// 最近历史卡整体不透明度低于活动卡，弱化历史区视觉强调。
assert.ok(bundle.includes("opacity: 0.8;"), "最近历史卡整体不透明度降为 0.8");

// R-01-013/AC-11
// 最近卡底色与描边保持与窗格底色可分辨、且暗于活动卡：深色中间档底色 + 弱描边；浅色压暗底色 + 弱描边。
assert.ok(bundle.includes("background: rgba(26, 28, 34, 0.92);\n  border-color: rgba(255, 255, 255, 0.08);"), "深色最近卡底色为暗于活动卡的中间档并带弱描边（R-01-013/AC-11）");
assert.ok(
	bundle.includes('body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="recent"] {') && bundle.includes("background: rgb(243, 244, 246);\n  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));"),
	"浅色最近卡底色暗于活动卡纯白并带弱描边（R-01-013/AC-11）",
);

// R-01-010/AC-08、AC-09（bundle 契约）
// 历史区时间精化链路进入 bundle：turn/end 提取、turnEnds 注入 buildRecent、渲染读 activityAt。
assert.ok(bundle.includes("lastTurnEndFromEvents") && bundle.includes("lastTurnEndFromTimings"), "回合结束时刻提取进入 bundle（R-01-010/AC-08）");
assert.ok(bundle.includes("delegatingIds, turnEnds)"), "turnEnds 注入 buildRecent（R-01-010/AC-09）");
assert.ok(bundle.includes("fmtRecentTime(entry.activityAt)"), "最近卡渲染读取精化后的 activityAt（R-01-010/AC-08）");

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

// R-01-002/AC-01、AC-02、AC-09、AC-13 等待三类胶囊（C-043）：末行首行为「圆底类型图标 + 类型
// 文字」胶囊（阻塞金/完成绿/错误红），胶囊与正文同频同相脉冲；「移入历史」按钮不闪，标题圆点静止。
assert.ok(
	bundle.includes('capsule.append(makeEl("span", "dap-capsule-icon"), makeEl("span", "dap-capsule-text"))'),
	"等待胶囊为图标+文本双段结构（R-01-002/AC-01、AC-02、AC-09、AC-13）",
);
assert.ok(bundle.includes("function createCapsuleIcon(kind)"), "胶囊类型图标工厂存在（对勾/文档/问号气泡/已完成对勾/错误感叹号）");
assert.ok(
	bundle.includes("CAPSULE_ICON_KINDS.has(entry.pendingKind)"),
	"胶囊图标归属由 waitClass/pendingKind 结构化字段驱动，未知种类不给图标（R-01-002/AC-01、AC-02）",
);
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"] .dap-foot :is(.dap-capsule, .dap-note)'),
	"三类等待卡的胶囊与正文脉冲由同一 data-wait 作用域规则驱动（R-01-002/AC-08，C-043）",
);
// 多行承载（R-01-002/AC-09，C-041）：末行正文以 pre-line 保留 Q 行列表换行符；
// 完成提醒/错误提醒/recent 单行正文无换行符，行为不受影响。
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-note {\n  /* 多行正文（R-01-002/AC-09）：待回复卡的 Q 行列表以 \\n 换行呈现（pre-line 保留\n     换行符、折叠其余空白）；完成提醒/错误提醒等单行正文不受影响（无换行符时不产生新行）。 */\n  min-width: 0; overflow: hidden; white-space: pre-line;'),
	"末行正文以 pre-line 承载提问 Q 行列表多行（R-01-002/AC-09，C-041）",
);
assert.ok(!bundle.includes("dap-badge-flash") && !bundle.includes("awaitBadgeFlash"), "标题区徽标闪烁机制整体移除：闪烁不再出现在卡片标题行（R-01-002/AC-08，C-040）");
assert.ok(
	bundle.includes('prevWait !== entry.waitClass') && bundle.includes('node.style.animation = "none"') &&
		bundle.includes('rec.el.querySelectorAll(".dap-foot .dap-capsule, .dap-foot .dap-note")'),
	"原地跨类转换（done↔blocked↔error）时胶囊与正文动画一次性同步重启对齐相位（R-01-002/AC-08，C-043 复审修复）",
);
assert.ok(!bundle.includes('dot.style.animation = "none"'), "相位重启目标随标题圆点静止而移除，重启只作用于末行元素（R-01-002/AC-08，C-040）");
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"] .dap-dot {\n  animation: none;\n  background: var(--dap-wait-color, #58c98f);'),
	"等待卡标题状态点静止不闪、色相随 --dap-wait-color 类别变量（R-01-002/AC-08，C-043）",
);
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="blocked"] {\n  --dap-wait-color: #f5c542;') &&
		bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="error"] {\n  --dap-wait-color: #f06a72;'),
	"阻塞等待金 / 错误提醒红类别色相经 --dap-wait-color 单点定义（R-01-002/AC-04、AC-13，C-043）",
);
assert.equal(awaitBadgeTone([{ kind: "awaiting", waitClass: "blocked" }]), "blocked", "tone 判定收敛到核心纯函数单点（R-01-002/AC-06）");
assert.ok(bundle.includes('rec.el.setAttribute("data-wait", entry.waitClass)'), "等待类别经 data-wait 属性承载（R-01-002/AC-08）");
assert.ok(bundle.includes('entry.noteText ?? ""'), "末行正文由核心单点派生（R-01-002/AC-09）");
// 缺陷回归（C-040）：noteText 派生时快照路径的时间线尚未按引用 memo 完成，
// 等待卡静止后无下一帧导致待回复末行永远停留动作回落文案——时间线就绪后必须
// 以同一核心纯函数对 question 卡补全重派生。
assert.ok(
	bundle.includes('timelineQuestionPreview(entry.timeline)') &&
		bundle.includes('entry.noteText = awaitNoteText("blocked", "question", question)'),
	"待回复卡在时间线就绪后补全提问标题派生，不依赖下一帧重绘（R-01-002/AC-09 时序缺陷回归）",
);
// R-01-002/AC-03、AC-04 完成提醒卡绿色成功卡面（C-040）：深色静态暗绿底+绿描边光晕，浅色取 success 别名。
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="done"] {\n  --dap-wait-color: #58c98f;\n  border-color: color-mix(in srgb, #58c98f 55%, transparent);') &&
		bundle.includes("background: rgba(32, 41, 35, 0.97);"),
	"完成提醒卡为暗绿底色与绿描边光晕，强度与其它等待卡一致（R-01-002/AC-03、AC-04）",
);
assert.ok(
	bundle.includes('body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="done"] {\n  background: var(--dsw-alias-state-success-tertiary, rgb(230, 250, 237));\n}'),
	"浅色主题完成提醒卡取宿主 success 三级背景别名（R-01-002/AC-04）",
);
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="error"] {\n  --dap-wait-color: #f06a72;'),
	"错误提醒卡为红色调卡面（与时间线错误红同源）（R-01-002/AC-13，C-043）",
);
assert.ok(
	bundle.includes('body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="error"] {\n  background: rgb(252, 233, 234);\n}'),
	"浅色主题错误提醒卡取淡红错误底（R-01-002/AC-13，C-043）",
);
assert.ok(
	!bundle.includes('.dap-card[data-kind="awaiting"][data-wait="done"] .dap-badge') &&
		bundle.includes('[data-dsh-activity-pane] .dap-capsule {\n  flex: none; display: inline-flex; align-items: center; gap: 4px;') &&
		bundle.includes('[data-dsh-activity-pane] .dap-capsule-icon {'),
	"末行徽标结构整体迁移为胶囊：无行尾徽标隐藏规则，胶囊双段规则在位（R-01-002/AC-08，C-043）",
);
// R-01-002/AC-06 计数徽标底色跟随等待构成（C-040、C-043）：三处镜像面 tone=done 取绿、tone=error 取红。
assert.ok(
	bundle.includes("awaitBadgeTone(active)") &&
		(bundle.match(/\.dap-toggle\[data-awaiting\]\[data-tone="done"\] \.dap-toggle-count/g) ?? []).length >= 1 &&
		(bundle.match(/\.dap-toggle\[data-awaiting\]\[data-tone="error"\] \.dap-toggle-count/g) ?? []).length >= 1,
	"三处数量徽标按等待构成写入 tone 属性并接入 done 绿/error 红变体（R-01-002/AC-06）",
);
assert.ok(
	bundle.includes('body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-count[data-awaiting][data-tone="done"],') &&
		bundle.includes("var(--dsw-alias-state-success-tertiary, rgb(230, 250, 237))"),
	"浅色主题徽标 done 色调取 success 别名（R-01-002/AC-06）",
);
assert.ok(
	bundle.includes('body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-count[data-awaiting][data-tone="error"],') &&
		bundle.includes("rgb(252, 233, 234)"),
	"浅色主题徽标 error 色调取淡红错误底（R-01-002/AC-06，C-043）",
);
// R-01-001/AC-04、AC-05、AC-06 徽标 n/m 计数；R-01-002/AC-06、AC-07 同色等待占比脉冲
assert.ok(bundle.includes("text: `${waiting}/${total}`,"), "数量徽标以 n/m 分数形式呈现");
assert.ok(
	bundle.includes("awaitBadgeStats(active)") && bundle.includes("awaitPulsePeriod(waiting, total)"),
	"计数与脉冲周期由核心纯函数单点派生（脉冲按等待行动占比）",
);
assert.ok(
	bundle.includes("[data-dsh-activity-pane] .dap-count[data-awaiting] {\n  /* 底色/透明度与等待卡完全一致、无描边与外环") &&
		bundle.includes("[data-dsh-activity-pane] .dap-rail-count[data-awaiting] {\n  background: rgba(46, 42, 26, 0.97);"),
	"数量徽标等待态底色/透明度与等待卡完全一致、无描边与外环（R-01-002/AC-06）",
);
assert.equal(
	(bundle.match(/data-blocked/g) ?? []).length,
	0,
	"脉冲门控不再区分阻塞等待：data-blocked 属性与选择器整体移除，任一等待行动即脉冲（R-01-002/AC-06，C-037）",
);
assert.ok(
	!bundle.includes("box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent);\n  animation: dap-await-pulse"),
	"三处镜像面等待态均无 1px 外环（R-01-002/AC-06）",
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
		"body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-rail-count[data-awaiting],\nbody:not([data-ds-dark-theme]) .dap-toggle[data-awaiting] .dap-toggle-count {\n  background: rgb(253, 244, 208);\n}",
	),
	"浅色主题数量徽标覆盖声明体完整：仅等待卡浅色金色背景、无描边与外环（防空规则回归）",
);
assert.ok(bundle.includes("`${total} 个活动会话，${blocked} 个等待你答复`"), "数量徽标 aria-label 携带阻塞等待计数说明（R-01-002/AC-06）");
assert.ok(bundle.includes("border-radius: 999px; padding: 1px 8px 1px 3px;\n}\n/* 胶囊圆底类型图标"), "等待胶囊规则正确闭合，后续为圆底图标段（R-01-002/AC-04 结构回归防护）");
assert.ok(
	bundle.includes("border-radius: 999px;\n  padding: 0 7px;\n}\n[data-dsh-activity-pane] .dap-count[data-awaiting] {"),
	"数量徽标基态规则无描边、正确闭合，紧随其后为等待态变体（R-01-001/AC-04 结构回归防护）",
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

// R-01-003/AC-08、AC-09、AC-10、AC-11、AC-12
// 工作区徽标按身份派生基色、经同屏跨色区槽位消解后着色：渲染层写入 --dap-workspace-hue，
// CSS 以 OKLCH 调色板色直接呈现文字，底色/描边在 OKLCH 空间同色相混合；胶囊几何与字号不变。
assert.ok(bundle.includes("resolveWorkspaceHues(visibleEntries.map((entry) => entry.workspaceKey))"), "渲染层按同帧可见身份集合消解色相（R-01-003/AC-12）");
assert.ok(bundle.includes("hueByWorkspace.get(entry.workspaceKey)"), "每张卡使用集合消解后的工作区色相（R-01-003/AC-08、AC-12）");
assert.ok(bundle.includes('style.setProperty("--dap-workspace-hue"'), "渲染层把消解后色相写入徽标 --dap-workspace-hue（R-01-003/AC-08、AC-12）");
assert.ok(bundle.includes('style.removeProperty("--dap-workspace-hue")'), "徽标隐藏时移除色相变量，不留陈旧着色（R-01-003/AC-08）");
assert.ok(bundle.includes("--dap-workspace-color: oklch(0.78 0.16 var(--dap-workspace-hue, 235))"), "深色主题文字使用 OKLCH 高明度中高彩度调色板色（R-01-003/AC-11）");
assert.ok(bundle.includes("color: var(--dap-workspace-color)"), "徽标文字直接使用调色板色、不混 currentColor（R-01-003/AC-11）");
assert.ok(bundle.includes("color-mix(in oklch, var(--dap-workspace-color) 14%, transparent)"), "深色主题底色在 OKLCH 空间同色相铺底（R-01-003/AC-11）");
assert.ok(bundle.includes("color-mix(in oklch, var(--dap-workspace-color) 34%, transparent)"), "深色主题描边在 OKLCH 空间同色相混合（R-01-003/AC-11）");
assert.ok(bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-workspace {"), "浅色主题单独校准徽标配色（R-01-003/AC-10、AC-11）");
assert.ok(bundle.includes("--dap-workspace-color: oklch(0.48 0.15 var(--dap-workspace-hue, 235))"), "浅色主题文字使用 OKLCH 低明度中高彩度调色板色（R-01-003/AC-11）");
assert.ok(bundle.includes("color-mix(in oklch, var(--dap-workspace-color) 10%, transparent)"), "浅色主题底色更轻（R-01-003/AC-11）");
assert.ok(bundle.includes("color-mix(in oklch, var(--dap-workspace-color) 28%, transparent)"), "浅色主题描边（R-01-003/AC-11）");
assert.ok(!bundle.includes("color-mix(in srgb, var(--dap-workspace-color) 92%, currentColor)"), "工作区文字不得再以 currentColor 冲淡调色板色（R-01-003/AC-11）");

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

// R-01-010/AC-07（双向）
// 历史区→活动区反向迁移：检测接线 prevRenderedRecentIds，ghost 源池为历史卡池、目标池为活动卡池。
assert.ok(
	bundle.includes("...movedToActiveIds(prevRenderedRecentIds, active, recent).map((id) => ({ id, from: recentCardsById, to: cardsById }))"),
	"历史区→活动区迁移经 movedToActiveIds 检测，ghost 源/目标卡池反向接线",
);
assert.ok(bundle.includes("const target = plan.to.get(plan.id)?.el;"), "ghost 目标矩形按迁移方向从目标卡池量取（双向共用）");
assert.ok(
	bundle.includes("prevRenderedRecentIds = new Set(recent.map((entry) => String(entry.id)))"),
	"上一帧历史区 id 集合随签名提交记账（反向迁移检测前提）",
);

// R-01-010/AC-10 受影响卡片 FLIP 过渡
// 迁移帧内位置变化的其它卡片（含历史区段头）以反向位移 + dap-shift 过渡平滑归位，不瞬间跳变。
assert.ok(
	bundle.includes("[data-dsh-activity-pane] .dap-shift {\n  transition: transform 0.3s ease;\n}"),
	"受影响卡片经 dap-shift 获得 transform 过渡（与 ghost 同时长同缓动）",
);
assert.ok(
	bundle.includes("const shiftRects = movePlans.length > 0 ? snapshotShiftRects() : null;"),
	"仅迁移帧量取受影响卡片矩形；reduced-motion 下 prepareMoveGhosts 返回空、FLIP 整体跳过",
);
assert.ok(bundle.includes('renderedPane?.querySelector(".dap-recent-head")'), "历史区段头一并纳入 FLIP 量取（段头不瞬间跳变）");
assert.ok(bundle.includes("void el.offsetWidth;"), "反向位移先无过渡落位、reflow 后挂过渡类归零（FLIP 标准序）");
assert.ok(
	bundle.includes('if (event.target !== el || event.propertyName !== "transform") return;'),
	"transitionend 冒泡隔离：子元素过渡（进度条 width）不提前收口，只收口本元素 transform 过渡",
);
assert.ok(
	bundle.includes('el.addEventListener("transitionend", cleanup)') && !bundle.includes('"transitionend", cleanup, { once: true }'),
	"平移收口监听不用 once（once 会被冒泡事件空耗），命中后手动移除",
);
assert.ok(bundle.includes("cancelShift(rec.el);"), "卡片被 prune 时同步取消其平移状态（不残留监听与内联位移）");
assert.ok(
	bundle.includes("for (const el of [...shiftCleanups.keys()]) cancelShift(el);"),
	"卸载时清理全部在飞平移（R-02-003 卸载不残留）",
);

// R-01-004/AC-03
// 滚动条仅滚动时显示：thumb 默认透明、data-scrolling 时显示；Firefox 路径在 @supports 门内。
assert.ok(bundle.includes(".dap-scroll::-webkit-scrollbar-thumb {\n  background: transparent;"), "滚动条 thumb 默认透明（不滚动时不显示）");
assert.ok(bundle.includes(".dap-scroll[data-scrolling]::-webkit-scrollbar-thumb"), "滚动中经 data-scrolling 显示滚动条");
assert.ok(bundle.includes("@supports not selector(::-webkit-scrollbar)") && bundle.includes("scrollbar-color: transparent transparent"), "Firefox 路径以 @supports 门隔离（防 Chromium 丢弃伪元素规则）");
assert.ok(bundle.includes('scroll?.addEventListener("scroll", onScroll, { passive: true })'), "滚动监听置位 data-scrolling");
assert.ok(bundle.includes('scroll?.removeEventListener("scroll", onScroll);\n\t\t\tif (scrollHideTimer !== null) clearTimeout(scrollHideTimer);'), "unbind 同步清理滚动监听与隐藏定时器（R-02-003/AC-02）");

// R-01-018 回到顶部悬浮图标按钮
// R-01-018/AC-01、R-01-018/AC-03：骨架按钮默认 hidden，滚动监听按 TOP_THRESHOLD 阈值揭隐/隐藏；
// R-01-018/AC-02：激活 scrollTo 回顶，reduced-motion 直接定位；R-01-018/AC-04：窄条态 CSS 隐藏；
// R-01-018/AC-05：纯图标（无文字、aria-label 可访问名称）、右下角定位、不透明底色。
assert.ok(
	bundle.includes('<button class="dap-top" type="button" aria-label="回到顶部" title="回到顶部" hidden></button>'),
	"窗格骨架含默认隐藏的「回到顶部」图标按钮：无文字、aria-label 提供可访问名称（键盘激活与 click 同路径）",
);
assert.ok(
	bundle.includes('pane.querySelector(".dap-top").append(createTopIcon());')
		&& bundle.includes('function createTopIcon()')
		&& bundle.includes('d: "M7 12.5V2"'),
	"按钮图标在窗格创建时经 createTopIcon 注入（向上箭头描边几何，14 盒，createInlineIcon 保证 aria-hidden）",
);
assert.ok(
	bundle.includes("[data-dsh-activity-pane] .dap-top {\n  position: absolute;\n  bottom: 12px;\n  right: 12px;"),
	"回到顶部按钮悬浮定位于窗格右下角（不居中，R-01-018/AC-01）",
);
assert.ok(!bundle.includes(".dap-top {\n  position: absolute;\n  bottom: 12px;\n  left: 50%;"), "底部居中定位已移除");
assert.ok(
	bundle.includes("border-radius: 999px;\n  background: #1d1f25;")
		&& !bundle.includes(".dap-top {\n  position: absolute;\n  bottom: 12px;\n  right: 12px;\n  z-index: 6;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: 1px solid color-mix"),
	"按钮底色为不透明纯色（非 color-mix 半透明，R-01-018/AC-05）",
);
assert.ok(
	bundle.includes("body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-top {\n  background: var(--dsw-alias-bg-layer-2, #ffffff);\n  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));"),
	"浅色主题底色取外壳 layer-2 别名（同样不透明，R-01-018/AC-05）",
);
assert.ok(
	bundle.includes("[data-dsh-activity-pane] .dap-top[hidden] { display: none; }"),
	"基类 display:flex 会压过 UA [hidden] 规则，显式补 hidden 隐藏（未超阈值不显示）",
);
assert.ok(
	bundle.includes('const topBtn = pane.querySelector(".dap-top");')
		&& bundle.includes("if (topBtn !== null && scroll !== null) topBtn.hidden = scroll.scrollTop <= TOP_THRESHOLD;")
		&& bundle.includes("syncTopBtn();"),
	"按钮显隐收敛到 syncTopBtn 单点：scrollTop 超 TOP_THRESHOLD 显示、阈值内隐藏（复用既有 scroll 监听，无新增监听）",
);
assert.ok(
	bundle.includes('pane.setAttribute("data-collapsed", "false");\n\t\t\tnotifyLayoutChange();\n\t\t\t// 折叠期间 display:none 可能令 scrollTop 归零而不派发 scroll 事件，展开时同步一次。\n\t\t\tsyncTopBtn();'),
	"窄条展开时同步一次按钮显隐（折叠期 scrollTop 归零不一定派发 scroll 事件，R-01-018/AC-03）",
);
assert.ok(
	bundle.includes('scroll?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });'),
	"激活回顶：reduced-motion 直接定位，否则平滑滚动（R-01-018/AC-02）",
);
assert.ok(
	bundle.includes('[data-dsh-activity-pane][data-collapsed="true"] .dap-top { display: none; }'),
	"桌面折叠窄条态不显示回到顶部按钮（R-01-018/AC-04）",
);
assert.ok(
	bundle.includes('topBtn?.addEventListener("click", onTopClick);')
		&& bundle.includes('topBtn?.removeEventListener("click", onTopClick);'),
	"按钮 click 监听随 bindPaneControls 绑定并在 unbind 清理（R-02-003/AC-02）",
);

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
// R-01-006/AC-01 等待卡同为当前会话时仍以蓝色描边/光晕高亮：[data-current] 基态规则
// 与 [data-kind="awaiting"] 同优先级且定义在前，须由组合选择器（0-4-0）重声明。
assert.ok(
	bundle.includes('[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-current] {\n  border-color: color-mix(in srgb, #65a0ff 75%, transparent);\n  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);\n}'),
	"等待当前卡重声明蓝色描边与光晕（组合选择器压过等待态橙色）",
);


// ---- R-01-002/AC-10～AC-12 宿主侧完成确认契约（C-030）----
// R-01-002/AC-12 刷新/重连恢复：状态由宿主侧持久化承载，不依赖客户端在线观测。
const hostSource = await readFile(join(root, "src/host.mjs"), "utf8");
const hostEntry = await readFile(join(root, ".dsh-plugin/index.mjs"), "utf8");
execFileSync(process.execPath, ["--check", join(root, "src/host.mjs")], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", join(root, ".dsh-plugin/index.mjs")], { stdio: "pipe" });
assert.ok(hostEntry.includes("from '../src/host.mjs'") && hostEntry.includes("export { apply, inject, name }"), "宿主侧入口转发 src/host.mjs（免构建）");
assert.ok(hostSource.includes("ctx.on('session/event'") && hostSource.includes("event?.type !== 'turn/end'"), "宿主侧订阅 session/event 并过滤 turn/end（AC-03）");
assert.ok(hostSource.includes("event.time"), "以事件顶层 time 登记回合结束时刻");
assert.ok(hostSource.includes("storageDomain.open(domainSpec)") && hostSource.includes("acks: domainTable(ackRecord)"), "完成确认状态持久化于 storageDomain 表（AC-12）");
assert.ok(hostSource.includes("const API_PATH = '/dsh-activity-pane/api'") && hostSource.includes("path: API_PATH"), "宿主侧路由挂载于 /dsh-activity-pane/api");
assert.ok(hostSource.includes("'/acks/stream'") && hostSource.includes("text/event-stream"), "SSE 推送通道（AC-11、AC-12）");
assert.ok(hostSource.includes("'/ack'") && hostSource.includes("ackedAt: Date.now()"), "ack 写回路由（AC-10～AC-12）");
assert.ok(hostSource.includes("streamClients") && hostSource.includes("for (const res of streamClients)"), "SSE 连接集合随卸载全数关闭");


// ---- E2E runner 浏览器生命周期契约（C-046、C-047，T-085）----
const e2eRunnerSource = await readFile(join(root, "e2e/run.mjs"), "utf8");
assert.equal(e2eRunnerSource.match(/chromium\.launch\(/g)?.length, 1, "runner 只有一条 Chromium 启动路径");
assert.ok(e2eRunnerSource.includes("context = await browser.newContext()"), "每次隔离环境创建独立 browser context");
assert.ok(e2eRunnerSource.includes("await browser?.close()"), "每次 spec/恢复尝试都关闭浏览器进程");
assert.ok(!e2eRunnerSource.includes("sharedBrowser"), "不保留未使用或跨环境共享的浏览器进程");
assert.ok(e2eRunnerSource.includes("const MAX_CONCURRENCY = 1") && e2eRunnerSource.includes("Math.min(MAX_CONCURRENCY, specFiles.length)"), "E2E 固定顺序执行，避免 hosted runner 资源竞争");
assert.ok(e2eRunnerSource.includes("attempt < 2"), "sessions stall 最多换一次全新环境");
const e2eHelperSource = await readFile(join(root, "e2e/helpers.mjs"), "utf8");
assert.equal(e2eHelperSource.match(/page\.goto\(url/g)?.length, 1, "页面连接世代只由一条受控路径建立");
assert.ok(e2eHelperSource.includes("const PANE_READY_TIMEOUT_MS = 6_000"), "rc.7 页面连接世代使用固定 6s 观察窗口");
assert.ok(e2eHelperSource.includes("attempt < 5"), "每环境最多五个页面连接世代");

// ---- GitHub CI 触发策略（C-050，T-086）----
const ciWorkflowSource = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
assert.ok(!ciWorkflowSource.includes("pull_request:"), "不为未采用的 pull request 运行 CI");
assert.ok(ciWorkflowSource.includes("branches: [main]"), "main push 触发 CI");
assert.ok(ciWorkflowSource.includes('tags: ["v*"]'), "v* release tag 触发 CI");
assert.ok(ciWorkflowSource.includes("workflow_dispatch:"), "允许手工重跑 CI");
assert.ok(!ciWorkflowSource.includes("runner.tool_cache"), "job 级 env 不引用尚不可用的 runner context");
assert.ok(ciWorkflowSource.includes("fetch-depth: 0"), "CI checkout 保留完整历史以验证 terminal task commit 证据");
assert.ok(ciWorkflowSource.includes("timeout-minutes: 30"), "顺序 E2E 与有界恢复拥有明确 hosted timeout");

// ---- E2E 基建：mock LLM 剧本服务行为断言（C-045，T-082）----
// 浏览器 spec 驱动真实 UI；三剧本的 SSE 形状与分流规则在此做 Node 级行为验证。
const { startMockLlm } = await import("../e2e/mock-llm.mjs");
const mock = await startMockLlm();
try {
	/** 请求 mock 并解析 SSE 负载序列（[DONE] 收尾）。 */
	async function requestScenario(text, extraMessages = []) {
		const res = await fetch(`${mock.url}/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "deepseek-v4-flash",
				stream: true,
				messages: [...extraMessages, { role: "user", content: text }],
			}),
		});
		assert.equal(res.status, 200, "mock 接受 chat/completions 请求");
		const raw = await res.text();
		const events = raw.split("\n\n").filter(Boolean);
		assert.equal(events.at(-1), "data: [DONE]", "SSE 以 [DONE] 收尾（dsh-llm-deepseek 协议期望）");
		return events.slice(0, -1).map((line) => JSON.parse(line.replace(/^data: /, "")));
	}

	// fast：无关键词走默认剧本（单文本块 + stop + 尾随 usage）；显式 e2e:fast 同路径。
	const fast = await requestScenario("随便聊聊");
	assert.ok(fast[0].choices[0].delta.content.length > 0, "fast 首块携带文本");
	assert.equal(fast.at(-2).choices[0].finish_reason, "stop", "fast 以 stop 收尾");
	assert.ok(fast.at(-1).usage.completion_tokens > 0, "尾随 usage-only 块");
	await requestScenario("e2e:fast 探针");

	// slow：24 个内容块分帧到达（会话保持运行）。
	const slow = await requestScenario("e2e:slow 探针");
	const slowContent = slow.filter((e) => e.choices?.[0]?.delta?.content);
	assert.equal(slowContent.length, 24, "slow 分 24 块流式输出");
	assert.equal(slow.at(-2).choices[0].finish_reason, "stop", "slow 以 stop 收尾");

	// ask：tool_calls 增量可重组为合法 ask_user_question 参数，finish_reason 为 tool_calls。
	const ask = await requestScenario("e2e:ask 探针");
	const askArgs = ask.flatMap((e) => e.choices?.[0]?.delta?.tool_calls ?? []).map((c) => c.function?.arguments ?? "").join("");
	const parsed = JSON.parse(askArgs);
	assert.ok(parsed.questions[0].question.length > 0 && parsed.questions[0].options.length === 2, "ask 工具参数重组为合法提问负载");
	assert.equal(ask.at(-2).choices[0].finish_reason, "tool_calls", "ask 以 tool_calls 收尾");

	// 分流规则：含 tool 结果的回合一律 fast 收口，忽略历史消息里的关键词。
	const afterTool = await requestScenario("继续", [
		{ role: "user", content: "e2e:slow 历史指令" },
		{ role: "tool", tool_call_id: "call_e2e_ask", content: "继续" },
	]);
	assert.ok(afterTool.length <= 4 && afterTool.at(-2).choices[0].finish_reason === "stop", "tool 结果回合直接 fast 收口");

	// 默认剧本：无关键词走 fast；非 chat/completions 路径 404。
	assert.deepEqual(mock.scenarioLog, ["fast", "fast", "slow", "ask", "fast"], "scenarioLog 记录分流结果（默认/显式 fast、slow、ask、tool 收口）");
	const wrongPath = await fetch(`${mock.url}/models`);
	assert.equal(wrongPath.status, 404, "非 chat/completions 路径返回 404");
} finally {
	await mock.close();
}


console.log("check: all assertions passed");
