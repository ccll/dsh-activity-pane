// dsh-activity-pane 浏览器运行时。
//
// 挂载策略：把窗格作为 AppFrame 中 `conversation` 槽座的前置兄弟列插入
// （`#root [data-slot="conversation"] || .parentElement` 即 flex 行），让外壳的
// 让步链挤压中间栏；窄屏（<=767px）转为固定抽屉 + 浮动开关按钮。
//
// 数据来源：DSH 原生 `sessions` / `workspaces` 客户端服务（推送式快照）+ native
// `sessions.history` / `sessions.models` 冷会话读取 + 运行中会话的原生订阅
//（binding().session），不依赖任何第三方插件数据路由，也不做状态轮询。

const name = "dsh-activity-pane";
const inject = ["connection", "sessions", "workspaces"];

const CONVERSATION_SELECTOR = "#root [data-slot=\"conversation\"]";
const PANE_ATTR = "data-dsh-activity-pane";
const PANE_CLASS = "dap-pane";
const LIST_CLASS = "dap-list";
const RECENT_CLASS = "dap-recent";
const CARD_CLASS = "dap-card";
const STYLE_ID = "dsh-activity-pane-style";
const INSTANCE_KEY = "__dshActivityPaneCleanup";
/** 拖拽调宽的 localStorage 持久化键（R-01-015/AC-04）。 */
const WIDTH_STORAGE_KEY = "dsh-activity-pane:width";
const COLLAPSED_WIDTH = 34;
// 缩进槽宽：与连接线 CSS 几何耦合（left:-8px = INDENT_PX/2 缩进槽中线，
// top:-6px/bottom:-2px 对应 .dap-list 的 gap:6px），改任一数值须三处同步；
// scripts/check.mjs 有钉住断言。
const INDENT_PX = 16;
const MOBILE_BREAKPOINT = "767px";
/** 运行卡时钟：只要存在运行中会话，就以该周期刷新时长显示。 */
const CLOCK_MS = 1000;
/** 冷会话 history 深翻页上限：尾页取不到最近用户/agent 消息时向前翻的最多页数。 */
const HISTORY_MAX_PAGES = 3;
/** 冷数据读取并发池上限：慢网下避免几十张卡片的 models/history 一次性挤占通道。 */
const LOAD_CONCURRENCY = 3;

