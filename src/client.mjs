// dsh-activity-pane 浏览器运行时。
//
// 挂载策略：把窗格作为 AppFrame 中 `conversation` 槽座的前置兄弟列插入
// （`#root [data-slot="conversation"] || .parentElement` 即 flex 行），让外壳的
// 让步链挤压中间栏；窄屏（<=767px）转为固定抽屉 + 浮动开关按钮。
//
// 数据来源：DSH 原生 `sessions` / `workspaces` 客户端服务（推送式快照）+ 对
// 运行中会话的原生订阅（binding().session），不依赖任何第三方插件数据路由，
// 也无需轮询。窗格内容分上下两段：上「活动会话」、下「最近历史」（24h）。

const name = "dsh-activity-pane";
const inject = [];

const CONVERSATION_SELECTOR = "#root [data-slot=\"conversation\"]";
const PANE_ATTR = "data-dsh-activity-pane";
const PANE_CLASS = "dap-pane";
const LIST_CLASS = "dap-list";
const RECENT_CLASS = "dap-recent";
const CARD_CLASS = "dap-card";
const STYLE_ID = "dsh-activity-pane-style";
const DEFAULT_WIDTH = 280;
const COLLAPSED_WIDTH = 34;
const INDENT_PX = 16;
const MOBILE_BREAKPOINT = "767px";
/** 运行卡时钟：只要存在运行中会话，就以该周期刷新时长显示。 */
const CLOCK_MS = 1000;

const CSS = `
[data-dsh-activity-pane] {
  --dap-width: ${DEFAULT_WIDTH}px;
  flex: 0 0 var(--dap-width);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  border-right: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 3%, transparent);
  color: var(--dsw-alias-label-primary, #e8ebf2);
  user-select: none;
}
[data-dsh-activity-pane] .dap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
[data-dsh-activity-pane] .dap-count {
  flex: none;
  margin-left: auto;
  font-size: 10px;
  line-height: 16px;
  font-weight: 600;
  color: #221a10;
  background: linear-gradient(180deg, #ffd488, #e8a33d);
  border-radius: 999px;
  padding: 0 7px;
}
[data-dsh-activity-pane] .dap-count[data-awaiting] {
  background: linear-gradient(180deg, #ffb4b4, #f06a72);
  color: #2a1012;
  animation: dap-await-pulse 1.2s ease-in-out infinite;
}
@keyframes dap-await-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
[data-dsh-activity-pane] .dap-collapse,
[data-dsh-activity-pane] .dap-close {
  flex: none;
  margin: 0;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  min-width: 20px;
  min-height: 20px;
  line-height: 18px;
  text-align: center;
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: currentColor;
  padding: 0 5px;
}
[data-dsh-activity-pane] .dap-collapse { display: none; font-size: 13px; }
[data-dsh-activity-pane] .dap-close { display: none; font-size: 14px; }
/* 单一滚动区：活动区与最近历史同一容器滚动；touch-action/overscroll 防止
   触屏滚动穿透到下层页面（移动端「滚的是下面的会话界面」即根因）。 */
[data-dsh-activity-pane] .dap-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  padding: 0 0 10px;
}
[data-dsh-activity-pane] .dap-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px;
}
/* 最近历史区：同一滚动区内的块段；整段可隐藏。 */
[data-dsh-activity-pane] .dap-recent {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding: 6px 8px 0;
  margin-top: 4px;
}
[data-dsh-activity-pane] .dap-recent[hidden] { display: none; }
[data-dsh-activity-pane] .dap-recent-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 52%, transparent);
  text-transform: uppercase;
}
/* 折叠：仅桌面生效；窄条 + 竖直计数。 */
[data-dsh-activity-pane] .dap-rail {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
}
[data-dsh-activity-pane] .dap-rail-count {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  padding: 0 5px;
  text-align: center;
  line-height: 20px;
  font-size: 10px;
  font-weight: 700;
  background: color-mix(in srgb, currentColor 16%, transparent);
}
[data-dsh-activity-pane] .dap-rail-count[data-awaiting] {
  background: linear-gradient(180deg, #ffb4b4, #f06a72);
  color: #2a1012;
}
/* 桌面：窗格作为中间列内的真实 flex 行元素参与布局——中间列被置为行方向，
   窗格固定宽、会话区弹性收缩，整个会话内容被真实挤到右边；折叠时收窄为窄条。 */
@media (min-width: 768px) {
  [data-dsh-activity-pane] .dap-collapse { display: inline-block; }
  [data-dsh-activity-pane][data-collapsed="true"] { flex-basis: ${COLLAPSED_WIDTH}px; }
  [data-dsh-activity-pane][data-collapsed="true"] .dap-scroll,
  [data-dsh-activity-pane][data-collapsed="true"] .dap-count,
  [data-dsh-activity-pane][data-collapsed="true"] .dap-collapse { display: none; }
  [data-dsh-activity-pane][data-collapsed="true"] .dap-rail { display: flex; cursor: pointer; }
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
  [data-dsh-activity-pane] .dap-close { display: inline-block; }
}
/* 卡片视觉沿用 answer-pet 的多会话卡片设计（MIT 参考，见 README）。 */
[data-dsh-activity-pane] .dap-card {
  flex: none;
  min-width: 0;
  padding: 9px 11px;
  border-radius: 14px;
  background: rgba(29, 31, 37, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  display: grid;
  gap: 4px;
  cursor: pointer;
}
[data-dsh-activity-pane] .dap-card:hover {
  border-color: rgba(255, 255, 255, 0.28);
}
[data-dsh-activity-pane] .dap-card:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 70%, transparent);
  outline-offset: 2px;
}
[data-dsh-activity-pane] .dap-card[data-kind="subagent"] {
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(25, 27, 32, 0.95);
}
[data-dsh-activity-pane] .dap-card[data-kind="recent"] {
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(22, 24, 29, 0.9);
  border-color: transparent;
}
[data-dsh-activity-pane] .dap-card[data-current] {
  border-color: color-mix(in srgb, #65a0ff 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);
}
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"] {
  border-color: color-mix(in srgb, #e8a33d 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent), 0 6px 16px rgba(0,0,0,.3);
  background: rgba(35, 31, 25, 0.97);
}
[data-dsh-activity-pane] .dap-card[data-opening] {
  opacity: 0.85;
  animation: dap-opening 0.9s ease-in-out infinite;
}
@keyframes dap-opening { 0%,100% { opacity: 0.95; } 50% { opacity: 0.5; } }
[data-dsh-activity-pane] .dap-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
[data-dsh-activity-pane] .dap-dot {
  width: 7px; height: 7px; flex: none; border-radius: 50%;
  background: #58c98f;
  box-shadow: 0 0 7px rgba(88,201,143,.8);
  animation: dap-pulse 1.2s ease-in-out infinite;
}
@keyframes dap-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"] .dap-dot {
  background: #e8a33d;
  box-shadow: 0 0 8px rgba(232,163,61,.85);
}
[data-dsh-activity-pane] .dap-card[data-kind="recent"] .dap-dot {
  background: #8a94a3;
  box-shadow: none;
  animation: none;
}
[data-dsh-activity-pane] .dap-title {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 12px; line-height: 16px; font-weight: 700;
}
[data-dsh-activity-pane] .dap-badge {
  flex: none; font-size: 10px; line-height: 14px; font-weight: 600;
  color: #221a10; background: linear-gradient(180deg, #ffd488, #e8a33d);
  border-radius: 999px; padding: 0 7px;
}
[data-dsh-activity-pane] .dap-workspace {
  width: fit-content; max-width: 100%; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 9.5px; line-height: 14px;
  color: color-mix(in srgb, currentColor 90%, transparent);
  background: color-mix(in srgb, currentColor 11%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 999px; padding: 0 7px;
}
[data-dsh-activity-pane] .dap-workspace[hidden] { display: none; }
[data-dsh-activity-pane] .dap-note {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; line-height: 15px;
  color: color-mix(in srgb, currentColor 62%, transparent);
}
/* 最近卡「最后做的事情」预览行（R-01-010/AC-05）：预览缺失时整行隐藏只留时间。 */
[data-dsh-activity-pane] .dap-lastact {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 10px; line-height: 14px;
  color: color-mix(in srgb, currentColor 56%, transparent);
}
[data-dsh-activity-pane] .dap-lastact[hidden] { display: none; }
/* 运行卡富化（对齐 answer-pet 卡片；MIT 参考，见 README）。 */
[data-dsh-activity-pane] .dap-pct {
  flex: none; font-size: 12px; line-height: 15px; font-weight: 700;
  color: #9fe8c4; font-variant-numeric: tabular-nums;
}
[data-dsh-activity-pane] .dap-status {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; line-height: 15px;
  color: #afb7c4; font-variant-numeric: tabular-nums;
}
/* 动作时间线：纵向竖线串起圆点（对齐 answer-pet 的 .ap-session-trace，并修正几何细节——
   轨道下放到每个节点项自身：竖线与圆点严格同圆心且都在整数 CSS 像素位上（圆点 7px 奇数
   宽、left:3，竖线 1px、left:6，二者圆心同为 x=6.5，避免 1px 竖线在分数位被像素栅格吸附
   导致右偏）；每项一段竖线从项顶（容器顶）贯穿，使线穿过首个节点圆点并向上引出（表示更早
   历史被省略）、末项不画竖线（终点没入最新动作圆点内部不外露）；圆点高处盖线、位于内容区
   内不被子代理卡 overflow 裁切。 */
[data-dsh-activity-pane] .dap-trace {
  display: flex; flex-direction: column; gap: 3px;
  margin: 1px 0 2px 3px;
  min-width: 0;
}
[data-dsh-activity-pane] .dap-trace:empty { display: none; }
[data-dsh-activity-pane] .dap-trace-item {
  position: relative; display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 7px; min-width: 0;
  padding-left: 14px;   /* 左侧轨道：圆点（圆心 x=6.5）与竖线（x=6.5）共用 */
  color: #c7ced9; font-size: 10px; line-height: 14px;
}
[data-dsh-activity-pane] .dap-trace-item::before {
  content: ""; position: absolute; left: 3px; top: 3px;
  width: 7px; height: 7px; border-radius: 50%;
  z-index: 1;           /* 圆点盖在竖线上：竖线从圆点中穿过被其遮盖 */
  background: #778394;
  box-shadow: 0 0 0 2px rgba(119, 131, 148, .14);
}
[data-dsh-activity-pane] .dap-trace-item[data-status="running"]::before {
  background: #65a0ff;
  box-shadow: 0 0 0 2px rgba(101,160,255,.16), 0 0 6px rgba(101,160,255,.65);
  animation: dap-pulse 1.15s ease-in-out infinite;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="done"]::before {
  background: #58c98f;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="error"]::before {
  background: #f06a72;
}
/* 每项一段竖线（末项不画，z-index 低于圆点）：从项顶（容器顶）贯穿本项、经圆点下方
   继续延伸到下一颗圆点顶缘 —— 线穿过首个节点圆点并向上引出（省略的历史）、终点没入
   最新动作圆点内部不外露。依赖 14px 行高 + 3px 间距；bottom 多 1px 让终点藏进
   下一颗圆点。 */
[data-dsh-activity-pane] .dap-trace-item::after {
  content: ""; position: absolute; left: 6px; top: 0; bottom: -8px;
  width: 1px; z-index: 0;
  background: rgba(126, 147, 177, .3);
}
[data-dsh-activity-pane] .dap-trace-item:last-child::after { content: none; }
[data-dsh-activity-pane] .dap-trace-main {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-dsh-activity-pane] .dap-trace-detail {
  color: #8f9aaa;
}
[data-dsh-activity-pane] .dap-trace-time {
  flex: none; font-size: 9.5px; color: #7f8998;
  font-variant-numeric: tabular-nums;
}
/* 子代理：同一节点项几何（轨道/圆点/竖线在项内自绘）；去掉容器级 overflow/padding/
   border，避免把左侧圆点裁掉。文本截断由 .dap-trace-main 自处理。 */
[data-dsh-activity-pane] .dap-subtrace {
  min-width: 0;
  font-size: 10px; line-height: 14px;
  color: color-mix(in srgb, currentColor 72%, transparent);
  margin: 1px 0 0 4px;
}
[data-dsh-activity-pane] .dap-subtrace .dap-trace-item {
  color: inherit;
}
[data-dsh-activity-pane] .dap-track {
  position: relative; height: 5px; border-radius: 6px; overflow: hidden;
  background: rgba(255, 255, 255, 0.11);
}
[data-dsh-activity-pane] .dap-fill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  border-radius: 6px;
  background: linear-gradient(90deg, #58c98f, #2fb27a);
  box-shadow: 0 0 7px rgba(88, 201, 143, 0.5);
  transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
/* 流式阶段（data-streaming）：填充条切换为向右滚动的条纹动画（对齐 answer-pet
   的 .ap-session-card[data-streaming] .ap-session-fill + ap-stripes）。 */
[data-dsh-activity-pane] .dap-card[data-streaming] .dap-fill {
  background: repeating-linear-gradient(90deg, #58c98f 0 10px, #3fbf86 10px 20px);
  background-size: 200% 100%;
  animation: dap-stripes 0.8s linear infinite;
}
@keyframes dap-stripes {
  from { background-position: 0 0; }
  to { background-position: 40px 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-activity-pane] .dap-fill,
  [data-dsh-activity-pane] .dap-card[data-streaming] .dap-fill,
  [data-dsh-activity-pane] .dap-trace-item[data-status="running"]::before {
    animation: none !important;
  }
  [data-dsh-activity-pane] .dap-fill { transition: none; }
}
[data-dsh-activity-pane] .dap-empty {
  padding: 14px 12px; font-size: 12px; text-align: center;
  color: color-mix(in srgb, currentColor 45%, transparent);
}
/* 移动端浮动开关按钮：仅在窄屏显示（桌面隐藏）。 */
.dap-toggle {
  position: fixed; top: 12px; right: 12px; z-index: 2147482991;
  display: none;
  align-items: center; gap: 6px;
  min-height: 30px; padding: 0 11px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  background: rgba(24, 28, 38, 0.94);
  color: currentColor;
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0,0,0,.34);
}
.dap-toggle .dap-toggle-count {
  min-width: 16px; text-align: center; border-radius: 999px;
  background: color-mix(in srgb, currentColor 16%, transparent);
  padding: 0 5px; font-size: 10px; font-weight: 700;
}
.dap-toggle[data-awaiting] .dap-toggle-count {
  background: linear-gradient(180deg, #ffb4b4, #f06a72);
  color: #2a1012;
  animation: dap-await-pulse 1.2s ease-in-out infinite;
}
/* 窄屏：窗格变为固定抽屉 + 浮动开关按钮；抽屉默认隐藏在屏外。
   抽屉需不透明背景（否则透出下层会话内容）+ touch-action:none（把手/头部的
   触摸不滚动下层页面），桌面列则保持低透明分界。 */
@media (max-width: ${MOBILE_BREAKPOINT}) {
  [data-dsh-activity-pane] {
    position: fixed; left: 0; top: 0; bottom: 0;
    width: min(84vw, 320px);
    margin: 0;
    border-right: 1px solid currentColor;
    background: var(--dsw-alias-bg-layer-2, rgba(18, 21, 27, 0.97));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 8px 0 28px rgba(0,0,0,.5);
    transform: translateX(-102%);
    transition: transform 180ms ease;
    z-index: 2147482990;
    touch-action: none;
  }
  [data-dsh-activity-pane][data-open="true"] { transform: translateX(0); }
  .dap-toggle { display: flex; }
}
`;