const CSS = `
[data-dsh-activity-pane] {
  --dap-width: ${PANE_WIDTH_DEFAULT}px;
  flex: 0 0 var(--dap-width);
  min-width: 0;
  min-height: 0;
  position: relative;
  z-index: 5;
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
/* 标题行整体即收起控件，两端断点一致（R-01-011/AC-03、R-01-008/AC-02）：指针与悬停/聚焦反馈。 */
[data-dsh-activity-pane] .dap-header { cursor: pointer; }
[data-dsh-activity-pane] .dap-header:hover,
[data-dsh-activity-pane] .dap-header:focus-visible {
  background: color-mix(in srgb, currentColor 8%, transparent);
}
[data-dsh-activity-pane] .dap-header:focus-visible { outline: none; }
/* 方向符号：标题行的一部分而非独立按钮，两端断点一致呈现（R-01-011/AC-03、R-01-008/AC-02）。 */
[data-dsh-activity-pane] .dap-collapse-hint {
  margin-left: auto;
  color: color-mix(in srgb, currentColor 45%, transparent);
  font-size: 13px;
}
[data-dsh-activity-pane] .dap-count {
  flex: none;
  font-size: 10px;
  line-height: 16px;
  font-weight: 600;
  color: color-mix(in srgb, currentColor 88%, transparent);
  background: color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 999px;
  /* 常驻透明边框：等待态仅换色，避免边框出现/消失引起尺寸跳动。 */
  border: 1px solid transparent;
  padding: 0 7px;
}
[data-dsh-activity-pane] .dap-count[data-awaiting] {
  /* 底色/透明度/边框与等待卡完全一致（R-01-002/AC-06）；脉冲走亮度呼吸而非整体
     不透明度——半透明会让底色透进列头背景；周期由 --dap-await-period 驱动（AC-07）。 */
  background: rgba(35, 31, 25, 0.97);
  border-color: color-mix(in srgb, #e8a33d 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent);
  animation: dap-await-pulse var(--dap-await-period, 1.6s) ease-in-out infinite;
}
@keyframes dap-await-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }
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
/* 滚动条仅在滚动时显示（R-01-004/AC-03，与外壳侧栏一致）：thumb 默认透明，滚动中
   经 data-scrolling 显示。Firefox 路径必须在 @supports 门内——非 auto 的
   scrollbar-color 会让 Chromium 丢弃该元素的 ::-webkit-scrollbar 规则。 */
[data-dsh-activity-pane] .dap-scroll::-webkit-scrollbar-thumb {
  background: transparent;
}
[data-dsh-activity-pane] .dap-scroll[data-scrolling]::-webkit-scrollbar-thumb {
  background: var(--dsh-scrollbar-thumb, color-mix(in srgb, currentColor 25%, transparent));
}
@supports not selector(::-webkit-scrollbar) {
  [data-dsh-activity-pane] .dap-scroll { scrollbar-color: transparent transparent; }
  [data-dsh-activity-pane] .dap-scroll[data-scrolling] {
    scrollbar-color: var(--dsh-scrollbar-thumb, color-mix(in srgb, currentColor 25%, transparent)) transparent;
  }
}
[data-dsh-activity-pane] .dap-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px;
  /* 轨道层的定位包含块（轨道绝对定位在列表坐标系内） */
  position: relative;
}
/* 最近历史区：同一滚动区内的块段；整段可隐藏。 */
[data-dsh-activity-pane] .dap-recent {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding: 10px 8px 0;
  margin-top: 10px;
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
/* 折叠：仅桌面生效；窄条 + 竖排标题与计数（R-01-011/AC-04）。 */
[data-dsh-activity-pane] .dap-rail {
  display: none;
  /* 窄条整体（含下方空白）均为展开命中区（R-01-011/AC-04）：撑满窗格高度、内容顶对齐。 */
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 10px 0 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
}
[data-dsh-activity-pane] .dap-rail-count {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0 5px;
  text-align: center;
  line-height: 20px;
  font-size: 10px;
  font-weight: 700;
  background: color-mix(in srgb, currentColor 16%, transparent);
}
[data-dsh-activity-pane] .dap-rail-title {
  writing-mode: vertical-rl;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, currentColor 60%, transparent);
}
[data-dsh-activity-pane] .dap-rail-count[data-awaiting] {
  background: rgba(35, 31, 25, 0.97);
  border-color: color-mix(in srgb, #e8a33d 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent);
  animation: dap-await-pulse var(--dap-await-period, 1.6s) ease-in-out infinite;
}
/* 桌面拖拽调宽手柄（R-01-015）：右缘 6px 命中区，拖拽实时写入 --dap-width；
   折叠窄条与移动端抽屉不提供拖拽（下方两处媒体查询隐藏）。 */
[data-dsh-activity-pane] .dap-resize {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
  z-index: 6;
}
[data-dsh-activity-pane] .dap-resize:hover,
[data-dsh-activity-pane] .dap-resize[data-dragging] {
  background: color-mix(in srgb, currentColor 18%, transparent);
}
/* 桌面：窗格作为中间列内的真实 flex 行元素参与布局——中间列被置为行方向，
   窗格固定宽、会话区弹性收缩，整个会话内容被真实挤到右边；折叠时收窄为窄条。 */
@media (min-width: 768px) {
  [data-dsh-activity-pane][data-collapsed="true"] { flex-basis: ${COLLAPSED_WIDTH}px; }
  [data-dsh-activity-pane][data-collapsed="true"] .dap-header,
  [data-dsh-activity-pane][data-collapsed="true"] .dap-scroll { display: none; }
  [data-dsh-activity-pane][data-collapsed="true"] .dap-resize { display: none; }
  [data-dsh-activity-pane][data-collapsed="true"] .dap-rail { display: flex; cursor: pointer; }
  /* 与展开态标题行对等的可点反馈（R-01-011/AC-04）：悬停/聚焦高亮。 */
  [data-dsh-activity-pane][data-collapsed="true"] .dap-rail:hover,
  [data-dsh-activity-pane][data-collapsed="true"] .dap-rail:focus-visible {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  [data-dsh-activity-pane][data-collapsed="true"] .dap-rail:focus-visible { outline: none; }
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
  [data-dsh-activity-pane] .dap-resize { display: none; }
}
/* 卡片视觉沿用 answer-pet 的多会话卡片设计（MIT 参考，见 README）。 */
[data-dsh-activity-pane] .dap-card {
  position: relative;
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
/* 子代理层级连接线（R-01-003/AC-04）：竖轨与横线全部由轨道层整体绘制——
   syncTracks 测量各卡片浮点矩形，trackBoxes 统一取整到 CSS 像素后写入：
   每个母会话一条连续竖轨 .dap-conn-track（母会话底缘 → 末级子卡中心，
   含收口行），每个子卡一条横线 .dap-conn-stub（竖轨右缘 → 子卡左缘）。
   不分段拼接（接缝在随机亚像素相位下断口与重叠并存），也不让 CSS 按小数
   坐标定位任何线段（抗锯齿随机摊薄导致粗细不一、端点方头错位）；统一取整
   使所有线段同相位，且轨道层整体 transform 对齐设备像素网格（层原点随窗
   口/滚动停在任意小数相位，不对齐则 1px 线段粗细不稳），滚动时经 rAF 重
   对齐（T-033）。 */
[data-dsh-activity-pane] .dap-tracks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
[data-dsh-activity-pane] .dap-conn-track {
  position: absolute;
  width: 1px;
  background: color-mix(in srgb, currentColor 24%, transparent);
  pointer-events: none;
}
[data-dsh-activity-pane] .dap-conn-stub {
  position: absolute;
  height: 1px;
  background: color-mix(in srgb, currentColor 24%, transparent);
  pointer-events: none;
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
[data-dsh-activity-pane] .dap-card[data-kind="parent"] .dap-dot {
  background: #8a94a3;
  box-shadow: none;
  animation: none;
}
[data-dsh-activity-pane] .dap-card[data-kind="recent"] {
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(22, 24, 29, 0.9);
  border-color: transparent;
  opacity: 0.8;
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
/* 所有卡片统一提供可见的悬停反馈；不覆盖当前/等待态自身的颜色语义。 */
[data-dsh-activity-pane] .dap-card:hover {
  filter: brightness(1.12);
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
/* 最近历史卡标题降为常规字重：历史区不抢占视觉强调（R-01-013/AC-09）。 */
[data-dsh-activity-pane] .dap-card[data-kind="recent"] .dap-title {
  font-weight: 400;
}
/* 等待标识徽标改用主题协调的柔和底（与 workspace chip 同系）：醒目性由等待卡
   描边与计数徽标红色脉冲变体承载（R-01-002/AC-04）。 */
[data-dsh-activity-pane] .dap-badge {
  flex: none; font-size: 10px; line-height: 14px; font-weight: 600;
  color: color-mix(in srgb, currentColor 88%, transparent);
  background: color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 999px; padding: 0 7px;
}
/* 工作区徽标「图标+文本」双段：文件夹图标与左边栏工作区条目同源（R-01-003/AC-06）；
   名称字号不低于 10.5px（AC-07），行高保持 14px 以维持胶囊与卡片高度。 */
[data-dsh-activity-pane] .dap-workspace {
  width: fit-content; max-width: 100%; display: flex; align-items: center; gap: 3px;
  overflow: hidden;
  font-size: 10.5px; line-height: 14px;
  color: color-mix(in srgb, currentColor 90%, transparent);
  background: color-mix(in srgb, currentColor 11%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 999px; padding: 0 7px;
}
[data-dsh-activity-pane] .dap-workspace-icon { flex: none; display: inline-flex; }
[data-dsh-activity-pane] .dap-workspace-icon svg { display: block; }
[data-dsh-activity-pane] .dap-workspace-text {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-dsh-activity-pane] .dap-workspace[hidden] { display: none; }
[data-dsh-activity-pane] .dap-card-head {
  display: flex; align-items: center; gap: 6px; min-width: 0;
}
[data-dsh-activity-pane] .dap-card-head .dap-workspace {
  flex: 0 1 auto; min-width: 0;
}
[data-dsh-activity-pane] .dap-model {
  flex: 0 1 auto; max-width: 58%; margin-left: auto;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: color-mix(in srgb, currentColor 72%, transparent);
  font-size: 9.5px; line-height: 14px; text-align: right;
}
[data-dsh-activity-pane] .dap-model:empty { display: none; }
[data-dsh-activity-pane] .dap-note {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; line-height: 15px;
  color: color-mix(in srgb, currentColor 62%, transparent);
}
/* 运行卡富化（对齐 answer-pet 卡片；MIT 参考，见 README）。 */
[data-dsh-activity-pane] .dap-pct {
  flex: none; font-size: 12px; line-height: 15px; font-weight: 700;
  color: #9fe8c4; font-variant-numeric: tabular-nums;
}
[data-dsh-activity-pane] .dap-token-stats {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  min-width: 0;
  font-size: 10px; line-height: 14px; color: #8f9aaa; font-variant-numeric: tabular-nums;
}
/* 左列超长时省略号截断；时长 flex:none 恒贴最右（R-01-009/AC-05）。 */
[data-dsh-activity-pane] .dap-token-main {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-dsh-activity-pane] .dap-token-time { flex: none; }
[data-dsh-activity-pane] .dap-token-stats[hidden] { display: none; }
[data-dsh-activity-pane] .dap-history-line {
  display: flex; align-items: center; gap: 4px; height: 15px;
  min-width: 0; overflow: hidden; white-space: nowrap;
  font-size: 10.5px; line-height: 15px; color: color-mix(in srgb, currentColor 68%, transparent);
}
[data-dsh-activity-pane] .dap-history-line[data-role="agent"] { color: color-mix(in srgb, currentColor 54%, transparent); }
[data-dsh-activity-pane] .dap-history-icon {
  flex: none; width: 10px; height: 10px; display: inline-flex;
  align-items: center; justify-content: center;
}
[data-dsh-activity-pane] .dap-history-icon svg { display: block; width: 10px; height: 10px; }
[data-dsh-activity-pane] .dap-history-text {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 动作时间线：纵向竖线串起圆点（对齐 answer-pet 的 .ap-session-trace，并修正几何细节——
   轨道列从卡片内容左边起步，和标题圆点/状态行/进度条共用左边界；轨道下放到每个
   节点项自身。圆点盒子与 7px 标题圆点完全同盒（7px、left:0、圆心 x=3.5）：分数位
   原点下 Chrome 对 5px 与 7px 圆盒的吸附取整相位不同，渲染质心可差出 0.5 设备像素，
   同盒才能保证跨 DPR 渲染对齐；视觉上的 5px 圆点烘进径向渐变（实心核 0–2.5px），
   半透明外环由渐变内半（2.5–3.5px）与 1px box-shadow 外半（3.5–4.5px）拼成，
   整体视觉几何不变。1px 竖线 left:3px（圆心 x=3.5），与圆点严格同圆心。每项一段
   竖线从项顶（容器顶）贯穿，使线穿过首个节点圆点并向上引出（表示更早历史被省略）、
   末项不画竖线（终点没入最新动作圆点内部不外露）；圆点高处盖线、位于内容区内不被
   子代理卡 overflow 裁切。 */
[data-dsh-activity-pane] .dap-trace {
  display: flex; flex-direction: column; gap: 3px;
  margin: 1px 0 2px;
  min-width: 0;
}
[data-dsh-activity-pane] .dap-trace:empty { display: none; }
/* 指令槽位（R-01-018）：与用户消息行同款排版，左对齐卡片左缘、无缩进；
 *  底部 padding 2px + .dap-trace 顶部 margin 1px = 3px，与时间线行间 gap 一致。 */
[data-dsh-activity-pane] .dap-slot {
  display: flex; align-items: center; column-gap: 7px;
  min-width: 0; padding: 1px 14px 2px 0;   /* 左缘贴卡片无缩进；底部空隙与行间一致 */
  color: #c7ced9; font-size: 10px; line-height: 14px;
}
/* 用户指令消息虚线框（R-01-018 验收）：槽位整体；时间线用户行框其内容
 *  main（不含左侧轨道圆点）；outline 不占布局，行间空隙保持 3px 一致。 */
[data-dsh-activity-pane] .dap-slot,
[data-dsh-activity-pane] .dap-trace-item[data-icon="user"] .dap-trace-main {
  outline: 1px dashed rgba(126, 147, 177, .5);
  outline-offset: -1px;
}
[data-dsh-activity-pane] .dap-slot[hidden] { display: none; }
[data-dsh-activity-pane] .dap-slot-icon { width: 12px; height: 12px; flex: none; display: inline-flex; }
[data-dsh-activity-pane] .dap-slot-icon svg { display: block; width: 100%; height: 100%; }
[data-dsh-activity-pane] .dap-slot-text {
  flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
[data-dsh-activity-pane] .dap-trace-item {
  position: relative; display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 7px; min-width: 0;
  padding-left: 14px;   /* 左侧轨道：圆点与竖线共用圆心 x=3.5（对齐标题圆点） */
  color: #c7ced9; font-size: 10px; line-height: 14px;
}
[data-dsh-activity-pane] .dap-trace-item::before {
  content: ""; position: absolute; left: 0; top: 3px;
  width: 7px; height: 7px; border-radius: 50%;
  z-index: 1;           /* 圆点盖在竖线上：竖线从圆点中穿过被其遮盖 */
  background: radial-gradient(circle, #778394 0 2.5px, rgba(119, 131, 148, .14) 2.5px 3.5px, transparent 3.5px);
  box-shadow: 0 0 0 1px rgba(119, 131, 148, .14);
}
[data-dsh-activity-pane] .dap-trace-item[data-status="running"]::before {
  background: radial-gradient(circle, #65a0ff 0 2.5px, rgba(101,160,255,.16) 2.5px 3.5px, transparent 3.5px);
  box-shadow: 0 0 0 1px rgba(101,160,255,.16), 0 0 6px rgba(101,160,255,.65);
  animation: dap-pulse 1.15s ease-in-out infinite;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="done"]::before {
  background: radial-gradient(circle, #58c98f 0 2.5px, rgba(119, 131, 148, .14) 2.5px 3.5px, transparent 3.5px);
}
[data-dsh-activity-pane] .dap-trace-item[data-status="error"]::before {
  background: radial-gradient(circle, #f06a72 0 2.5px, rgba(119, 131, 148, .14) 2.5px 3.5px, transparent 3.5px);
}
[data-dsh-activity-pane] .dap-trace-item[data-status="stopped"]::before {
  background: radial-gradient(circle, #f5a524 0 2.5px, rgba(119, 131, 148, .14) 2.5px 3.5px, transparent 3.5px);
}
/* 每项一段竖线（末项不画，z-index 低于圆点）：从项顶（容器顶）贯穿本项、经圆点下方
   继续延伸到下一颗圆点顶缘 —— 线穿过首个节点圆点并向上引出（省略的历史）、终点没入
   最新动作圆点内部不外露。依赖 14px 行高 + 3px 间距；bottom 多 1px 让终点藏进
   下一颗圆点。 */
[data-dsh-activity-pane] .dap-trace-item::after {
  content: ""; position: absolute; left: 3px; top: 0; bottom: -8px;
  width: 1px; z-index: 0;
  background: rgba(126, 147, 177, .3);
}
[data-dsh-activity-pane] .dap-trace-item:last-child::after { content: none; }
[data-dsh-activity-pane] .dap-trace-icon {
   width: 12px; height: 12px; flex: none; display: inline-flex;
   align-items: center; justify-content: center; color: #a9b8cc; text-align: center;
 }
[data-dsh-activity-pane] .dap-trace-icon svg {
  display: block; width: 12px; height: 12px;
}
[data-dsh-activity-pane] .dap-trace-main {
  display: flex; align-items: center; gap: 5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-dsh-activity-pane] .dap-trace-label {
  flex: none; font-weight: 400; color: #c7ced9;
}
[data-dsh-activity-pane] .dap-trace-summary {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: #8f9aaa;
}
/* 镜像原生 ReasoningRow：钉行尾跟随时不渲染省略号（溢出在左侧行首）。 */
[data-dsh-activity-pane] .dap-trace-summary[data-follow="end"] { text-overflow: clip; }
[data-dsh-activity-pane] .dap-trace-detail {
  color: #8f9aaa;
}
[data-dsh-activity-pane] .dap-trace-separator {
  width: 2px; height: 2px; flex: none; border-radius: 50%;
  background: #778394;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="error"] .dap-trace-icon,
[data-dsh-activity-pane] .dap-trace-item[data-status="error"] .dap-trace-label,
[data-dsh-activity-pane] .dap-trace-item[data-status="error"] .dap-trace-summary,
[data-dsh-activity-pane] .dap-trace-item[data-status="error"] .dap-trace-separator {
   color: #f06a72;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="error"] .dap-trace-separator {
   background: currentColor;
}
/* 子代理：同一节点项几何（轨道/圆点/竖线在项内自绘）；去掉容器级 overflow/padding/
   border，避免把左侧圆点裁掉。文本截断由 .dap-trace-main 自处理。 */
[data-dsh-activity-pane] .dap-subtrace {
  min-width: 0;
  font-size: 10px; line-height: 14px;
  color: color-mix(in srgb, currentColor 72%, transparent);
  margin: 1px 0 0;
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
/* 活动层级上下文卡（parent）：不确定态进度条——满宽轨道内条纹滚动动画、
   无百分比文本，表示仍有活动后代在工作（R-01-016/AC-03）。 */
[data-dsh-activity-pane] .dap-card[data-kind="parent"] .dap-fill {
  width: 100%;
  background: repeating-linear-gradient(90deg, #58c98f 0 10px, #3fbf86 10px 20px);
  background-size: 200% 100%;
  animation: dap-stripes 0.8s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  /* answer-pet 保留状态脉冲/流式条纹；仅关闭宽度过渡，避免状态反馈消失。 */
  [data-dsh-activity-pane] .dap-fill { transition: none; }
}
[data-dsh-activity-pane] .dap-empty {
  padding: 14px 12px; font-size: 12px; text-align: center;
  color: color-mix(in srgb, currentColor 45%, transparent);
}
[data-dsh-activity-pane] .dap-empty[data-mode="loading"] {
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
/* 加载指示：列表/卡片字段在途时的活动图标（R-01-014）。 */
[data-dsh-activity-pane] .dap-spinner {
  width: 10px; height: 10px; flex: none; border-radius: 50%;
  border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: color-mix(in srgb, currentColor 85%, transparent);
  animation: dap-spin 0.8s linear infinite;
  box-sizing: border-box;
  display: inline-block;
}
@keyframes dap-spin { to { transform: rotate(360deg); } }
[data-dsh-activity-pane] .dap-model .dap-spinner,
[data-dsh-activity-pane] .dap-history-line .dap-spinner {
  width: 8px; height: 8px; border-width: 1.5px;
}
/* 移动端浮动开关按钮：仅在窄屏显示（桌面隐藏）。固定于会话头部左上角、
   原生左边栏切换按钮（28px @ left:8px; top:12px）右侧（R-01-008/AC-04）。 */
.dap-toggle {
  position: fixed; top: 12px; left: 44px; z-index: 2147482991;
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
  border: 1px solid transparent;
  background: color-mix(in srgb, currentColor 16%, transparent);
  padding: 0 5px; font-size: 10px; font-weight: 700;
}
.dap-toggle[data-awaiting] .dap-toggle-count {
  background: rgba(35, 31, 25, 0.97);
  border-color: color-mix(in srgb, #e8a33d 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent);
  animation: dap-await-pulse var(--dap-await-period, 1.6s) ease-in-out infinite;
}
/* 移动端抽屉透明遮罩：抽屉打开时铺满视口、点击收起抽屉（R-01-008/AC-03）。
   完全透明不占布局；z-index 介于主会话与抽屉（2147482990）之间；抽屉打开期间
   浮动开关隐藏（见 .dap-toggle[data-drawer-open]，R-01-008/AC-05），关闭由抽屉
   头部 × 与遮罩承担；桌面断点外由媒体查询保持隐藏。 */
.dap-backdrop {
  position: fixed; inset: 0;
  z-index: 2147482989;
  background: transparent;
  display: none;
}
/* 活动区→历史区迁移动画（R-01-010/AC-07）：旧卡克隆 ghost 挂载于窗格元素内
   （卡片样式经 [data-dsh-activity-pane] 作用域自然生效），以 absolute 覆盖层从原矩形
   FLIP 平移并形变至目标最近卡矩形，到位后再淡出、真卡同步淡入；ghost 生命周期由
   transitionend 收口，prefers-reduced-motion 时 JS 侧整体跳过（不创建 ghost、不加
   dap-move-in）。 */
[data-dsh-activity-pane] > .dap-move-ghost {
  position: absolute;
  z-index: 6;
  margin: 0;
  pointer-events: none;
  transition: transform 0.3s ease, width 0.3s ease, height 0.3s ease, opacity 0.1s ease 0.2s;
}
[data-dsh-activity-pane] .dap-move-in {
  animation: dap-move-in 0.3s ease;
}
@keyframes dap-move-in { from { opacity: 0; } }
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
  .dap-backdrop[data-drawer-open] { display: block; }
  .dap-toggle { display: flex; }
  .dap-toggle[data-drawer-open] { display: none; }
}
/* 浅色主题适配：外壳以 body 上 data-ds-dark-theme 属性标记深色（缺省即浅色），
   并在两个作用域下翻转整套 --dsw-alias-* 变量。本块只覆盖上文暗色专用的硬编码
   颜色（卡片底色/描边/阴影、时间线文字与轨道、进度轨道、浮动开关），深色主题下
   全部规则保持原值；状态色（绿/蓝/橙/红）与 currentColor 派生色两主题通用，不覆盖。
   ::before 状态圆点不覆盖：基色本就被各 data-status 规则接管，覆盖反而会以更高
   优先级压掉运行/完成/错误状态色。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  box-shadow: var(--dsw-shadow-lv2, 0 6px 16px rgba(0, 0, 0, 0.12));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card:hover {
  border-color: var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
  filter: brightness(0.97);
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="subagent"],
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="parent"] {
  background: var(--dsw-specific-sidebar-fill, rgb(249, 250, 251));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="recent"] {
  background: var(--dsw-specific-sidebar-fill, rgb(249, 250, 251));
  border-color: transparent;
}
/* 当前会话高亮（R-01-006/AC-01）：蓝色描边/光晕两主题同值，但浅色块必须在
   [data-kind] 覆盖之后重声明——浅色 .dap-card/:hover/[data-kind] 规则的优先级均高于
   基态 [data-current] 规则，不重声明则浅色下选中描边与光晕被顶掉。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-current] {
  border-color: color-mix(in srgb, #65a0ff 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);
}

body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="awaiting"] {
  background: var(--dsw-alias-state-warn-tertiary, rgb(254, 245, 231));
}
/* 数量徽标等待态浅色主题覆盖：底色取等待卡浅色背景别名、边框取浅色卡描边（R-01-002/AC-06）。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-count[data-awaiting],
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-rail-count[data-awaiting],
body:not([data-ds-dark-theme]) .dap-toggle[data-awaiting] .dap-toggle-count {
  background: var(--dsw-alias-state-warn-tertiary, rgb(254, 245, 231));
  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  box-shadow: none;
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-pct {
  color: var(--dsw-alias-state-success-primary, #22c55e);
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-token-stats,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-summary,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-detail,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-icon {
  color: var(--dsw-alias-label-tertiary, rgb(129, 133, 140));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-slot,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-label {
  color: var(--dsw-alias-label-secondary, rgb(97, 102, 107));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-separator {
  background: var(--dsw-alias-label-caption, rgb(173, 178, 184));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item::after {
  background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-slot,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item[data-icon="user"] .dap-trace-main {
  outline-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.22));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-track {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08));
}
body:not([data-ds-dark-theme]) .dap-toggle {
  background: var(--dsw-alias-button-floating-fill, rgba(255, 255, 255, 0.94));
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
	const timings = snap?.turnTimings;
	if (timings instanceof Map) {
		for (const timing of timings.values()) {
			if (
				timing &&
				Number.isFinite(timing.startTime) &&
				timing.endTime === undefined
			) {
				startTime = timing.startTime;
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

/** 读取持久化列宽：缺失/非法/越界值经 clampPaneWidth 归一；localStorage 不可用（隐私模式）静默回退默认（R-01-015/AC-04）。 */
function readStoredPaneWidth() {
	try {
		return clampPaneWidth(window.localStorage.getItem(WIDTH_STORAGE_KEY));
	} catch {
		return PANE_WIDTH_DEFAULT;
	}
}
/** 拖拽结束持久化列宽；localStorage 不可用时静默跳过（R-01-015/AC-04）。 */
function writeStoredPaneWidth(width) {
	try {
		window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
	} catch {}
}

function apply(ctx) {
	const previousCleanup = document[INSTANCE_KEY] ?? globalThis[INSTANCE_KEY];
	if (typeof previousCleanup === "function") previousCleanup();
	for (const node of document.querySelectorAll(
		`[${PANE_ATTR}], .dap-toggle, .dap-backdrop, .dap-move-ghost, #${STYLE_ID}`,
	))
		node.remove();
	let disposed = false;
	let sessions = null;
	let workspaces = null;
	let sessionUnsubscribe = null;
	let workspaceUnsubscribe = null;
	let clockTimer = null;
	let syncScheduled = false;
	let lastSig = "";
	let renderedPane = null;
	let boundPane = null;
	let unbindPaneControls = null;
	let collapsed = false;
	/** 当前桌面列宽：启动时从 localStorage 恢复，拖拽实时更新，重挂载后保留（R-01-015）。 */
	let paneWidth = readStoredPaneWidth();
	/** 用户最近一次激活的卡片 id；打开重试链被更新的激活意图取代即取消。 */
	let lastActivatedId = null;
	/** 响应保持（R-01-002/AC-05、R-01-010/AC-06）：主会话结束一轮后仍为当前会话期间，
	 *  保持其活动卡位置与「需要响应」呈现；易失内存态，不写回宿主、不持久化。 */
	let heldCompletedIds = new Set();
	/** 上一帧自身活动（running/awaiting）的主会话条目 id：供保持登记覆盖宿主原子帧时序。 */
	let prevActiveMainIds = [];
	/** 上一帧已提交渲染的活动区 id 集合：活动区→历史区迁移检测（R-01-010/AC-07）。 */
	let prevRenderedActiveIds = new Set();
	/** 迁移中 ghost 元素集合（含 id 索引）：同一 id 再迁移时旧 ghost 移除，卸载时统一清理。 */
	const moveGhosts = new Set();
	const moveGhostsById = new Map();
	/** 活动区卡片 id → { el, kind } 复用表。 */
	const cardsById = new Map();
	/** 历史区卡片 id → { el } 复用表。 */
	const recentCardsById = new Map();
	/** 运行中会话原生快照订阅：id → { unsubscribe, liveness, snapshot }。 */
	const livenessById = new Map();
	/** 订阅停止后保留最近快照，供 awaiting/recent 卡继续显示上下文。 */
	const sessionDetailsById = new Map();
	/** 会话跳转的单一重试链；避免重复点击叠加 refresh/timer。 */
	const openRetryStates = new Map();
	/** native cold-session model/history reads, one promise per session and no polling. */
	const modelLoads = new Map();
	const historyLoads = new Map();
	/** native session.open() requests in flight; avoid duplicate cold history reads. */
	/** 冷数据读取并发池：队列顺序即优先级（调用方已排序），逐个完成逐个重绘。 */
	const loadQueue = [];
	let loadInflight = 0;
	function pumpDetailLoads() {
		while (loadInflight < LOAD_CONCURRENCY && loadQueue.length > 0) {
			const job = loadQueue.shift();
			loadInflight += 1;
			job().finally(() => {
				loadInflight -= 1;
				pumpDetailLoads();
			});
		}
	}
	function enqueueDetailLoad(job) {
		const promise = new Promise((resolve) => {
			loadQueue.push(() => job().then(resolve, resolve));
		});
		pumpDetailLoads();
		return promise;
	}
	const sessionOpenLoads = new Map();

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
		"<span>活动</span><span class=\"dap-toggle-count\"></span>";
	document.body.appendChild(toggle);

	// 移动端抽屉透明遮罩：仅窄屏且抽屉打开时显示，点击收起抽屉（R-01-008/AC-03）。
	const backdrop = document.createElement("div");
	backdrop.className = "dap-backdrop";
	document.body.appendChild(backdrop);

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
		let changed = false;
		if (!desktopQuery.matches) {
			// 移动端：抽屉脱离文档流（fixed），不参与主会话布局；恢复外壳默认
			// 列布局，避免行方向扰动移动端主会话显示（R-01-008）。
			if (center.style.flexDirection !== "") {
				center.style.flexDirection = "";
				changed = true;
			}
			if (center.style.alignItems !== "") {
				center.style.alignItems = "";
				changed = true;
			}
			const flex = conversationFlexItem(center);
			if (flex !== null) {
				if (flex.style.flex !== "") {
					flex.style.flex = "";
					changed = true;
				}
				if (flex.style.minWidth !== "") {
					flex.style.minWidth = "";
					changed = true;
				}
			}
			if (changed) notifyLayoutChange();
			return;
		}
		if (center.style.flexDirection !== "row") {
			center.style.flexDirection = "row";
			changed = true;
		}
		if (center.style.alignItems !== "stretch") {
			center.style.alignItems = "stretch";
			changed = true;
		}
		const flex = conversationFlexItem(center);
		if (flex !== null) {
			if (flex.style.flex !== "1 1 0%") {
				flex.style.flex = "1 1 0%";
				changed = true;
			}
			if (flex.style.minWidth !== "0") {
				flex.style.minWidth = "0";
				changed = true;
			}
		}
		if (changed) notifyLayoutChange();
	}

	function queueSync() {
		if (disposed || syncScheduled) return;
		syncScheduled = true;
		schedule(() => {
			syncScheduled = false;
			if (!disposed) render();
		});
	}

	function apiValue(response) {
		return response?.result?.ok === true ? response.result.value : null;
	}

	/** 徽标等待脉冲周期写入：period 为 null 时移除自定义属性（回落 CSS 缺省）；值未变不写。 */
	function setAwaitPulsePeriod(el, period) {
		if (period === null) {
			if (el.style.getPropertyValue("--dap-await-period") !== "") el.style.removeProperty("--dap-await-period");
			return;
		}
		const next = `${period.toFixed(3)}s`;
		if (el.style.getPropertyValue("--dap-await-period") !== next) el.style.setProperty("--dap-await-period", next);
	}

	function loadNativeDetails(ids) {
		const api = ctx.get("connection")?.api?.sessions;
		if (!api) return;
		const byId = getSnapshot(sessions, "list")?.byId ?? {};
		const modelPromises = [];
		const historyPromises = [];
		for (const id of ids) {
			const detail = sessionDetailsById.get(id) ?? {};
			const liveSnapshot = livenessById.get(id)?.snapshot;
			if (liveSnapshot) detail.snapshot = liveSnapshot;
			sessionDetailsById.set(id, detail);
			const plan = detailLoadPlan({
				detail,
				isSubagent: isSubagentRow(byId[id], byId),
				snapshotReady: detail.snapshot?.openState === "open",
				historyNeeded: needsHistorySnapshot(detail.snapshot),
				modelInflight: modelLoads.has(id),
				historyInflight: historyLoads.has(id) || sessionOpenLoads.has(id),
			});
			if (plan.subagent) {
				// 子代理的 models 读取必被宿主以 agent-busy 拒绝：直接留空，不发注定失败的 RPC。
				detail.model ??= { model: "", reasoning: "" };
			} else if (plan.model && typeof api.models === "function") {
				const promise = enqueueDetailLoad(() => Promise.resolve()
					.then(() => api.models({ sessionId: id }))
					.then((response) => {
						const value = apiValue(response);
						if (!value) {
							detail.model = { model: "", reasoning: "" };
							return;
						}
						detail.models = value;
						detail.model = modelMetadata(value);
					})
					.catch((error) => {
						detail.model = { model: "", reasoning: "" };
						detail.modelError = error instanceof Error ? error.message : String(error);
					}));
				modelLoads.set(id, promise);
				// settle 即移除记账：在途判定驱动加载指示，残留会让空字段永久误报加载。
				promise.finally(() => {
					if (modelLoads.get(id) === promise) modelLoads.delete(id);
				});
				modelPromises.push(promise);
			}
			if (plan.history && typeof api.history === "function") {
				const promise = enqueueDetailLoad(() => Promise.resolve()
					.then(async () => {
						// 单池任务内串行深翻（HISTORY_MAX_PAGES 页，约 150 条消息）；
						// 找到或翻尽即止，中途失败保留已得事件。
						const { events, error } = await pagedHistoryEvents({
							fetchPage: async (beforeSeq) => apiValue(await api.history({ sessionId: id, beforeSeq, maxMessages: 50 })),
							maxPages: HISTORY_MAX_PAGES,
						});
						if (error) detail.historyError = error instanceof Error ? error.message : String(error);
						detail.history = events;
						// R-01-018：冷卡槽位源——history 内最近用户指令全文（全量行内可寻，供行内查找未命中时兜底）。
						detail.lastUser = lastUserFromEvents(events);
						// R-01-017：冷路径同样折叠分组（取全量页内事件再折成最多 4 组）。
						const derivedHistory = foldWorkGroupsWithSlot(conversationTimelineFromHistory(events, Number.MAX_SAFE_INTEGER, byId[id]?.cwd ?? ""), 4);
						detail.timeline = derivedHistory.rows;
						detail.timelineSlot = derivedHistory.slot;
						detail.previews = messagePreviews({ history: events });
					}))
				historyLoads.set(id, promise);
				promise.finally(() => {
					if (historyLoads.get(id) === promise) historyLoads.delete(id);
				});
				historyPromises.push(promise);
			} else if (detail.lastUserLoad !== true && typeof api.history === "function" && !plan.history && detail.snapshot) {
				// R-01-018 运行卡槽位源：轻量拉取最近一页事件，提取最近用户指令全文（不作为时间线主体）；
				// 失败静默降级（槽位隐藏），不再重试，避免每轮渲染重复 RPC。
				detail.lastUserLoad = true;
				const promise = enqueueDetailLoad(() => Promise.resolve()
					.then(() => api.history({ sessionId: id, maxMessages: 50 }))
					.then((response) => {
						const value = apiValue(response);
					const events = Array.isArray(value?.events) ? value.events : [];
					if (events.length > 0) detail.lastUser = lastUserFromEvents(events);
					})
					.catch(() => {
						// 静默：槽位源缺失时槽位降级隐藏
					}));
			}
		}
		const pending = modelPromises.concat(historyPromises);
		if (pending.length > 0) {
			// 逐个完成即重绘（先就绪先显示，不等待全部，R-01-014/AC-03）；
			// 并立即重绘一次让加载指示在数据返回前出现。
			for (const promise of pending) promise.then(queueSync, queueSync);
			queueSync();
		}
	}

	function installServiceSubscriptions() {
		const nextSessions = ctx.get("sessions");
		const nextWorkspaces = ctx.get("workspaces");
		if (nextSessions === sessions && nextWorkspaces === workspaces) return;

		sessionUnsubscribe?.();
		workspaceUnsubscribe?.();
		sessions = nextSessions ?? null;
		workspaces = nextWorkspaces ?? null;
		try {
			sessionUnsubscribe = sessions?.list?.subscribe?.(queueSync) ?? null;
		} catch {
			sessionUnsubscribe = null;
		}
		try {
			workspaceUnsubscribe = workspaces?.list?.subscribe?.(queueSync) ?? null;
		} catch {
			workspaceUnsubscribe = null;
		}

		queueSync();
	}

	function togglePane(open) {
		const pane = document.querySelector(`[${PANE_ATTR}]`);
		if (pane === null) return;
		// 开合状态单点写入：同步抽屉滑入、透明遮罩显隐与浮动开关显隐
		//（R-01-008/AC-03、AC-05）。
		pane.setAttribute("data-open", open ? "true" : "false");
		backdrop.toggleAttribute("data-drawer-open", open);
		toggle.toggleAttribute("data-drawer-open", open);
	}
	function notifyLayoutChange() {
		try {
			window.dispatchEvent(new Event("resize"));
		} catch {}
	}
	function bindPaneControls(pane) {
		const header = pane.querySelector(".dap-header");
		const rail = pane.querySelector(".dap-rail");
		const resize = pane.querySelector(".dap-resize");
		const scroll = pane.querySelector(".dap-scroll");
		// 标题行整体即收起控件，两端断点一致：桌面折叠为窄条（R-01-011/AC-03）；
		// 移动端断点解释为收起抽屉，而非折叠窄条（R-01-008/AC-02、R-01-011/AC-06）。
		const onHeaderActivate = () => {
			if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT})`).matches) {
				togglePane(false);
				return;
			}
			collapsed = true;
			pane.setAttribute("data-collapsed", "true");
			notifyLayoutChange();
		};
		// Enter/Space 键盘激活与 click 同路径（R-01-011/AC-03、R-01-008/AC-02）。
		const onHeaderKeydown = (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			onHeaderActivate();
		};
		const onRailClick = () => {
			collapsed = false;
			pane.setAttribute("data-collapsed", "false");
			notifyLayoutChange();
		};
		// 桌面拖拽调宽（R-01-015）：pointer capture 跟踪 pointermove 实时夹取写入
		// --dap-width（主会话经 flex 弹性同步让位），抬起/取消时持久化并通知布局。
		const onResizeDown = (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			const startX = event.clientX;
			const startWidth = pane.getBoundingClientRect().width;
			// 拖拽期间经 rAF 合帧派发 resize，依赖该事件的 sibling overlay 实时跟随让位。
			let resizeNotifyHandle = null;
			const onResizeMove = (move) => {
				paneWidth = clampPaneWidth(startWidth + move.clientX - startX);
				pane.style.setProperty("--dap-width", `${paneWidth}px`);
				if (resizeNotifyHandle === null) {
					resizeNotifyHandle = requestAnimationFrame(() => {
						resizeNotifyHandle = null;
						notifyLayoutChange();
					});
				}
			};
			const onResizeUp = () => {
				resize.removeAttribute("data-dragging");
				resize.removeEventListener("pointermove", onResizeMove);
				resize.removeEventListener("pointerup", onResizeUp);
				resize.removeEventListener("pointercancel", onResizeUp);
				if (resizeNotifyHandle !== null) cancelAnimationFrame(resizeNotifyHandle);
				writeStoredPaneWidth(paneWidth);
				notifyLayoutChange();
			};
			resize.setAttribute("data-dragging", "");
			resize.addEventListener("pointermove", onResizeMove);
			resize.addEventListener("pointerup", onResizeUp);
			resize.addEventListener("pointercancel", onResizeUp);
			resize.setPointerCapture(event.pointerId);
		};
		// 滚动条仅滚动时显示（R-01-004/AC-03）：滚动即置位，停滚 600ms 后隐藏。
		let scrollHideTimer = null;
		const onScroll = () => {
			queueTrackSync(); // 滚动停在小数相位后重对齐轨道层（rAF 合帧）
			scroll.setAttribute("data-scrolling", "");
			if (scrollHideTimer !== null) clearTimeout(scrollHideTimer);
			scrollHideTimer = setTimeout(() => {
				scrollHideTimer = null;
				scroll.removeAttribute("data-scrolling");
			}, 600);
		};
		header?.addEventListener("click", onHeaderActivate);
		header?.addEventListener("keydown", onHeaderKeydown);
		rail?.addEventListener("click", onRailClick);
		scroll?.addEventListener("scroll", onScroll, { passive: true });
		resize?.addEventListener("pointerdown", onResizeDown);
		return () => {
			header?.removeEventListener("click", onHeaderActivate);
			header?.removeEventListener("keydown", onHeaderKeydown);
			rail?.removeEventListener("click", onRailClick);
			scroll?.removeEventListener("scroll", onScroll);
			if (scrollHideTimer !== null) clearTimeout(scrollHideTimer);
			resize?.removeEventListener("pointerdown", onResizeDown);
		};
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
				<div class="dap-header" role="button" tabindex="0" aria-expanded="true" aria-label="收起活动会话窗格" title="收起">
					<span>活动会话</span>
					<span class="dap-count" role="status" aria-live="polite"></span>
					<span class="dap-collapse-hint" aria-hidden="true">«</span>
				</div>
				<div class="dap-scroll">
					<div class="dap-list" tabindex="-1"><div class="dap-tracks" aria-hidden="true"></div></div>
					<div class="dap-recent">
						<div class="dap-recent-head"><span>最近历史 · 24h</span></div>
					</div>
				</div>
				<button class="dap-rail" type="button" aria-label="展开活动会话窗格">
					<span class="dap-rail-title" aria-hidden="true">活动会话</span>
					<span class="dap-rail-count" role="status" aria-live="polite"></span>
				</button>
				<div class="dap-resize" aria-hidden="true"></div>
			`;
			pane.style.setProperty("--dap-width", `${paneWidth}px`);
		}
		if (pane !== boundPane) {
			unbindPaneControls?.();
			unbindPaneControls = bindPaneControls(pane);
			boundPane = pane;
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
		const head = makeEl("div", "dap-card-head");
		const workspace = makeEl("div", "dap-workspace");
		const workspaceIcon = makeEl("span", "dap-workspace-icon");
		workspaceIcon.append(createWorkspaceFolderIcon());
		workspace.append(workspaceIcon, makeEl("span", "dap-workspace-text"));
		head.append(workspace, makeEl("div", "dap-model"));
		if (kind === "parent") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			const track = makeEl("div", "dap-track");
			track.append(makeEl("div", "dap-fill"));
			return [head, row, makeEl("div", "dap-trace"), track];
		}
		if (kind === "subagent") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			return [head, row, makeEl("div", "dap-subtrace")];
		}
		if (kind === "recent") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			const userLine = makeEl("div", "dap-history-line");
			userLine.dataset.role = "user";
			const userIcon = makeEl("span", "dap-history-icon");
			userIcon.append(createUserIcon());
			userLine.append(userIcon, makeEl("span", "dap-history-text"));
			const agentLine = makeEl("div", "dap-history-line");
			agentLine.dataset.role = "agent";
			const agentIcon = makeEl("span", "dap-history-icon");
			agentIcon.append(createRobotIcon());
			agentLine.append(agentIcon, makeEl("span", "dap-history-text"));
			return [head, row, userLine, agentLine, makeEl("div", "dap-note")];
		}
		if (kind === "awaiting") {
			const row = makeEl("div", "dap-row");
			row.append(
				makeEl("span", "dap-dot"),
				makeEl("span", "dap-title"),
				makeEl("span", "dap-badge"),
			);
			return [head, row, makeEl("div", "dap-trace"), makeEl("div", "dap-note")];
		}
		// 运行卡：上下文 + 标题 + 最近工作项 + 进度条 + token 底行。
		const row = makeEl("div", "dap-row");
		row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"), makeEl("span", "dap-pct"));
		const track = makeEl("div", "dap-track");
		track.append(makeEl("div", "dap-fill"));
		// 统计行双段结构：左列 token/速率/命中率（超长省略号截断），时长固定最右（R-01-009/AC-05）。
		const statsRow = makeEl("div", "dap-token-stats");
		statsRow.append(makeEl("span", "dap-token-main"), makeEl("span", "dap-token-time"));
		statsRow.hidden = true;
		return [head, row, makeEl("div", "dap-trace"), track, statsRow];
	}

	function createInlineIcon({ viewBox, width = 12, height = 12, parts }) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", viewBox);
		svg.setAttribute("width", String(width));
		svg.setAttribute("height", String(height));
		svg.setAttribute("fill", "none");
		svg.setAttribute("aria-hidden", "true");
		for (const part of parts) {
			const node = document.createElementNS("http://www.w3.org/2000/svg", part.tag ?? "path");
			for (const [name, value] of Object.entries(part.attrs)) node.setAttribute(name, value);
			svg.append(node);
		}
		return svg;
	}

	function createUserIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { d: "M11.0307 5.46369C11.0305 3.78995 9.6734 2.43357 7.99961 2.43357C6.32601 2.43379 4.96972 3.79009 4.96949 5.46369C4.96949 7.13748 6.32587 8.49455 7.99961 8.49477C9.67354 8.49477 11.0307 7.13762 11.0307 5.46369ZM12.3163 5.46369C12.3163 7.84777 10.3837 9.78042 7.99961 9.78042C5.61572 9.7802 3.68288 7.84763 3.68288 5.46369C3.6831 3.07993 5.61586 1.14718 7.99961 1.14695C10.3836 1.14695 12.3161 3.0798 12.3163 5.46369Z", fill: "currentColor" } },
				{ attrs: { d: "M8.00002 10.3316C11.7343 10.3316 14.1864 11.8997 15.0387 14.4445L14.4292 14.6483L13.8197 14.8531C13.1955 12.9893 11.3673 11.6182 8.00002 11.6182C4.63277 11.6182 2.80455 12.9893 2.18031 14.8531L1.5708 14.6483L0.961304 14.4445C1.81368 11.8997 4.26579 10.3316 8.00002 10.3316Z", fill: "currentColor" } },
			],
		});
	}

	/** 左边栏工作区行同款 canonical 文件夹图标（dsh-client-ui-primitives 的 IconFolderClose16），
	 *  置于工作区徽标文字前使归属一眼可辨（R-01-003/AC-06）。 */
	function createWorkspaceFolderIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { transform: "translate(1.5 2.429)", d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z", fill: "currentColor" } },
			],
		});
	}

	/** DSH canonical IconApiOutline14, used when the native row is unavailable/errored. */
	function createBashIcon() {
		return createInlineIcon({
			viewBox: "0 0 14 14",
			parts: [
				{ attrs: { transform: "translate(0.6689 1.073)", d: "M11.4818 5.57813C11.4818 4.45301 11.4807 3.66237 11.4075 3.05908C11.3359 2.46953 11.2024 2.13852 10.9939 1.89441C10.9247 1.81341 10.8493 1.73801 10.7683 1.66882C10.5242 1.46033 10.1932 1.32686 9.60364 1.25525C9.00034 1.18198 8.20974 1.18091 7.0846 1.18091L5.57813 1.18091C4.45301 1.18091 3.66238 1.18198 3.05908 1.25525C2.46953 1.32686 2.13852 1.46033 1.89441 1.66882C1.81341 1.73801 1.73801 1.81341 1.66882 1.89441C1.46033 2.13852 1.32686 2.46953 1.25525 3.05908C1.18198 3.66238 1.18091 4.45301 1.18091 5.57813L1.18091 6.2771C1.18091 7.40218 1.18197 8.19288 1.25525 8.79614C1.32687 9.38553 1.46036 9.71674 1.66882 9.96082C1.73797 10.0417 1.81347 10.1173 1.89441 10.1864C2.13851 10.3948 2.46965 10.5275 3.05908 10.5991C3.66238 10.6724 4.45298 10.6735 5.57813 10.6735L7.0846 10.6735C8.20977 10.6735 9.00033 10.6724 9.60364 10.5991C10.1931 10.5275 10.5242 10.3948 10.7683 10.1864C10.8493 10.1173 10.9247 10.0417 10.9939 9.96082C11.2024 9.71674 11.3358 9.38553 11.4075 8.79614C11.4808 8.19288 11.4818 7.40218 11.4818 6.2771L11.4818 5.57813ZM12.6627 6.2771C12.6627 7.37222 12.6637 8.247 12.5798 8.93799C12.4942 9.64284 12.3133 10.2359 11.8928 10.7282C11.7834 10.8562 11.6637 10.9751 11.5356 11.0845C11.0434 11.5049 10.4511 11.6867 9.74634 11.7723C9.05525 11.8563 8.17999 11.8552 7.0846 11.8552L5.57813 11.8552C4.48273 11.8552 3.60747 11.8562 2.91638 11.7723C2.21157 11.6867 1.61933 11.5049 1.12708 11.0845C0.99901 10.975 0.879281 10.8562 0.769898 10.7282C0.349454 10.2359 0.168506 9.64284 0.0828864 8.93799C-0.00101964 8.247 4.88512e-7 7.37222 6.47206e-7 6.2771L6.47206e-7 5.57813C6.47206e-7 4.48273 -0.00106163 3.60747 0.0828864 2.91638C0.168502 2.21168 0.349594 1.61928 0.769898 1.12708C0.879302 0.998981 0.998981 0.879302 1.12708 0.769898C1.61928 0.349594 2.21168 0.168502 2.91638 0.0828864C3.60747 -0.00106163 4.48273 6.47206e-7 5.57813 6.47206e-7L7.0846 6.47206e-7C8.17999 6.47206e-7 9.05525 -0.00106163 9.74634 0.0828864C10.451 0.168505 11.0434 0.349587 11.5356 0.769898C11.6637 0.879302 11.7834 0.998981 11.8928 1.12708C12.3131 1.61928 12.4942 2.21169 12.5798 2.91638C12.6638 3.60747 12.6627 4.48273 12.6627 5.57813L12.6627 6.2771Z", fill: "currentColor" } },
				{ attrs: { transform: "translate(0.6689 1.073)", d: "M6.02607 5.50955L6.44306 5.9274L3.84284 8.52762L3.425 8.11063L3.00715 7.69278L4.77253 5.9274L3.00715 4.16202L3.84284 3.32633L6.02607 5.50955Z", fill: "currentColor" } },
				{ attrs: { transform: "translate(0.6689 1.073)", d: "M9.23789 7.35397L9.23789 8.53488L6.96238 8.53488L6.96238 7.35397L9.23789 7.35397Z", fill: "currentColor" } },
			],
		});
	}

	/** 以下 canonical 图标与主会话网页同源（dsh-client-ui-primitives 的 figma extract），
	 *  供非当前会话/无原生行时 fallback 使用，保证选中态切换不漂移（R-01-012/AC-03）。 */
	function createSearchIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { d: "M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z", fill: "currentColor" } },
				{ attrs: { d: "M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z", fill: "currentColor" } },
			],
		});
	}

	function createBrowseIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { d: "M11.2426 4.80473V6.10551H4.75819V4.80473H11.2426Z", fill: "currentColor" } },
				{ attrs: { d: "M9.40858 7.84478V9.14557H4.75819V7.84478H9.40858Z", fill: "currentColor" } },
				{ attrs: { d: "M9.23438 0.546389C10.1941 0.546389 10.9683 0.544914 11.5859 0.611819C12.2161 0.680096 12.7634 0.825745 13.2393 1.17139C13.5172 1.3733 13.7619 1.61812 13.9639 1.896C14.3096 2.37183 14.4551 2.91922 14.5234 3.54932C14.5903 4.16686 14.5889 4.94133 14.5889 5.90088V10.0981C14.5889 11.0576 14.5903 11.8321 14.5234 12.4497C14.4552 13.0798 14.3094 13.6272 13.9639 14.103C13.7619 14.381 13.5172 14.6257 13.2393 14.8276C12.7633 15.1734 12.2163 15.3189 11.5859 15.3872C10.9683 15.4541 10.1942 15.4536 9.23438 15.4536H6.76563C5.80591 15.4536 5.03168 15.4541 4.41407 15.3872C3.78385 15.3189 3.23665 15.1734 2.76074 14.8276C2.48291 14.6257 2.23802 14.3809 2.03614 14.103C1.69066 13.6272 1.54483 13.0798 1.47657 12.4497C1.40973 11.8321 1.41114 11.0576 1.41114 10.0981V5.90088C1.41113 4.94132 1.40966 4.16686 1.47657 3.54932C1.54488 2.91921 1.69042 2.37184 2.03614 1.896C2.2381 1.61807 2.4828 1.37333 2.76074 1.17139C3.23665 0.825682 3.78386 0.680109 4.41407 0.611819C5.03168 0.544905 5.80591 0.546389 6.76563 0.546389H9.23438ZM6.76563 1.896C5.77586 1.896 5.0876 1.89738 4.55957 1.95459C4.0443 2.01043 3.76214 2.11349 3.55469 2.26416C3.39135 2.38284 3.24761 2.52662 3.12891 2.68994C2.97821 2.89736 2.8752 3.17967 2.81934 3.69483C2.76214 4.22279 2.76075 4.91131 2.76074 5.90088V10.0981C2.76074 11.0876 2.76221 11.7762 2.81934 12.3042C2.87516 12.8194 2.97829 13.1026 3.12891 13.3101C3.24754 13.4733 3.39147 13.6172 3.55469 13.7358C3.76213 13.8865 4.04438 13.9896 4.55957 14.0454C5.0876 14.1026 5.77586 14.103 6.76563 14.103H9.23438C10.2242 14.103 10.9124 14.1026 11.4404 14.0454C11.9556 13.9896 12.2379 13.8865 12.4453 13.7358C12.6086 13.6172 12.7525 13.4733 12.8711 13.3101C13.0217 13.1026 13.1248 12.8195 13.1807 12.3042C13.2378 11.7762 13.2393 11.0876 13.2393 10.0981V5.90088C13.2393 4.91131 13.2379 4.22279 13.1807 3.69483C13.1248 3.17969 13.0218 2.89736 12.8711 2.68994C12.7524 2.52667 12.6086 2.38281 12.4453 2.26416C12.2379 2.11355 11.9556 2.01041 11.4404 1.95459C10.9124 1.8974 10.2241 1.896 9.23438 1.896H6.76563Z", fill: "currentColor" } },
			],
		});
	}

	function createEditIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { d: "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z", fill: "currentColor" } },
			],
		});
	}

	function createCodeIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { d: "M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z", fill: "currentColor", "fill-rule": "evenodd", "clip-rule": "evenodd" } },
			],
		});
	}

	function createSparkleIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ attrs: { d: "M6.1 3.1Q6.6 7.8 11.3 8.3Q6.6 8.8 6.1 13.5Q5.6 8.8 0.9 8.3Q5.6 7.8 6.1 3.1Z", fill: "currentColor" } },
				{ attrs: { d: "M11.9 1Q12.2 3.7 14.9 4Q12.2 4.3 11.9 7Q11.6 4.3 8.9 4Q11.6 3.7 11.9 1Z", fill: "currentColor" } },
				{ attrs: { d: "M12.5 9.4Q12.7 11.4 14.7 11.6Q12.7 11.8 12.5 13.8Q12.3 11.8 10.3 11.6Q12.3 11.4 12.5 9.4Z", fill: "currentColor" } },
			],
		});
	}

	/** 历史卡 agent 回复行角色图标（R-01-013/AC-08）：主网页图标集无现成机器人，按 canonical 风格手绘。 */
	function createRobotIcon() {
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ tag: "rect", attrs: { x: "2.5", y: "5", width: "11", height: "8", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "1.3" } },
				{ tag: "line", attrs: { x1: "8", y1: "5", x2: "8", y2: "2.7", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" } },
				{ tag: "circle", attrs: { cx: "8", cy: "1.8", r: "1.1", fill: "currentColor" } },
				{ tag: "circle", attrs: { cx: "5.9", cy: "9", r: "1.2", fill: "currentColor" } },
				{ tag: "circle", attrs: { cx: "10.1", cy: "9", r: "1.2", fill: "currentColor" } },
			],
		});
	}

	function createGlobeIcon() {
		return createInlineIcon({
			viewBox: "0 0 14 14",
			parts: [
				{ attrs: { d: "M7.00018 0.353516C10.6708 0.353535 13.6468 3.32958 13.6469 7.00018C13.6468 10.6708 10.6708 13.6468 7.00018 13.6469C3.32957 13.6468 0.353535 10.6708 0.353516 7.00018C0.353535 3.32957 3.32957 0.353531 7.00018 0.353516ZM5.44643 7.59661C5.49463 8.97506 5.70762 10.191 6.02136 11.0793C6.20141 11.5891 6.40328 11.9585 6.59898 12.1889C6.79501 12.4196 6.93213 12.454 7.00018 12.454C7.06822 12.454 7.20533 12.4197 7.40138 12.1889C7.59708 11.9585 7.79895 11.589 7.979 11.0793C8.29274 10.191 8.50574 8.97506 8.55394 7.59661H5.44643ZM1.57861 7.59661C1.80785 9.70467 3.2386 11.4509 5.1715 12.1388C5.07135 11.9317 4.97972 11.7098 4.89746 11.477C4.53084 10.4391 4.30224 9.0828 4.25357 7.59661H1.57861ZM9.74679 7.59661C9.69813 9.0828 9.46952 10.4391 9.1029 11.477C9.0206 11.7099 8.92818 11.9316 8.82797 12.1388C10.7613 11.4511 12.1925 9.70496 12.4218 7.59661H9.74679ZM5.1706 1.8616C3.23814 2.54963 1.80876 4.29604 1.5795 6.40376H4.25357C4.30224 4.91756 4.53083 3.56129 4.89746 2.5234C4.97968 2.29066 5.07051 2.0686 5.1706 1.8616ZM7.00018 1.54637C6.93213 1.54638 6.79503 1.5807 6.59898 1.81145C6.40332 2.04177 6.20139 2.41058 6.02136 2.92012C5.70754 3.80851 5.49461 5.02499 5.44643 6.40376H8.55394C8.50575 5.025 8.29282 3.80851 7.979 2.92012C7.79898 2.41059 7.59705 2.04177 7.40138 1.81145C7.20531 1.58067 7.06823 1.54637 7.00018 1.54637ZM8.82887 1.8616C8.92902 2.0687 9.02064 2.29053 9.1029 2.5234C9.46953 3.56129 9.69812 4.91756 9.74679 6.40376H12.4209C12.1916 4.29575 10.7618 2.54943 8.82887 1.8616Z", fill: "currentColor", "fill-rule": "evenodd", "clip-rule": "evenodd" } },
			],
		});
	}

	function createThinkIcon() {
		return createInlineIcon({
			viewBox: "0 0 14 14",
			parts: [
				{ attrs: { d: "M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233C8.19322 7.68573 7.68772 8.19123 7.06431 8.19123C6.44099 8.19113 5.9354 7.68567 5.9354 7.06233C5.93555 6.43911 6.44108 5.93353 7.06431 5.93342Z", fill: "currentColor" } },
				{ attrs: { d: "M8.6815 0.963693C10.1169 0.447019 11.6266 0.374829 12.5633 1.31135C13.5 2.24805 13.4277 3.75776 12.911 5.19319C12.7126 5.74431 12.4386 6.31796 12.0965 6.89729C12.4969 7.54638 12.8141 8.19018 13.036 8.80647C13.5527 10.2419 13.6251 11.7516 12.6883 12.6883C11.7516 13.625 10.242 13.5527 8.8065 13.036C8.19022 12.8141 7.54641 12.4969 6.89732 12.0965C6.31797 12.4386 5.74435 12.7125 5.19322 12.911C3.75777 13.4276 2.2481 13.5 1.31138 12.5633C0.374859 11.6266 0.447049 10.1168 0.963724 8.68147C1.17185 8.10338 1.46321 7.50063 1.82896 6.8924C1.52182 6.35711 1.27235 5.82825 1.08872 5.31819C0.572068 3.88278 0.499714 2.37306 1.43638 1.43635C2.37308 0.499655 3.8828 0.572044 5.31822 1.08869C5.82828 1.27232 6.35715 1.5218 6.89243 1.82893C7.50066 1.46318 8.10341 1.17181 8.6815 0.963693ZM11.3573 8.01154C10.9083 8.62253 10.3901 9.22873 9.80943 9.8094C9.22877 10.3901 8.62255 10.9083 8.01158 11.3572C8.4257 11.5841 8.8287 11.7688 9.21275 11.9071C10.5456 12.3868 11.4246 12.2547 11.8397 11.8397C12.2548 11.4246 12.3869 10.5456 11.9071 9.21272C11.7688 8.82866 11.5841 8.42568 11.3573 8.01154ZM2.56529 8.02912C2.37344 8.39322 2.21495 8.74796 2.09263 9.08772C1.61291 10.4204 1.74512 11.2995 2.16001 11.7147C2.57505 12.1297 3.45415 12.2618 4.78697 11.7821C5.11057 11.6656 5.44786 11.5164 5.7938 11.3367C5.249 10.9223 4.70922 10.4533 4.19029 9.9344C3.57578 9.31987 3.03169 8.67633 2.56529 8.02912ZM6.90708 3.2469C6.24065 3.70479 5.5646 4.26321 4.91392 4.91389C4.26325 5.56456 3.70482 6.24063 3.24693 6.90705C3.72674 7.63325 4.32777 8.37459 5.03892 9.08576C5.64943 9.69627 6.28183 10.2265 6.90806 10.6678C7.59368 10.2025 8.2908 9.63076 8.96079 8.96076C9.6308 8.29075 10.2025 7.59366 10.6678 6.90803C10.2265 6.2818 9.69631 5.6494 9.08579 5.03889C8.37462 4.32773 7.63328 3.72672 6.90708 3.2469ZM11.7147 2.15998C11.2996 1.74509 10.4204 1.61288 9.08775 2.0926C8.74835 2.21479 8.39382 2.37271 8.03013 2.56428C8.67728 3.03065 9.31995 3.5758 9.93443 4.19026C10.4534 4.7092 10.9223 5.24896 11.3368 5.79377C11.5164 5.44785 11.6656 5.11052 11.7821 4.78694C12.2618 3.45416 12.1297 2.57502 11.7147 2.15998ZM4.91197 2.2176C3.57922 1.73788 2.70004 1.86995 2.28501 2.28498C1.87001 2.70003 1.73791 3.5792 2.21763 4.91194C2.31709 5.18822 2.44112 5.47427 2.58677 5.7674C3.01931 5.1887 3.51474 4.6158 4.06529 4.06526C4.61584 3.5147 5.18872 3.01928 5.76743 2.58674C5.47431 2.4411 5.18824 2.31706 4.91197 2.2176Z", fill: "currentColor", "fill-rule": "evenodd", "clip-rule": "evenodd" } },
			],
		});
	}

	/** fallback 图标分类：先按 toolName 镜像原生 classifyTool 与行级覆盖（web_search 用地球、
	 *  cordis 插件动作用 sparkle），未知工具按 view.kind 语义兜底，再兜底原生 others 的 sparkle。 */
	const TOOL_ICON_FACTORIES = {
		bash: createBashIcon,
		pwsh: createBashIcon,
		read: createBrowseIcon,
		web_fetch: createBrowseIcon,
		cordis_package_inspect: createBrowseIcon,
		cordis_runtime_inspect: createBrowseIcon,
		web_search: createGlobeIcon,
		grep: createSearchIcon,
		glob: createSearchIcon,
		write: createEditIcon,
		edit: createEditIcon,
		run_code: createCodeIcon,
		cordis_run: createSparkleIcon,
		cordis_stop: createSparkleIcon,
		cordis_undefine: createSparkleIcon,
	};
	const KIND_ICON_FACTORIES = {
		read: createBrowseIcon,
		fetch: createBrowseIcon,
		search: createSearchIcon,
		bash: createBashIcon,
		execute: createBashIcon,
		edit: createEditIcon,
		write: createEditIcon,
		code: createCodeIcon,
	};
	function fallbackTraceIcon(item) {
		// 折叠组行（R-01-017）：think 组用思考图标、context 组用浏览图标；tool 组按末位工具成员 icon 兜底。
		// 折叠组行（R-01-017）：think 组用思考图标、context 组用浏览图标；
		// tool 组统一 DSH canonical IconApiOutline14（createBashIcon），与 auto-collapse 工具 chip 同源（C-016）。
		if (item.fold === true) {
			if (item.kind === "assistant") return createThinkIcon();
			if (item.kind === "context") return createBrowseIcon();
			return createBashIcon();
		}

		if (item.kind === "user") return createUserIcon();
		if (item.kind === "assistant") return typeof item.detail === "string" && item.detail.trim() !== "" ? createThinkIcon() : createRobotIcon();
		if (item.kind === "context") return createBrowseIcon();
		return (TOOL_ICON_FACTORIES[item.toolName] ?? KIND_ICON_FACTORIES[item.icon] ?? createSparkleIcon)();
	}


	/**
	 * 更新 trace 容器。运行中的同一节点只更新文字，复用 DOM 保持脉冲动画连续；
	 * 节点身份或数量变化时才重建（R-02-003/AC-01）。
	 */
	function renderTrace(container, items, { lastOnly = false } = {}) {
		const list = Array.isArray(items) ? items : [];
		const sources = lastOnly ? (list.length === 0 ? [] : [list[list.length - 1]]) : list;
		const valid = sources.filter((item) => item !== null && typeof item === "object");
		const existing = Array.from(container.children);
		const stable =
			existing.length === valid.length &&
			existing.every((line, index) => line.dataset.traceKey === String(valid[index].id ?? index));
		const lines = stable ? existing : [];
		if (!stable) container.replaceChildren();
		for (let index = 0; index < valid.length; index += 1) {
			const item = valid[index];
			const key = String(item.id ?? index);
			const line = lines[index] ?? makeEl("div", "dap-trace-item");
			line.dataset.traceKey = key;
			// 核心派生状态直接上卡：显示行全部由核心折叠派生，无原生 data-state 合并维度。
			line.dataset.status = item.status ?? "running";
			line.dataset.icon = typeof item.icon === "string" ? item.icon : "other";
			// 活动流式更新只改文本，保留命中节点；按下/抬起之间替换子节点会让浏览器取消 click。
			let main = line.querySelector(".dap-trace-main");
			if (main === null) {
				main = makeEl("span", "dap-trace-main");
				line.append(main);
			}
			const labelText = item.label || "";
			// context 项的 text 是注入内容原文，不是摘要，禁止兜底上卡。
			const summaryText = item.summary || item.detail || (item.kind === "context" ? "" : item.text) || "";
			const structure = [
				"dap-trace-icon",
				labelText ? "dap-trace-label" : null,
				labelText && summaryText ? "dap-trace-separator" : null,
				summaryText ? "dap-trace-summary" : null,
			].filter(Boolean);
			const currentStructure = [...main.children].map((child) => child.className);
			const iconKey = JSON.stringify([item.kind ?? "", item.icon ?? "", item.toolName ?? "", item.label ?? "", line.dataset.status]);
			const paintIcon = (host) => {
				host.replaceChildren();
				host.append(fallbackTraceIcon(item));
				host.dataset.iconKey = iconKey;
			};
			let iconHost = main.querySelector(".dap-trace-icon");
			if (currentStructure.join("\0") !== structure.join("\0")) {
				main.replaceChildren();
				iconHost = makeEl("span", "dap-trace-icon");
				main.append(iconHost);
				if (labelText) main.append(makeEl("span", "dap-trace-label"));
				if (labelText && summaryText) main.append(makeEl("span", "dap-trace-separator"));
				if (summaryText) main.append(makeEl("span", "dap-trace-summary"));
			}
			if (iconHost !== null && iconHost.dataset.iconKey !== iconKey) paintIcon(iconHost);
			const label = main.querySelector(".dap-trace-label");
			if (label !== null) label.textContent = labelText;
			const separator = main.querySelector(".dap-trace-separator");
			if (separator !== null) separator.setAttribute("aria-hidden", "true");
			const summary = main.querySelector(".dap-trace-summary");
			if (summary !== null) {
				// 镜像原生 ReasoningRow follow-end：running 摘要视口钉行尾跟随流式输出，
				// 否则回行首；仅在文本或跟随态变化时读写 scrollLeft（scrollWidth 读取触发布局）。
				const follow = line.dataset.status === "running" ? "end" : "start";
				if (summary.textContent !== summaryText || summary.dataset.follow !== follow) {
					summary.textContent = summaryText;
					summary.dataset.follow = follow;
					summary.scrollLeft = follow === "end" ? summary.scrollWidth : 0;
				}
			}
			const statusLabels = { running: "进行中", done: "已完成", ok: "已完成", error: "失败", stopped: "已停止" };
			line.setAttribute("aria-label", [labelText, summaryText, statusLabels[line.dataset.status] ?? line.dataset.status].filter(Boolean).join(" · "));
			if (!stable) container.append(line);
		}
	}

	/** 字段写回：离开加载态时无条件写回（spinner 无文本，相等守卫会漏清空值）；
	 *  否则只在文本变化时写入（保持 DOM 去重语义）。 */
	function restoreTextField(el, text) {
		if (el.dataset.loading === "true") {
			delete el.dataset.loading;
			el.textContent = text;
		} else if (el.textContent !== text) {
			el.textContent = text;
		}
	}

	/** 时间线区加载指示：数据在途且尚无工作项时显示活动图标行（R-01-014/AC-02）。 */
	function renderTraceLoading(container) {
		if (container.dataset.loading === "true") return;
		container.dataset.loading = "true";
		const row = makeEl("div", "dap-trace-item");
		row.dataset.status = "running";
		const main = makeEl("span", "dap-trace-main");
		const summary = makeEl("span", "dap-trace-summary");
		summary.textContent = "加载中…";
		main.append(makeEl("span", "dap-spinner"), summary);
		row.append(main);
		container.replaceChildren(row);
	}

	/** 指令槽位（R-01-018）：窗口外最近用户指令常驻 `.dap-trace` 顶部；
	 *  宿主为卡片根（trace 容器的直接父级），不参与 renderTrace 的 children 管理，
	 *  不破坏时间线行的稳定 key 复用。 */
	function renderSlot(container, slot) {
		const host = container.parentElement;
		if (host === null) return;
		const text = slot !== null && typeof slot.text === "string" ? slot.text : "";
		let slotEl = host.querySelector(".dap-slot");
		if (text === "") {
			if (slotEl !== null && slotEl.hidden !== true) slotEl.hidden = true;
			return;
		}
		if (slotEl === null) {
			slotEl = makeEl("div", "dap-slot");
			slotEl.append(makeEl("span", "dap-slot-icon"), makeEl("span", "dap-slot-text"));
			host.insertBefore(slotEl, container);
		}
		const icon = slotEl.querySelector(".dap-slot-icon");
		if (icon !== null && icon.childElementCount === 0) icon.append(createUserIcon());
		const textEl = slotEl.querySelector(".dap-slot-text");
		if (textEl !== null && textEl.textContent !== text) textEl.textContent = text;
		if (slotEl.hidden === true) slotEl.hidden = false;
	}

	/** 时间线区统一渲染：在途且无工作项时显示加载行，否则渲染工作项时间线。 */
	function renderTimelineArea(container, entry, { lastOnly = false } = {}) {
		renderSlot(container, entry.slot ?? null);
		if (entry.loadingTimeline === true && entry.timeline.length === 0) {
			renderTraceLoading(container);
			return;
		}
		if (container.dataset.loading === "true") delete container.dataset.loading;
		renderTrace(container, entry.timeline, { lastOnly });
	}

	function renderCardInto(el, entry) {
		const workspaceLabel = el.querySelector(".dap-workspace");
		if (workspaceLabel !== null) {
			const workspaceText = workspaceLabel.querySelector(".dap-workspace-text");
			if (entry.workspaceTitle !== "") {
				if (workspaceText !== null) restoreTextField(workspaceText, entry.workspaceTitle);
				workspaceLabel.removeAttribute("hidden");
			} else {
				if (workspaceText !== null) restoreTextField(workspaceText, "");
				workspaceLabel.setAttribute("hidden", "");
			}
		}
		const modelLabel = el.querySelector(".dap-model");
		if (modelLabel !== null) {
			if (entry.loadingModel === true) {
				if (modelLabel.dataset.loading !== "true") {
					modelLabel.dataset.loading = "true";
					modelLabel.replaceChildren(makeEl("span", "dap-spinner"));
				}
			} else {
				restoreTextField(modelLabel, [entry.model, entry.reasoning].filter(Boolean).join(" · "));
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
				pct.textContent = `${Math.round(entry.progress ?? 0)}%`;
			const traceContainer = el.querySelector(".dap-trace");
			if (traceContainer !== null) renderTimelineArea(traceContainer, entry);
			const fill = el.querySelector(".dap-fill");
			if (fill !== null) {
				const width = `${Math.min(100, Math.max(0, entry.progress ?? 0))}%`;
				if (fill.style.width !== width) fill.style.width = width;
			}
			const stats = el.querySelector(".dap-token-stats");
			if (stats !== null) {
				const parts = [];
				if (Number.isFinite(entry.rateTokS) && entry.rateTokS > 0) parts.push(`${Math.round(entry.rateTokS)} tok/s`);
				if (Number.isFinite(entry.cacheHitPct)) parts.push(`缓存 ${entry.cacheHitPct}%`);
				if (Number.isFinite(entry.inputTokens) && entry.inputTokens >= 0) parts.push(`输入 ${fmtTokens(entry.inputTokens) ?? entry.inputTokens}`);
				if (Number.isFinite(entry.outputTokens) && entry.outputTokens >= 0) parts.push(`输出 ${fmtTokens(entry.outputTokens) ?? entry.outputTokens}`);
				const mainText = parts.join(" · ");
				const timeText = Number.isFinite(entry.elapsedMs) && entry.elapsedMs >= 0 ? fmtElapsedMs(entry.elapsedMs) : "";
				let mainTextEl = stats.querySelector(".dap-token-main");
				let timeEl = stats.querySelector(".dap-token-time");
				if (mainTextEl === null || timeEl === null) {
					// 热装残留的旧版单文本段骨架：就地重建双段结构再写值。
					mainTextEl = makeEl("span", "dap-token-main");
					timeEl = makeEl("span", "dap-token-time");
					stats.replaceChildren(mainTextEl, timeEl);
				}
				if (mainTextEl.textContent !== mainText) mainTextEl.textContent = mainText;
				if (timeEl.textContent !== timeText) timeEl.textContent = timeText;
				const statsHidden = mainText === "" && timeText === "";
				if (stats.hidden !== statsHidden) stats.hidden = statsHidden;
			}
			return;
		}

		if (entry.kind === "subagent") {
			const traceContainer = el.querySelector(".dap-subtrace");
			if (traceContainer !== null) renderTimelineArea(traceContainer, entry, { lastOnly: true });
			return;
		}
		if (entry.kind === "parent") {
			const traceContainer = el.querySelector(".dap-trace");
			if (traceContainer !== null) renderTimelineArea(traceContainer, entry);
			return;
		}

		if (entry.kind === "recent") {
			const lines = el.querySelectorAll(".dap-history-line");
			const previews = [entry.userPreview ?? "", entry.agentPreview ?? ""];
			for (let i = 0; i < 2; i += 1) {
				const line = lines[i];
				if (!line) continue;
				const text = line.querySelector(".dap-history-text");
				if (!text) continue;
				if (entry.loadingPreviews === true) {
					if (text.dataset.loading !== "true") {
						text.dataset.loading = "true";
						text.replaceChildren(makeEl("span", "dap-spinner"));
					}
				} else {
					restoreTextField(text, previews[i]);
				}
			}
		}

		if (entry.kind === "awaiting") {
			const traceContainer = el.querySelector(".dap-trace");
			if (traceContainer !== null) renderTimelineArea(traceContainer, entry);
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
			try {
				unsubscribe = session.subscribe(() => {
					if (disposed) return;
					const snapshot = getSessionSnapshot(session);
					const live = livenessFromSnapshot(snapshot);
					livenessById.set(id, { unsubscribe, liveness: live, snapshot });
					const detail = sessionDetailsById.get(id) ?? {};
					detail.snapshot = snapshot;
					sessionDetailsById.set(id, detail);
					queueSync();
				});
			} catch {
				continue; // 订阅失败：本次跳过，下次渲染重试
			}
			try {
				opening = session.open?.();
			} catch {
				opening = null;
			}
			if (opening && typeof opening.then === "function") {
				const tracked = Promise.resolve(opening).then(
					() => {
						sessionOpenLoads.delete(id);
						queueSync();
					},
					() => {
						sessionOpenLoads.delete(id);
						queueSync();
					},
				);
				sessionOpenLoads.set(id, tracked);
			}
			const snapshot = getSessionSnapshot(session);
			livenessById.set(id, {
				unsubscribe,
				liveness: livenessFromSnapshot(snapshot),
				snapshot,
			});
			const detail = sessionDetailsById.get(id) ?? {};
			detail.snapshot = snapshot;
			sessionDetailsById.set(id, detail);
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

	/** 保证 list 内存在/移除空态或加载指示节点（R-01-001/AC-02、R-01-014/AC-01）。
	 *  loading=true 时显示活动图标 + 文案（列表在途，禁止空态冒充）。 */
	function ensureListStatus(list, show, text, { loading = false } = {}) {
		let node = list.querySelector(".dap-empty");
		if (show) {
			if (node === null) {
				node = makeEl("div", "dap-empty");
				list.appendChild(node);
			}
			const mode = loading ? "loading" : "empty";
			if (node.dataset.mode !== mode) {
				node.dataset.mode = mode;
				if (loading) node.replaceChildren(makeEl("span", "dap-spinner"), document.createTextNode(text));
				else node.textContent = text;
			} else if (!loading && node.textContent !== text) {
				node.textContent = text;
			}
		} else if (node !== null) {
			node.remove();
		}
	}

	/** 层级轨道层（R-01-003/AC-04）：每个拥有可见直属子代理的母会话一条连续竖轨
	 *  加每个子卡一条接入横线（拓扑与几何由 trackRuns/trackBoxes 纯函数给出），
	 *  渲染提交后统一测量、取整到 CSS 像素后一次性写入。竖轨单元素整体绘制，
	 *  不做分段拼接（接缝在随机亚像素相位下断口与重叠并存，T-033）；横线同样
	 *  由测量值驱动——任何由 CSS 按小数坐标定位的 1px 线段都会被抗锯齿随机
	 *  摊薄，粗细不一、端点方头错位。测量集中在全部卡片写入之后，一次强制
	 *  布局完成全部读取再统一写入，避免读写交替抖动。 */
	const trackEls = new Map();
	let trackedLayer = null;
	let observedTrackList = null;
	let trackContext = null;
	let layerShiftX = 0;
	let layerShiftY = 0;
	const trackResizeObserver = new ResizeObserver(() => {
		if (trackContext !== null) syncTracks(trackContext.list, trackContext.entries, trackContext.cardsMap);
	});
	// 滚动停在任意小数相位上时重对齐轨道层（rAF 合帧，键值未变时只写 transform）。
	let trackSyncHandle = null;
	function queueTrackSync() {
		if (trackSyncHandle !== null) return;
		trackSyncHandle = requestAnimationFrame(() => {
			trackSyncHandle = null;
			if (trackContext !== null) syncTracks(trackContext.list, trackContext.entries, trackContext.cardsMap);
		});
	}

	function syncTracks(list, entries, cardsMap) {
		const layer = list.querySelector(".dap-tracks");
		if (layer === null) return;
		if (layer !== trackedLayer) {
			// 窗格重挂载后旧轨道元素已随旧 pane 移除，记账一并重置。
			trackEls.clear();
			trackedLayer = layer;
			layerShiftX = 0;
			layerShiftY = 0;
		}
		if (list !== observedTrackList) {
			if (observedTrackList !== null) trackResizeObserver.unobserve(observedTrackList);
			trackResizeObserver.observe(list);
			observedTrackList = list;
		}
		trackContext = { list, entries, cardsMap };
		// id 统一按字符串查（buildEntries 的 parentId 已 String 化，而卡片表按原始 id 键控）。
		const recById = new Map();
		for (const entry of entries) {
			const rec = cardsMap.get(entry.id);
			if (rec !== undefined) recById.set(String(entry.id), rec);
		}
		// 必须用浮点矩形：offsetTop/offsetHeight 是整数舍入值，而卡片横线由 CSS 按
		// 全精度小数高度定位（top:50%）——一边取整一边全精度，轨道端点会随机差
		// 1~2px（东家验收发现）。getBoundingClientRect 与 CSS 同精度，端点恒等。
		// 两个矩形同帧同参考系（相对轨道层未平移原点），滚动不影响差值。
		const layerRect = layer.getBoundingClientRect();
		const baseLeft = layerRect.left - layerShiftX;
		const baseTop = layerRect.top - layerShiftY;
		const rectOf = (id) => {
			const rec = recById.get(id);
			if (rec === undefined) return null;
			const rect = rec.el.getBoundingClientRect();
			return { top: rect.top - baseTop, height: rect.height, left: rect.left - baseLeft };
		};
		// 几何推导在纯函数 trackBoxes（可执行断言钉住）；此处只做测量与 DOM 写入。
		const wanted = new Map();
		for (const run of trackRuns(entries)) {
			const boxes = trackBoxes(run, rectOf, INDENT_PX);
			if (boxes === null) continue; // 卡片缺失或折叠/隐藏态零读数，展开后由 ResizeObserver 重算
			wanted.set(run.parentId, boxes);
		}
		// 设备像素对齐：1px 线段只有落在设备像素边界上才粗细一致。层原点随窗口
		// 布局/滚动停在任意小数相位（东家验收：竖轨 2px、横线 1px），整体平移层
		// （≤0.5px，接头随层同步、不可见）使全部线段同相位清晰渲染。写入集中在
		// 全部测量之后，不产生读写交替。
		const dpr = window.devicePixelRatio || 1;
		const nextShiftX = Math.round(baseLeft * dpr) / dpr - baseLeft;
		const nextShiftY = Math.round(baseTop * dpr) / dpr - baseTop;
		if (nextShiftX !== layerShiftX || nextShiftY !== layerShiftY) {
			layerShiftX = nextShiftX;
			layerShiftY = nextShiftY;
			layer.style.transform = `translate(${nextShiftX}px, ${nextShiftY}px)`;
		}
		for (const [pid, rec] of trackEls) {
			if (wanted.has(pid)) continue;
			rec.trackEl.remove();
			for (const el of rec.stubEls) el.remove();
			trackEls.delete(pid);
		}
		for (const [pid, next] of wanted) {
			const key = JSON.stringify(next);
			let rec = trackEls.get(pid);
			if (rec === undefined) {
				const trackEl = document.createElement("i");
				trackEl.className = "dap-conn-track";
				layer.appendChild(trackEl);
				rec = { trackEl, stubEls: [], key: null };
				trackEls.set(pid, rec);
			}
			if (rec.key === key) continue;
			rec.key = key;
			rec.trackEl.style.top = `${next.track.top}px`;
			rec.trackEl.style.height = `${next.track.height}px`;
			rec.trackEl.style.left = `${next.track.left}px`;
			for (const el of rec.stubEls) el.remove();
			rec.stubEls = [];
			for (const stub of next.stubs) {
				const el = document.createElement("i");
				el.className = "dap-conn-stub";
				el.style.top = `${stub.top}px`;
				el.style.left = `${stub.left}px`;
				el.style.width = `${stub.width}px`;
				layer.appendChild(el);
				rec.stubEls.push(el);
			}
		}
	}

	/** 渲染某一张卡片进指定列表容器（活动/历史通用）。index 是条目在卡片序列中的
	 * 序号，offset 是容器内首个卡片前的非卡片子节点数（活动区有轨道层、历史区有段头）。 */
	function renderCardIntoList(list, entry, reuseMap, index, offset = 0) {
		let rec = reuseMap.get(entry.id);
		if (rec === undefined) {
			const el = document.createElement("div");
			el.className = CARD_CLASS;
			const unbind = bindCardActivation(el, (sessionId) => {
				if (typeof sessions?.open !== "function") return;
				lastActivatedId = sessionId;
				// 新激活意图取代一切旧重试链，避免过期链条稍后把当前会话拽回旧目标；
				// 收起抽屉的分支同样是最新意图，必须先取消挂起链条再 return。
				cancelStaleOpenRetries({ activatedId: sessionId });
				// 二次激活当前会话卡片：移动断点抽屉打开时收起抽屉直达会话
				//（R-01-008/AC-06），不发起会话切换。
				if (
					shouldDismissDrawerOnActivation({
						targetId: sessionId,
						currentId: getSnapshot(sessions, "list")?.current ?? null,
						mobile: window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT})`).matches,
						drawerOpen:
							document.querySelector(`[${PANE_ATTR}]`)?.getAttribute("data-open") === "true",
					})
				) {
					togglePane(false);
					return;
				}
				attemptOpen(sessionId, 0);
			});
			rec = { el, kind: null, unbind };
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
		// 只有顺序/归属真正变化时才移动 DOM：每次渲染无条件 appendChild 会把所有
		// 卡片瞬时移除再插回——按下/抬起之间经过的移动让浏览器取消 click；焦点卡
		// 被瞬时断开而失焦；悬停卡的 :hover 也随之丢失且不再补发。会话活跃期间
		// 渲染随推送/时钟高频发生，窗格因此整体「不响应」。
		const ref = list.children[offset + index] ?? null;
		if (ref !== rec.el) list.insertBefore(rec.el, ref);
		return true;
	}

	function pruneCards(reuseMap, alive) {
		for (const [id, rec] of reuseMap) {
			if (alive.has(id)) continue;
			rec.unbind?.();
			rec.el.remove();
			reuseMap.delete(id);
		}
	}

	/** 降低动效偏好（R-01-010/AC-07）：命中时迁移直接落位，不播放动画。 */
	function prefersReducedMotion() {
		try {
			return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
		} catch {
			return false;
		}
	}

	function removeMoveGhost(id, ghost) {
		moveGhosts.delete(ghost);
		if (moveGhostsById.get(id) === ghost) moveGhostsById.delete(id);
		ghost.remove();
	}

	/** 迁移动画前半（DOM 写入前）：量取迁出活动卡矩形（换算为窗格相对坐标）并克隆
	 *  ghost；ghost 挂载于窗格元素内，卡片样式经作用域自然生效。 */
	function prepareMoveGhosts(movedIds) {
		if (movedIds.length === 0 || disposed || prefersReducedMotion()) return [];
		const paneRect = renderedPane?.getBoundingClientRect?.();
		if (paneRect == null) return [];
		const plans = [];
		for (const id of movedIds) {
			const source = cardsById.get(id)?.el;
			const rect = source?.getBoundingClientRect?.();
			if (source == null || rect == null || rect.width <= 0 || rect.height <= 0) continue;
			// 同一 id 再次迁移：先移除旧 ghost，按最新帧重新判定。
			const oldGhost = moveGhostsById.get(id);
			if (oldGhost !== undefined) removeMoveGhost(id, oldGhost);
			const ghost = source.cloneNode(true);
			ghost.classList.add("dap-move-ghost");
			ghost.removeAttribute("data-session-id");
			ghost.removeAttribute("id");
			ghost.style.marginLeft = "0";
			ghost.style.boxSizing = "border-box";
			ghost.style.left = `${rect.left - paneRect.left}px`;
			ghost.style.top = `${rect.top - paneRect.top}px`;
			ghost.style.width = `${rect.width}px`;
			ghost.style.height = `${rect.height}px`;
			// 克隆在此不挂载：其后 DOM 写入若中途抛错，未挂载克隆随 plans 自然丢弃，
			// 覆盖层不会无 transition 残留（transitionend 收口的唯一兜底）。
			plans.push({ id, ghost, left: rect.left - paneRect.left, top: rect.top - paneRect.top });
		}
		return plans;
	}

	/** 迁移动画后半（DOM 写入后）：量取目标最近卡矩形，rAF 内启动 FLIP 平移并形变至
	 *  目标矩形，到位后淡出、真卡淡入；目标不可量取时直接落位（克隆未挂载，无需清理）。
	 *  transitionend 收口，不引入定时器。 */
	function runMoveGhosts(plans) {
		const paneRect = renderedPane?.getBoundingClientRect?.();
		if (paneRect == null) return;
		for (const plan of plans) {
			const target = recentCardsById.get(plan.id)?.el;
			const rect = target?.getBoundingClientRect?.();
			if (target == null || rect == null || rect.width <= 0 || rect.height <= 0) {
				continue;
			}
			renderedPane.appendChild(plan.ghost);
			moveGhosts.add(plan.ghost);
			moveGhostsById.set(plan.id, plan.ghost);
			target.classList.add("dap-move-in");
			const dx = rect.left - paneRect.left - plan.left;
			const dy = rect.top - paneRect.top - plan.top;
			const ghost = plan.ghost;
			requestAnimationFrame(() => {
				if (!moveGhosts.has(ghost)) return;
				ghost.style.transform = `translate(${dx}px, ${dy}px)`;
				ghost.style.width = `${rect.width}px`;
				ghost.style.height = `${rect.height}px`;
				ghost.style.opacity = "0";
			});
			ghost.addEventListener(
				"transitionend",
				() => {
					removeMoveGhost(plan.id, ghost);
					target.classList.remove("dap-move-in");
				},
				{ once: true },
			);
		}
	}

	/** 卡片渲染异常上报（按会话+错误内容去重）：持续故障不刷屏，错误变化时再记。
	 *  隔离是为让其余卡片继续更新，错误本身必须保持可见、不吞错。 */
	let lastCardRenderErrorKey = "";
	function logCardRenderError(sessionId, error) {
		const key = `${sessionId}:${error instanceof Error ? error.message : String(error)}`;
		if (key === lastCardRenderErrorKey) return;
		lastCardRenderErrorKey = key;
		console.error(`[dsh-activity-pane] 卡片渲染失败（${sessionId}）:`, error);
	}

	function render() {
		installFrameObserver();
		const pane = ensurePane();
		if (pane === null) return;
		if (pane !== renderedPane) {
			renderedPane = pane;
			lastSig = "";
			prevRenderedActiveIds = new Set();
		}
		applyLayout();
		const activeList = pane.querySelector(`.${LIST_CLASS}`);
		const recentSection = pane.querySelector(`.${RECENT_CLASS}`);
		if (activeList === null || recentSection === null) return;

		const snapshot = getSnapshot(sessions, "list");
		const listState = listLoadState(snapshot);
		const workspaceSnapshot = getSnapshot(workspaces, "list");
		const workspaceItems = workspaceSnapshot?.items ?? [];
		const archivedSessionIds = workspaceSnapshot?.archivedSessionIds ?? [];
		const now = Date.now();

		// 响应保持登记/解除先于派生（R-01-002/AC-05、R-01-010/AC-06）。
		heldCompletedIds = updateCompletedHolds(heldCompletedIds, snapshot, prevActiveMainIds);
		const active = buildEntries(snapshot, workspaceItems, sessionDetailsById, heldCompletedIds);
		prevActiveMainIds = active.filter((entry) => entry.kind === "running" || entry.kind === "awaiting").map((entry) => entry.id);
		// 轮内订阅仅对"运行中"会话建立（主会话 + 运行中的子代理），保持在运行中的订阅
		// 数量 == 运行中会话数量（R-02-004/AC-01）；暂停等待的子代理只显示标题。
		const runLikeIds = new Set(
			active.filter((entry) => shouldSubscribeToSession(entry, snapshot?.byId ?? {})).map((entry) => entry.id),
		);
		syncLiveness(runLikeIds);
		for (const entry of active) {
			const liveRecord = livenessById.get(entry.id);
			const live = liveRecord?.liveness ?? null;
			const detail = sessionDetailsById.get(entry.id);
			const detailSnapshot = liveRecord?.snapshot ?? detail?.snapshot ?? null;
			if (detail && detailSnapshot) {
				// 按快照引用 memo：引用不变（时钟 tick、无关推送）时命中缓存，
				// 长会话不再每次渲染全序扫描。
				const entryCwd = snapshot?.byId?.[entry.id]?.cwd ?? "";
				if (detail.memoTimelineOf !== detailSnapshot || detail.memoTimelineCwd !== entryCwd || detail.memoTimelineUser !== detail.lastUser) {
					detail.memoTimelineOf = detailSnapshot;
					detail.memoTimelineCwd = entryCwd;
					detail.memoTimelineUser = detail.lastUser;
					// R-01-018：运行卡槽位源——轻量 history 的最近用户指令（窗口内无指令行时兜底）；
					// 窗口内出现用户指令行时顺带刷新该记录，指令被挤出后槽位跟随最新指令。
					const derivedTimeline = foldedTimelineWithSlot(detailSnapshot, 4, entryCwd, detail.lastUser ?? null);
					// 行内更新收敛：值相等不换引用，避免 lastUser 引用变化引发 memo 键抖动重算。
					const windowUser = derivedTimeline.rows.findLast((row) => row.kind === "user") ?? null;
					if (windowUser !== null && (detail.lastUser?.text !== windowUser.text || detail.lastUser?.id !== windowUser.id)) {
						detail.lastUser = { id: windowUser.id, text: windowUser.text };
					}
					detail.memoTimeline = derivedTimeline.rows;
					detail.memoSlot = derivedTimeline.slot;
				}
				entry.timeline = detail.memoTimeline.length > 0 ? detail.memoTimeline : detail.timeline ?? [];
				entry.slot = detail.memoSlot ?? detail.timelineSlot ?? null;
			} else {
				entry.timeline = detail?.timeline ?? entry.timeline ?? [];
				entry.slot = detail?.timelineSlot ?? entry.slot ?? null;
			}
			if (detail?.model) {
				entry.model = detail.model.model;
				entry.reasoning = detail.model.reasoning;
			}
			// 字段级加载指示（R-01-014/AC-02）：补充数据在途时卡片对应位置显示活动图标。
			entry.loadingModel = !detail?.model && modelLoads.has(entry.id);
			entry.loadingTimeline =
				entry.timeline.length === 0 &&
				(historyLoads.has(entry.id) || sessionOpenLoads.has(entry.id) || (runLikeIds.has(entry.id) && !liveRecord));
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
				Object.assign(entry, runtimeStats({ elapsedMs, outputTokens, rateTokS }));
				Object.assign(entry, usageSummary(projection?.tokenUsage ?? {}));
				// 流式阶段标记驱动 data-streaming（进度条条纹动画）；工具调用期间视作
				// 非流式，与 answer-pet 的 phase==='stream' 判定一致。
				entry.streaming = !live?.runningTool && live?.streaming === true;
				// 回合进度：纯时间驱动 y = t/(t+120)，单调性由函数本身保证；回合切换由
				// turnTimings 新回合起点（elapsedMs 归零）自然重置（R-01-009/AC-06，C-014）。
				entry.progress = progressOf({ elapsedMs: elapsedMs ?? 0 });
			}
		}
		const recent = buildRecent(snapshot, workspaceItems, now, undefined, sessionDetailsById, archivedSessionIds, heldCompletedIds);
		// 预览只对 recent 卡计算（活动卡不显示预览）；快照/历史引用不变时命中缓存。
		for (const entry of recent) {
			const detail = sessionDetailsById.get(entry.id);
			if (!detail) continue;
			const detailSnapshot = livenessById.get(entry.id)?.snapshot ?? detail.snapshot ?? null;
			const previewsKey = detailSnapshot ?? detail.history ?? null;
			if (detail.memoPreviewsOf !== previewsKey || detail.memoPreviewsHistoryOf !== (detail.history ?? null) || !detail.memoPreviews) {
				detail.memoPreviewsOf = previewsKey;
				detail.memoPreviewsHistoryOf = detail.history ?? null;
				detail.memoPreviews = messagePreviews({ snapshot: detailSnapshot, history: detail.history });
			}
			entry.userPreview = detail.memoPreviews.userPreview || detail.previews?.userPreview || "";
			entry.agentPreview = detail.memoPreviews.agentPreview || detail.previews?.agentPreview || "";
			entry.loadingPreviews = !entry.userPreview && !entry.agentPreview && historyLoads.has(entry.id);
		}
		// 补充数据读取优先级：当前会话最优先，活动区先于历史区（区内按显示顺序）。
		const detailIds = [...active, ...recent].map((entry) => entry.id);
		detailIds.sort((a, b) => Number(String(b) === String(snapshot?.current)) - Number(String(a) === String(snapshot?.current)));
		loadNativeDetails(detailIds);
		const visibleIds = new Set([...active, ...recent].map((entry) => entry.id));
		// 详情与 loads 记账同生命周期：离开可见集合即放行，重回可见时允许重拉/重试。
		pruneInvisibleEntries([sessionDetailsById, modelLoads, historyLoads, sessionOpenLoads], visibleIds);
		// 重试链目标已成为当前会话（他途到达）即取消，避免过期链条拽回会话。
		cancelStaleOpenRetries({ currentId: snapshot?.current ?? null, activatedId: lastActivatedId });

		const sig = cardSignature([...active, ...recent]);
		if (sig === lastSig) return;
		// 活动区→历史区迁移：DOM 写入前量取旧卡矩形并克隆 ghost（R-01-010/AC-07）。
		const movePlans = prepareMoveGhosts(movedToRecentIds(prevRenderedActiveIds, active, recent));

		// 逐卡异常隔离：一张卡渲染抛错不得冻结其余卡片（此前签名先于循环提交，
		// 故障卡及其后全部卡片永久滞留旧内容——历史卡因此停在过去的首条消息
		// fallback 标题，与左侧栏脱节）；本轮有失败则不提交签名，下一次同步整体
		// 重试——瞬时异常自愈，持续异常只滞留故障卡本身（R-01-013/AC-02）。
		let renderOk = true;
		const aliveActive = new Set();
		for (const [index, entry] of active.entries()) {
			try {
				renderCardIntoList(activeList, entry, cardsById, index, 1);
			} catch (error) {
				renderOk = false;
				logCardRenderError(entry.id, error);
			}
			// 渲染失败的卡同样计为存活：保留最后内容在位（下轮重试自愈），
			// 不得被 pruneCards 摘除后每轮重建闪烁。
			aliveActive.add(entry.id);
		}
		pruneCards(cardsById, aliveActive);
		// 全部卡片写入后统一测量绘制母会话轨道（单元素连续轨道，零拼接接缝）。
		syncTracks(activeList, active, cardsById);
		ensureListStatus(activeList, active.length === 0, listState === "loading" ? "加载中…" : listState === "error" ? "列表加载失败" : "暂无活动会话", { loading: listState === "loading" });
		const aliveRecent = new Set();
		// 历史区容器首个子节点是段头（.dap-recent-head），卡片从 offset 1 开始。
		for (const [index, entry] of recent.entries()) {
			try {
				renderCardIntoList(recentSection, entry, recentCardsById, index, 1);
			} catch (error) {
				renderOk = false;
				logCardRenderError(entry.id, error);
			}
			aliveRecent.add(entry.id);
		}
		pruneCards(recentCardsById, aliveRecent);
		if (recentSection !== null) {
			recentSection.hidden = listState === "ready" && recent.length === 0;
			ensureListStatus(recentSection, listState !== "ready" && recent.length === 0, listState === "loading" ? "加载中…" : "列表加载失败", { loading: listState === "loading" });
		}
		runMoveGhosts(movePlans);
		// 区域已有条目但列表仍在途时，在区头部显示行内加载指示（R-01-014/AC-01）。
		const headerEl = pane.querySelector(".dap-header");
		const recentHeadEl = recentSection?.querySelector(".dap-recent-head") ?? null;
		for (const [head, hasItems] of [[headerEl, active.length > 0], [recentHeadEl, recent.length > 0]]) {
			if (head === null) continue;
			const spin = head.querySelector(".dap-spinner");
			if (listState === "loading" && hasItems) {
				if (spin === null) head.prepend(makeEl("span", "dap-spinner"));
			} else {
				spin?.remove();
			}
		}

		// 计数与折叠：n/m 只统计主会话——分子为等待响应数、分母为其加运行中主会话之和
		// （R-01-001/AC-04、AC-05）；空态同样显示 0/0（AC-06）。
		const count = pane.querySelector(".dap-count");
		const railCount = pane.querySelector(".dap-rail-count");
		const { waiting, total } = awaitBadgeStats(active);
		const hasAwaiting = waiting > 0;
		const countText = `${waiting}/${total}`;
		const ariaText = hasAwaiting ? `${total} 个活动会话，${waiting} 个等待响应` : `${total} 个活动会话`;
		const awaitPeriod = awaitPulsePeriod(waiting, total);
		for (const el of [count, railCount])
			if (el !== null) {
				// 值未变不写文本节点/属性：aria-live 下相同赋值也会触发替换与重复播报。
				if (el.textContent !== countText) el.textContent = countText;
				el.toggleAttribute("data-awaiting", hasAwaiting);
				if (el.getAttribute("aria-label") !== ariaText) el.setAttribute("aria-label", ariaText);
				setAwaitPulsePeriod(el, awaitPeriod);
			}
		const toggleCount = toggle.querySelector(".dap-toggle-count");
		if (toggleCount !== null) {
			if (toggleCount.textContent !== countText) toggleCount.textContent = countText;
			toggle.toggleAttribute("data-awaiting", hasAwaiting);
			setAwaitPulsePeriod(toggleCount, awaitPeriod);
		}
		pane.toggleAttribute("data-collapsed", collapsed);
		const headerExpanded = collapsed ? "false" : "true";
		if (headerEl !== null && headerEl.getAttribute("aria-expanded") !== headerExpanded)
			headerEl.setAttribute("aria-expanded", headerExpanded);

		// 渲染签名在整轮 DOM 写入全部成功后提交：任何一步失败都保留下一轮
		// 同步重试的机会，避免故障被签名吞掉后卡片永久滞留（R-01-013/AC-02）。
		if (renderOk) {
			lastSig = sig;
			prevRenderedActiveIds = new Set(active.map((entry) => String(entry.id)));
		}
	}

	// ---- 打开会话（让 sessions.open 自己校验列表，失败时 refresh + 重试） ----
	const MAX_OPEN_ATTEMPTS = 60;
	function cardElFor(sessionId) {
		return document.querySelector(`[${PANE_ATTR}] [data-session-id="${escapeCssString(sessionId)}"]`);
	}
	function cancelOpenRetry(sessionId) {
		const state = openRetryStates.get(sessionId);
		if (state !== undefined) {
			state.cancelled = true;
			if (state.timer !== null) clearTimeout(state.timer);
			openRetryStates.delete(sessionId);
		}
		cardElFor(sessionId)?.removeAttribute("data-opening");
	}
	/** 按最新意图批量取消过期重试链：目标已到达（currentId 命中）或已被新激活取代。 */
	function cancelStaleOpenRetries({ currentId = null, activatedId = null } = {}) {
		for (const id of [...openRetryStates.keys()])
			if (shouldCancelOpenRetry({ targetId: id, currentId, activatedId })) cancelOpenRetry(id);
	}
	function scheduleOpenRetry(sessionId, attempt) {
		if (disposed || openRetryStates.has(sessionId)) return;
		const state = { cancelled: false, timer: null };
		openRetryStates.set(sessionId, state);
		let refreshed;
		try {
			refreshed = sessions?.refresh?.();
		} catch {}
		Promise.resolve(refreshed)
			.catch(() => {})
			.finally(() => {
				if (
					disposed ||
					state.cancelled ||
					openRetryStates.get(sessionId) !== state
				)
					return;
				state.timer = setTimeout(() => {
					if (disposed || state.cancelled) return;
					openRetryStates.delete(sessionId);
					attemptOpen(sessionId, attempt);
				}, 500);
			});
	}
	function attemptOpen(sessionId, attempt) {
		// 过期链条（目标已到达 / 已被新激活意图取代）不再发起 open，防止拽回会话。
		if (
			shouldCancelOpenRetry({
				targetId: sessionId,
				currentId: getSnapshot(sessions, "list")?.current ?? null,
				activatedId: lastActivatedId,
			})
		) {
			cancelOpenRetry(sessionId);
			return;
		}
		const el = cardElFor(sessionId);
		if (el !== null) el.setAttribute("data-opening", "");

		if (openSession(sessions, sessionId)) {
			// 移动视口下抑制原生 composer 在 sessionId 变化后的自动聚焦，
			// 避免切换会话弹出软键盘（桌面保持原生自动聚焦）。
			if (!desktopQuery.matches) suppressComposerAutofocus(document);
			// 到达新目标后取消全部剩余链条：任何旧链成功都会把会话从新目标拽走。
			cancelStaleOpenRetries({ activatedId: sessionId });
			cancelOpenRetry(sessionId);
			el?.removeAttribute("data-opening");
			return;
		}
		if (attempt < MAX_OPEN_ATTEMPTS) scheduleOpenRetry(sessionId, attempt + 1);
		else cancelOpenRetry(sessionId);
	}
	// ---- 观察者：只监听宿主结构与 conversation seat 的流式 DOM ----
	let bodyObserver = null;
	/** 祖先链观察者：center → body 逐级一个，任一级断裂即重装。 */
	let ancestorObservers = [];
	function disconnectAncestorObservers() {
		for (const observer of ancestorObservers) observer.disconnect();
		ancestorObservers = [];
	}
	let centerObserver = null;
	let conversationObserver = null;
	let observedCenter = null;
	let observedSeat = null;

	function installFrameObserver() {
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		const center = seat?.parentElement ?? null;
		if (center === null) {
			disconnectAncestorObservers();
			centerObserver?.disconnect();
			conversationObserver?.disconnect();
			centerObserver = null;
			conversationObserver = null;
			observedCenter = null;
			observedSeat = null;
			bodyObserver?.observe(document.body, { childList: true, subtree: true });
			return false;
		}
		if (center === observedCenter && seat === observedSeat) return true;

		disconnectAncestorObservers();
		centerObserver?.disconnect();
		conversationObserver?.disconnect();

		if (center.parentElement === null) {
			bodyObserver?.observe(document.body, { childList: true, subtree: true });
			return false;
		}
		// 观察 center → body 的整条祖先链：外壳替换任一级祖先（含高于 parent 的
		// 视图级重挂载）都会命中对应观察者，断裂即重装 + 重绘（GF2 自愈）。
		for (let ancestor = center.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
			const observer = new MutationObserver(() => {
				if (
					!center.isConnected ||
					document.querySelector(CONVERSATION_SELECTOR)?.parentElement !== center
				) {
					installFrameObserver();
					queueSync();
				}
			});
			observer.observe(ancestor, { childList: true });
			ancestorObservers.push(observer);
		}

		// 只观察 center 的直接子节点，捕获 seat/pane 重挂载，不观察 pane 子树。
		centerObserver = new MutationObserver(() => {
			const nextSeat = document.querySelector(CONVERSATION_SELECTOR);
			if (nextSeat?.parentElement !== center) installFrameObserver();
			queueSync();
		});
		centerObserver.observe(center, { childList: true });

		// 流式更新只来自会话 seat；pane 自身的文字/属性写入不会再触发重绘。
		conversationObserver = new MutationObserver(queueSync);
		conversationObserver.observe(seat, { childList: true, subtree: true });
		observedCenter = center;
		observedSeat = seat;
		bodyObserver?.disconnect();
		return true;
	}

	// 槽座迟到时用 DOM 通知唤醒一次；找到宿主后立即断开 body 全树观察。
	bodyObserver = new MutationObserver(() => {
		if (installFrameObserver()) queueSync();
	});
	bodyObserver.observe(document.body, { childList: true, subtree: true });
	installFrameObserver();

	// ---- 交互：移动端抽屉开关、弹窗收起、桌面折叠 ----
	function onToggleClick() {
		const pane = document.querySelector(`[${PANE_ATTR}]`);
		const open = pane?.getAttribute("data-open") !== "true";
		togglePane(open);
	}
	toggle.addEventListener("click", onToggleClick);
	// 透明遮罩位于抽屉与开关之下，能到达遮罩的点击均为抽屉外部，点击即收起。
	const unbindBackdrop = bindBackdropDismiss(backdrop, () => togglePane(false));
	const onResize = () => queueSync();
	desktopQuery.addEventListener("change", onResize);

	installServiceSubscriptions();
	queueSync();

	const cleanup = () => {
		disposed = true;
		sessionUnsubscribe?.();
		workspaceUnsubscribe?.();
		if (clockTimer !== null) clearInterval(clockTimer);
		for (const [, rec] of livenessById) {
			try {
				rec.unsubscribe?.();
			} catch {}
		}
		livenessById.clear();
		sessionOpenLoads.clear();
		loadQueue.length = 0;
		loadInflight = 0;
		for (const rec of cardsById.values()) rec.unbind?.();
		for (const rec of recentCardsById.values()) rec.unbind?.();
		cardsById.clear();
		recentCardsById.clear();
		for (const sessionId of openRetryStates.keys()) cancelOpenRetry(sessionId);
		openRetryStates.clear();
		unbindPaneControls?.();
		unbindPaneControls = null;
		boundPane = null;
		renderedPane = null;
		bodyObserver?.disconnect();
		disconnectAncestorObservers();
		centerObserver?.disconnect();
		conversationObserver?.disconnect();
		trackResizeObserver.disconnect();
		observedTrackList = null;
		// 卸载时取消未执行的滚动重对齐并清空轨道上下文，避免回调落到已移除列表。
		if (trackSyncHandle !== null) cancelAnimationFrame(trackSyncHandle);
		trackSyncHandle = null;
		trackContext = null;
		trackedLayer = null;
		trackEls.clear();
		for (const [id, ghost] of [...moveGhostsById]) removeMoveGhost(id, ghost);
		observedCenter = null;
		toggle.removeEventListener("click", onToggleClick);
		unbindBackdrop();
		backdrop.remove();
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
		toggle.remove();
		document.querySelector(`[${PANE_ATTR}]`)?.remove();
		style.remove();
		if (document[INSTANCE_KEY] === cleanup) delete document[INSTANCE_KEY];
		if (globalThis[INSTANCE_KEY] === cleanup) delete globalThis[INSTANCE_KEY];
	};
	document[INSTANCE_KEY] = cleanup;
	globalThis[INSTANCE_KEY] = cleanup;
	return cleanup;
}

module.exports = { name, inject, apply };