function getSnapshot(service, key) {
	try {
		return service?.[key]?.getSnapshot?.() ?? null;
	} catch {
		return null;
	}
}

function schedule(callback) {
	if (typeof window.requestAnimationFrame === "function") {
		window.requestAnimationFrame(callback);
	} else {
		queueMicrotask(callback);
	}
}

/** 从原生会话快照归一为运行卡输入：工具名/参数/是否流式或推理/回合开始时间/流程节点。
 *  elapsed 不在快照事件时固化——渲染期用 Date.now()-startTime 实时算，时长才能
 *  随 1s 时钟逐秒跳动（R-01-009/AC-03）。 */
function livenessFromSnapshot(snap) {
	const runningCalls = Array.isArray(snap?.runningCalls) ? snap.runningCalls : [];
	const call = runningCalls[0];
	const runningTool = call?.name ? String(call.name) : null;
	const runningArgs = runningTool !== null ? call?.argsRaw : null;
	const blocks = Array.isArray(snap?.partial?.blocks) ? snap.partial.blocks : [];
	const live = snap?.partial != null && snap?.running !== false;
	const streaming = live && blocks.some((b) => b?.kind === "text");
	const reasoning = live && blocks.some((b) => b?.kind === "reasoning");
	let startTime = null;
	let turn = null;
	const timings = snap?.turnTimings;
	if (timings instanceof Map) {
		for (const [key, timing] of timings) {
			if (
				timing &&
				Number.isFinite(timing.startTime) &&
				timing.endTime === undefined
			) {
				startTime = timing.startTime;
				turn = key;
				break;
			}
		}
	}
	return {
		runningTool,
		runningArgs,
		streaming,
		reasoning,
		startTime,
		turn,
		nodes: Array.isArray(snap?.nodes) ? snap.nodes : [],
	};
}

function fmtRecentTime(ts) {
	try {
		return `最近 ${new Date(ts).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		})}`;
	} catch {
		return "";
	}
}

function apply(ctx) {
	let disposed = false;
	let sessions = null;
	let workspaces = null;
	let sessionUnsubscribe = null;
	let workspaceUnsubscribe = null;
	let serviceTimer = null;
	let clockTimer = null;
	let syncScheduled = false;
	let lastSig = "";
	let collapsed = false;
	/** 活动区卡片 id → { el, kind } 复用表。 */
	const cardsById = new Map();
	/** 历史区卡片 id → { el } 复用表。 */
	const recentCardsById = new Map();
	/** 运行中会话轮内状态订阅：id → { unsubscribe, liveness }。 */
	const livenessById = new Map();
	/** 运行卡进度单调下限：id → { turn, floor }；随运行集清理、卸载清空。 */
	const progressFloor = new Map();

	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	document.head.appendChild(style);

	// 移动端浮动开关按钮（桌面隐藏见 CSS）。
	const toggle = document.createElement("button");
	toggle.className = "dap-toggle";
	toggle.type = "button";
	toggle.setAttribute("aria-label", "切换活动会话窗格");
	toggle.innerHTML =
		"<span>活动会话</span><span class=\"dap-toggle-count\"></span>";
	document.body.appendChild(toggle);

	// 桌面判定与"真实参与布局"：中间列切为行方向，窗格固定宽、会话根弹性填充
	// 剩余宽度（flex:1 + min-width:0），让会话内容（标题/tabs/滚动区/输入框）
	// 被真实挤到窗格右侧，且聊天列在增宽的会话带内自动居中。
	const desktopQuery = window.matchMedia("(min-width: 768px)");
	/** 找到作为 center 弹性子项的真实会话盒（跳过 display:contents 占位层）。 */
	function conversationFlexItem(center) {
		const scroll = document.querySelector("[data-conversation-scroll]");
		if (scroll === null) return null;
		let node = scroll;
		let candidate = null;
		while (node !== null && node !== center && node !== document.body) {
			let display = "";
			try {
				display = window.getComputedStyle(node).display;
			} catch {}
			if (display !== "contents") candidate = node;
			node = node.parentElement;
		}
		return candidate;
	}
	function applyLayout() {
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		if (seat === null || seat.parentElement === null) return;
		const center = seat.parentElement;
		if (!desktopQuery.matches) {
			// 移动端：抽屉脱离文档流（fixed），不参与主会话布局；恢复外壳默认
			// 列布局，避免行方向扰动移动端主会话显示（R-01-008）。
			if (center.style.flexDirection !== "")
				center.style.flexDirection = "";
			if (center.style.alignItems !== "")
				center.style.alignItems = "";
			const flex = conversationFlexItem(center);
			if (flex !== null) {
				if (flex.style.flex !== "") flex.style.flex = "";
				if (flex.style.minWidth !== "") flex.style.minWidth = "";
			}
			return;
		}
		if (center.style.flexDirection !== "row")
			center.style.flexDirection = "row";
		if (center.style.alignItems !== "stretch")
			center.style.alignItems = "stretch";
		const flex = conversationFlexItem(center);
		if (flex !== null) {
			if (flex.style.flex !== "1 1 0%") flex.style.flex = "1 1 0%";
			if (flex.style.minWidth !== "0") flex.style.minWidth = "0";
		}
	}

	function queueSync() {
		if (disposed || syncScheduled) return;
		syncScheduled = true;
		schedule(() => {
			syncScheduled = false;
			if (!disposed) render();
		});
	}

	function installServiceSubscriptions() {
		const nextSessions = ctx.get("sessions");
		const nextWorkspaces = ctx.get("workspaces");
		if (nextSessions === sessions && nextWorkspaces === workspaces) return;

		sessionUnsubscribe?.();
		workspaceUnsubscribe?.();
		sessions = nextSessions ?? null;
		workspaces = nextWorkspaces ?? null;
		sessionUnsubscribe = sessions?.list?.subscribe?.(queueSync) ?? null;
		workspaceUnsubscribe = workspaces?.list?.subscribe?.(queueSync) ?? null;

		if (sessions !== null && workspaces !== null && serviceTimer !== null) {
			clearInterval(serviceTimer);
			serviceTimer = null;
		}
		queueSync();
	}

	// ---- 窗格容器（conversation 槽座的前置兄弟列；外壳重挂载后重插） ----
	function ensurePane() {
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		if (seat === null || seat.parentElement === null) return null;
		// [data-slot="conversation"] 的父级是 AppFrame 的中间列（flex column）。
		// 窗格作为该父级的真实 flex 子项、插在会话座之前（行方向 → 窗格在左），
		// 与其它元素一起参与布局，而不是浮层。
		const center = seat.parentElement;
		let pane = center.querySelector(`[${PANE_ATTR}]`);
		if (pane === null) {
			pane = document.createElement("aside");
			pane.setAttribute(PANE_ATTR, "");
			pane.className = PANE_CLASS;
			center.insertBefore(pane, seat);
			pane.innerHTML = `
				<div class="dap-header">
					<span>活动会话</span>
					<span class="dap-count" role="status" aria-live="polite"></span>
					<button class="dap-collapse" type="button" aria-label="收起窗格" title="收起">«</button>
					<button class="dap-close" type="button" aria-label="收起抽屉">×</button>
				</div>
				<div class="dap-scroll">
					<div class="dap-list" tabindex="-1"></div>
					<div class="dap-recent">
						<div class="dap-recent-head"><span>最近历史 · 24h</span></div>
					</div>
				</div>
				<div class="dap-rail">
					<span class="dap-rail-count" role="status" aria-live="polite"></span>
				</div>
			`;
		}
		return pane;
	}

	function makeEl(tag, cls) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		return node;
	}

	/** 静态骨架卡片；动态文本一律走 textContent，规避 HTML 注入。 */
	function cardChildren(kind) {
		if (kind === "subagent") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			return [row, makeEl("div", "dap-subtrace")];
		}
		if (kind === "recent") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			return [
				makeEl("div", "dap-workspace"),
				row,
				makeEl("div", "dap-lastact"),
				makeEl("div", "dap-note"),
			];
		}
		if (kind === "awaiting") {
			const row = makeEl("div", "dap-row");
			row.append(
				makeEl("span", "dap-dot"),
				makeEl("span", "dap-title"),
				makeEl("span", "dap-badge"),
			);
			return [makeEl("div", "dap-workspace"), row, makeEl("div", "dap-note")];
		}
		// 运行卡骨架对齐 answer-pet：徽标 + 头行（dot/标题/百分比）+ 状态行 + trace + 进度条。
		const row = makeEl("div", "dap-row");
		row.append(
			makeEl("span", "dap-dot"),
			makeEl("span", "dap-title"),
			makeEl("span", "dap-pct"),
		);
		const track = makeEl("div", "dap-track");
		track.append(makeEl("div", "dap-fill"));
		return [
			makeEl("div", "dap-workspace"),
			row,
			makeEl("div", "dap-status"),
			makeEl("div", "dap-trace"),
			track,
		];
	}

	/**
	 * 重绘 trace 容器。lastOnly 时只显示最后一项（子代理当前阶段）且省略每项耗时；
	 * 全量重绘，受签名去重闸门保护，故无需逐项 diff（R-02-003/AC-01）。
	 */
	function renderTrace(container, items, { lastOnly = false } = {}) {
		container.replaceChildren();
		const list = Array.isArray(items) ? items : [];
		const sources = lastOnly ? (list.length === 0 ? [] : [list[list.length - 1]]) : list;
		for (const item of sources) {
			if (item === null || typeof item !== "object") continue;
			const line = makeEl("div", "dap-trace-item");
			line.dataset.status = typeof item.status === "string" ? item.status : "running";
			const main = makeEl("span", "dap-trace-main");
			main.textContent = item.label ?? "";
			if (typeof item.detail === "string" && item.detail.length > 0) {
				const detail = makeEl("span", "dap-trace-detail");
				detail.textContent = ` · ${item.detail}`;
				main.append(detail);
			}
			line.append(main);
			if (!lastOnly) {
				const time = makeEl("span", "dap-trace-time");
				time.textContent = Number.isFinite(item.durationMs)
					? fmtElapsedMs(item.durationMs)
					: "";
				line.append(time);
			}
			container.append(line);
		}
	}

	function renderCardInto(el, entry) {
		const workspaceLabel = el.querySelector(".dap-workspace");
		if (workspaceLabel !== null) {
			if (entry.workspaceTitle !== "") {
				workspaceLabel.textContent = entry.workspaceTitle;
				workspaceLabel.removeAttribute("hidden");
			} else {
				workspaceLabel.textContent = "";
				workspaceLabel.setAttribute("hidden", "");
			}
		}
		const title = el.querySelector(".dap-title");
		if (title !== null && title.textContent !== entry.title)
			title.textContent = entry.title;

		const badge = el.querySelector(".dap-badge");
		if (badge !== null && badge.textContent !== (entry.pendingText ?? ""))
			badge.textContent = entry.pendingText ?? "";

		if (entry.kind === "running") {
			const pct = el.querySelector(".dap-pct");
			if (pct !== null)
				pct.textContent = `${Math.round(entry.progress ?? PROGRESS_THINK_BASE)}%`;
			const status = el.querySelector(".dap-status");
			const next = entry.status ?? "思考中";
			if (status !== null && status.textContent !== next)
				status.textContent = next;
			const traceContainer = el.querySelector(".dap-trace");
			if (traceContainer !== null) renderTrace(traceContainer, entry.trace);
			const fill = el.querySelector(".dap-fill");
			if (fill !== null) {
				const width = `${Math.min(100, Math.max(0, entry.progress ?? 0))}%`;
				if (fill.style.width !== width) fill.style.width = width;
			}
			return;
		}

		if (entry.kind === "subagent") {
			const traceContainer = el.querySelector(".dap-subtrace");
			if (traceContainer !== null)
				renderTrace(traceContainer, entry.trace, { lastOnly: true });
			return;
		}

		const note = el.querySelector(".dap-note");
		if (note !== null) {
			const next =
				entry.kind === "awaiting"
					? entry.pendingText === "需要响应"
						? "本轮已完成，等待你处理"
						: `等待你的回应（${entry.pendingText}）`
					: entry.kind === "recent"
						? fmtRecentTime(entry.updatedAt)
						: "";
			if (note.textContent !== next) note.textContent = next;
		}

		const lastact = el.querySelector(".dap-lastact");
		if (lastact !== null) {
			// .dap-lastact 仅存在于最近卡骨架，lastActivity 恒为 string|null。
			const text = entry.lastActivity ?? "";
			if (lastact.textContent !== text) lastact.textContent = text;
			if (text === "") lastact.setAttribute("hidden", "");
			else lastact.removeAttribute("hidden");
		}
	}

	// ---- 轮内状态订阅生命周期（R-01-009、R-02-004） ----
	function syncLiveness(runningIds) {
		for (const id of runningIds) {
			if (livenessById.has(id)) continue;
			let session = null;
			try {
				session = sessions?.binding?.(id)?.session ?? null;
			} catch {
				session = null;
			}
			if (session === null) continue; // 下次渲染再试
			let unsubscribe = null;
			unsubscribe = session.subscribe(() => {
				if (disposed) return;
				const live = livenessFromSnapshot(getSessionSnapshot(session));
				livenessById.set(id, { unsubscribe, liveness: live });
				queueSync();
			});
			livenessById.set(id, {
				unsubscribe,
				liveness: livenessFromSnapshot(getSessionSnapshot(session)),
			});
		}
		for (const [id, rec] of livenessById) {
			if (runningIds.has(id)) continue;
			try {
				rec.unsubscribe?.();
			} catch {}
			livenessById.delete(id);
		}
		// 运行卡时钟：有运行中会话才启动，无则停。
		if (runningIds.size > 0 && clockTimer === null) {
			clockTimer = setInterval(() => queueSync(), CLOCK_MS);
		} else if (runningIds.size === 0 && clockTimer !== null) {
			clearInterval(clockTimer);
			clockTimer = null;
		}
	}

	function getSessionSnapshot(session) {
		try {
			return session?.getSnapshot?.() ?? null;
		} catch {
			return null;
		}
	}

	/** 保证 list 内存在/移除空态节点（R-01-001/AC-02）。 */
	function ensureEmpty(list, show, text) {
		let node = list.querySelector(".dap-empty");
		if (show) {
			if (node === null) {
				node = makeEl("div", "dap-empty");
				list.appendChild(node);
			}
			if (node.textContent !== text) node.textContent = text;
		} else if (node !== null) {
			node.remove();
		}
	}

	/** 渲染某一张卡片进指定列表容器（活动/历史通用）。 */
	function renderCardIntoList(list, entry, reuseMap) {
		let rec = reuseMap.get(entry.id);
		if (rec === undefined) {
			const el = document.createElement("div");
			el.className = CARD_CLASS;
			rec = { el, kind: null };
			reuseMap.set(entry.id, rec);
		}
		if (rec.kind !== entry.kind) {
			rec.el.dataset.kind = entry.kind;
			rec.el.dataset.sessionId = entry.id;
			rec.el.dataset.depth = String(entry.depth ?? 0);
			rec.el.setAttribute("role", "button");
			rec.el.tabIndex = 0;
			rec.el.replaceChildren(...cardChildren(entry.kind));
			rec.kind = entry.kind;
		}
		rec.el.style.marginLeft = `${(entry.depth ?? 0) * INDENT_PX}px`;
		rec.el.toggleAttribute("data-current", entry.isCurrent);
		rec.el.toggleAttribute("data-awaiting", entry.kind === "awaiting");
		// 流式阶段标记：驱动进度条向右滚动的条纹动画（answer-pet 对齐，R-01-009）。
		rec.el.toggleAttribute("data-streaming", entry.streaming === true);
		rec.el.setAttribute(
			"aria-label",
			`${entry.workspaceTitle ? entry.workspaceTitle + " - " : ""}${entry.title}${
				entry.pendingText ? "，" + entry.pendingText : ""
			}`,
		);
		renderCardInto(rec.el, entry);
		list.appendChild(rec.el);
		return true;
	}

	function pruneCards(reuseMap, alive) {
		for (const [id, rec] of reuseMap) {
			if (alive.has(id)) continue;
			rec.el.remove();
			reuseMap.delete(id);
		}
	}

	function render() {
		const pane = ensurePane();
		if (pane === null) return;
		applyLayout();
		const activeList = pane.querySelector(`.${LIST_CLASS}`);
		const recentSection = pane.querySelector(`.${RECENT_CLASS}`);
		if (activeList === null || recentSection === null) return;

		const snapshot = getSnapshot(sessions, "list");
		const workspaceItems = getSnapshot(workspaces, "list")?.items ?? [];
		const now = Date.now();

		const active = buildEntries(snapshot, workspaceItems);
		// 轮内订阅仅对"运行中"会话建立（主会话 + 运行中的子代理），保持在运行中的订阅
		// 数量 == 运行中会话数量（R-02-004/AC-01）；暂停等待的子代理只显示标题。
		const runLikeIds = new Set(
			active
				.filter((entry) => {
					if (entry.kind === "running") return true;
					if (entry.kind === "subagent")
						return snapshot?.byId?.[entry.id]?.running === true;
					return false;
				})
				.map((entry) => entry.id),
		);
		syncLiveness(runLikeIds);
		for (const entry of active) {
			const live = livenessById.get(entry.id)?.liveness ?? null;
			if (entry.kind === "running") {
				const elapsedMs =
					live?.startTime != null
						? Math.max(0, Date.now() - live.startTime)
						: null;
				// token/速率取自 sessions.list 条目的投影（tokenUsage/sessionStats），
				// 复用既有列表订阅，无新增轮询（R-01-009/AC-05、R-02-004/AC-02）。
				const projection = snapshot?.byId?.[entry.id]?.projectionValues;
				const outputTokens = projection?.tokenUsage?.outputTokens ?? null;
				const stats = projection?.sessionStats;
				const rateTokS =
					stats && Number.isFinite(stats.decodeMs) && stats.decodeMs > 0
						? stats.decodeTokens / (stats.decodeMs / 1000)
						: null;
				entry.status = statusLine({
					runningTool: live?.runningTool ?? null,
					streaming: live?.streaming ?? false,
					elapsedMs,
					outputTokens,
					rateTokS,
				});
				// 流式阶段标记驱动 data-streaming（进度条条纹动画）；工具调用期间视作
				// 非流式，与 answer-pet 的 phase==='stream' 判定一致。
				entry.streaming = !live?.runningTool && live?.streaming === true;
				// 阶段进度：progressOf 估计 + 按回合单调下限（tool 阶段冻结、回合切换重置）。
				// tokenUsage 是跨回合累计口径，因此进度填充用「本回合增量」——
				// 回合切换时记录 token 基线，新回合从基线差分，进度才会真正回落重置
				// （R-01-009/AC-06）。
				const prev = progressFloor.get(entry.id);
				const turn = live?.turn ?? null;
				const sameTurn = prev !== undefined && prev.turn === turn;
				// 累计口径必须先经 Number.isFinite 净化：NaN 会污染 tokensBase、把
				// 本回合进度锁死于 ~10%（progressOf 内部虽兜底，但基线会被固化）。
				const cumulative =
					Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : 0;
				const tokensBase = sameTurn ? prev.tokensBase : cumulative;
				const turnTokens =
					Math.max(0, cumulative - Math.min(tokensBase, cumulative));
				const floor = sameTurn ? prev.floor : 0;
				let progress = progressOf({
					phase: live?.runningTool ? "tool" : live?.streaming ? "stream" : "think",
					outputTokens: turnTokens,
					elapsedMs: elapsedMs ?? 0,
				});
				if (progress !== null) {
					progress = Math.max(floor, progress);
					progressFloor.set(entry.id, { turn, floor: progress, tokensBase });
				} else {
					// tool 阶段冻结（progressOf 返回 null）：有历史下限则沿用；首观测即
					// 工具阶段（中途接入、无从回放思考爬升）以思考基线兜底防 0，与
					// answer-pet 的冻结语义一致（其 tool 冻结值 ≥ 本回合思考基线）。
					progress = sameTurn ? prev.floor : PROGRESS_THINK_BASE;
					progressFloor.set(entry.id, { turn, floor: progress, tokensBase });
				}
				entry.progress = progress;
			}
			if (entry.kind === "running" || entry.kind === "subagent") {
				entry.trace = buildTrace({
					nodes: live?.nodes ?? [],
					runningTool: live?.runningTool ?? null,
					runningArgs: live?.runningArgs ?? null,
					streaming: live?.streaming ?? false,
					reasoning: live?.reasoning ?? false,
					turnStartTime: live?.startTime ?? null,
					now: Date.now(),
				});
			}
		}
		// 清理已不在运行/子代理集的进度下限，避免残留。
		for (const id of progressFloor.keys())
			if (!runLikeIds.has(id)) progressFloor.delete(id);
		const recent = buildRecent(snapshot, workspaceItems, now);

		const sig = cardSignature([...active, ...recent]);
		if (sig === lastSig) return;
		lastSig = sig;

		const aliveActive = new Set();
		for (const entry of active)
			if (renderCardIntoList(activeList, entry, cardsById))
				aliveActive.add(entry.id);
		pruneCards(cardsById, aliveActive);
		ensureEmpty(activeList, active.length === 0, "暂无活动会话");

		const aliveRecent = new Set();
		for (const entry of recent)
			if (renderCardIntoList(recentSection, entry, recentCardsById))
				aliveRecent.add(entry.id);
		pruneCards(recentCardsById, aliveRecent);
		if (recentSection !== null) recentSection.hidden = recent.length === 0;

		// 计数与折叠
		const count = pane.querySelector(".dap-count");
		const railCount = pane.querySelector(".dap-rail-count");
		const hasAwaiting = active.some((entry) => entry.kind === "awaiting");
		for (const el of [count, railCount])
			if (el !== null) {
				el.textContent = String(active.length);
				el.toggleAttribute("data-awaiting", hasAwaiting);
			}
		const toggleCount = toggle.querySelector(".dap-toggle-count");
		if (toggleCount !== null) {
			toggleCount.textContent = String(active.length);
			toggle.toggleAttribute("data-awaiting", hasAwaiting);
		}
		pane.toggleAttribute("data-collapsed", collapsed ? "true" : "false");
	}

	// ---- 打开会话（复用 companion 验证过的：list 未就绪时 refresh + 重试） ----
	const MAX_OPEN_ATTEMPTS = 60;
	function sessionsListHas(sessionId) {
		const snap = getSnapshot(sessions, "list");
		return (
			snap !== null &&
			Array.isArray(snap.ids) &&
			snap.ids.includes(String(sessionId))
		);
	}
	function cardElFor(sessionId) {
		return document.querySelector(
			`[${PANE_ATTR}] [data-session-id="${String(sessionId)
				.replace(/"/g, '\\"')
				.replace(/\\/g, "\\\\")}"]`,
		);
	}
	function attemptOpen(sessionId, attempt) {
		const el = cardElFor(sessionId);
		if (el !== null) el.setAttribute("data-opening", "");

		if (!sessionsListHas(sessionId)) {
			if (attempt < MAX_OPEN_ATTEMPTS) {
				try {
					sessions.refresh?.();
				} catch {}
				setTimeout(() => attemptOpen(sessionId, attempt + 1), 500);
				return;
			}
			el?.removeAttribute("data-opening");
			return;
		}
		try {
			sessions.open(sessionId);
			el?.removeAttribute("data-opening");
		} catch (error) {
			if (attempt < MAX_OPEN_ATTEMPTS) {
				try {
					sessions.refresh?.();
				} catch {}
				setTimeout(() => attemptOpen(sessionId, attempt + 1), 500);
			} else {
				el?.removeAttribute("data-opening");
			}
		}
	}
	/** 纯几何命中 + capture 阶段点击，规避覆盖层/stopPropagation。 */
	function sessionIdAtPoint(x, y) {
		if (typeof x !== "number" || typeof y !== "number") return undefined;
		const cards = Array.from(
			document.querySelectorAll(`[${PANE_ATTR}] [data-session-id]`),
		);
		for (const card of cards) {
			const r = card.getBoundingClientRect();
			if (r.left <= x && x <= r.right && r.top <= y && y <= r.bottom)
				return card.dataset.sessionId;
		}
		return undefined;
	}
	function openCard(event) {
		// 守卫：只处理落在窗格内部的点击，任何主会话区/外壳点击都不拦截。
		if (!event.target?.closest?.(`[${PANE_ATTR}]`)) return;
		const sessionId =
			sessionIdAtPoint(event.clientX, event.clientY) ??
			event.target
				?.closest?.(`[${PANE_ATTR}] [data-session-id]`)
				?.dataset?.sessionId;
		if (sessionId === undefined) return;
		if (typeof sessions?.open !== "function") return;
		event.preventDefault();
		event.stopPropagation();
		attemptOpen(sessionId, 0);
	}
	function onKeyDown(event) {
		if (event.key !== "Enter" && event.key !== " ") return;
		const card = event.target?.closest?.(`[${PANE_ATTR}] [data-session-id]`);
		if (card?.dataset.sessionId === undefined) return;
		event.preventDefault();
		attemptOpen(card.dataset.sessionId, 0);
	}

	// ---- 观察者：找到 frame 后聚焦其子树；外壳重挂载时窗格被清即重插 ----
	const bodyObserver = new MutationObserver(queueSync);
	bodyObserver.observe(document.body, { childList: true, subtree: true });
	let frameObserver = null;
	let frameProbeTimer = null;
	function installFrameObserver() {
		if (frameObserver !== null) return;
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		if (seat === null || seat.parentElement === null) return;
		bodyObserver.disconnect();
		frameObserver = new MutationObserver(queueSync);
		frameObserver.observe(seat.parentElement, {
			childList: true,
			subtree: true,
		});
		if (frameProbeTimer !== null) {
			clearInterval(frameProbeTimer);
			frameProbeTimer = null;
		}
	}
	installFrameObserver();
	if (frameObserver === null) frameProbeTimer = setInterval(installFrameObserver, 500);

	// ---- 交互：移动端抽屉开关、弹窗收起、桌面折叠 ----
	function togglePane(open) {
		const pane = document.querySelector(`[${PANE_ATTR}]`);
		if (pane === null) return;
		pane.setAttribute("data-open", open ? "true" : "false");
	}
	function onToggleClick() {
		const pane = document.querySelector(`[${PANE_ATTR}]`);
		const open = pane?.getAttribute("data-open") !== "true";
		togglePane(open);
	}
	function onPaneClick(event) {
		const inPane = event.target?.closest?.(`[${PANE_ATTR}]`) !== null;
		if (inPane && event.target?.closest?.(".dap-close") !== null) {
			togglePane(false);
			return;
		}
		if (inPane && event.target?.closest?.(".dap-collapse") !== null) {
			collapsed = !collapsed;
			const pane = document.querySelector(`[${PANE_ATTR}]`);
			pane?.setAttribute("data-collapsed", collapsed ? "true" : "false");
			return;
		}
		if (inPane && event.target?.closest?.(".dap-rail") !== null) {
			collapsed = false;
			const pane = document.querySelector(`[${PANE_ATTR}]`);
			pane?.setAttribute("data-collapsed", "false");
		}
	}
	toggle.addEventListener("click", onToggleClick);
	document.addEventListener("click", onPaneClick);
	const onResize = () => queueSync();
	desktopQuery.addEventListener("change", onResize);

	installServiceSubscriptions();
	if (sessions === null || workspaces === null) {
		serviceTimer = setInterval(installServiceSubscriptions, 250);
	}
	document.addEventListener("click", openCard, true); // capture
	document.addEventListener("keydown", onKeyDown);
	queueSync();

	return () => {
		disposed = true;
		sessionUnsubscribe?.();
		workspaceUnsubscribe?.();
		if (serviceTimer !== null) clearInterval(serviceTimer);
		if (clockTimer !== null) clearInterval(clockTimer);
		for (const [, rec] of livenessById) {
			try {
				rec.unsubscribe?.();
			} catch {}
		}
		livenessById.clear();
		progressFloor.clear();
		bodyObserver.disconnect();
		frameObserver?.disconnect();
		if (frameProbeTimer !== null) clearInterval(frameProbeTimer);
		toggle.removeEventListener("click", onToggleClick);
		document.removeEventListener("click", onPaneClick);
		desktopQuery.removeEventListener("change", onResize);
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		if (seat !== null && seat.parentElement !== null) {
			const center = seat.parentElement;
			center.style.flexDirection = "";
			center.style.alignItems = "";
			const flex = conversationFlexItem(center);
			if (flex !== null) {
				flex.style.flex = "";
				flex.style.minWidth = "";
			}
		}
		document.removeEventListener("click", openCard, true);
		document.removeEventListener("keydown", onKeyDown);
		toggle.remove();
		style.remove();
	};
}

module.exports = { name, inject, apply };
