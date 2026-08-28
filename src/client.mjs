// dsh-activity-pane 浏览器运行时。
//
// 挂载策略：把窗格作为 AppFrame 中 `conversation` 槽座的前置兄弟列插入
// （`#root [data-slot="conversation"] || .parentElement` 即 flex 行），让外壳的
// 让步链挤压中间栏；窄屏（<=767px）转为固定抽屉 + 浮动开关按钮。
//
// 数据来源：DSH 原生 `sessions` / `workspaces` 客户端服务（推送式快照）+ native
// `sessions.history` / `sessions.models` 冷会话读取 + 运行中会话的原生订阅
//（binding().session）+ 可选 `modelDirectories` 目录 store 订阅（模型选择实时更新，
// 缺失时回落一次性读取），不依赖任何第三方插件数据路由，也不做状态轮询。

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
/** 宿主侧完成确认 API 前缀（C-030）：acks 快照 / SSE 推送 / ack 写回，同源受信。 */
const ACK_API_BASE = "/dsh-activity-pane/api";
// 缩进槽宽：与连接线 CSS 几何耦合（left:-8px = INDENT_PX/2 缩进槽中线，
// top:-6px/bottom:-2px 对应 .dap-list 的 gap:6px），改任一数值须三处同步；
// scripts/check.mjs 有钉住断言。
const INDENT_PX = 16;
const MOBILE_BREAKPOINT = "767px";
/** 运行卡时钟：只要存在运行中会话，就以该周期刷新时长显示。 */
const CLOCK_MS = 1000;
/** 冷数据读取并发池上限：慢网下避免几十张卡片的 models/history 一次性挤占通道。 */
const LOAD_CONCURRENCY = 3;
/** 「回到顶部」悬浮按钮显隐阈值：scrollTop 超过该值（px）时显示（R-01-018/AC-01）。 */
const TOP_THRESHOLD = 200;

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
  padding: 0 7px;
}
[data-dsh-activity-pane] .dap-count[data-awaiting] {
  /* 底色/透明度与等待卡完全一致、无描边与外环（R-01-002/AC-06）；脉冲走亮度呼吸而非整体
     不透明度——半透明会让底色透进列头背景；周期由 --dap-await-period 驱动（AC-07）。
     任一等待行动即脉冲：三类等待行动行为一致（C-037）。
     底色跟随等待构成（C-040、C-043）：默认金（阻塞在即），tone=done 取完成提醒同款暗绿、
     tone=error 取错误提醒同款暗红（错误 > 阻塞 > 完成 优先级）。 */
  background: rgba(46, 42, 26, 0.97);
  animation: dap-await-pulse var(--dap-await-period, 1.6s) ease-in-out infinite;
}
[data-dsh-activity-pane] .dap-count[data-awaiting][data-tone="done"],
[data-dsh-activity-pane] .dap-rail-count[data-awaiting][data-tone="done"],
.dap-toggle[data-awaiting][data-tone="done"] .dap-toggle-count {
  background: rgba(32, 41, 35, 0.97);
}
[data-dsh-activity-pane] .dap-count[data-awaiting][data-tone="error"],
[data-dsh-activity-pane] .dap-rail-count[data-awaiting][data-tone="error"],
.dap-toggle[data-awaiting][data-tone="error"] .dap-toggle-count {
  background: rgba(40, 29, 31, 0.97);
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
/* 「回到顶部」悬浮图标按钮（R-01-018）：窗格内右下角圆形按钮，纯图标无文字、不透明底色；
   默认 hidden，scrollTop 超阈值时由滚动监听揭隐。基类 display:flex 会压过 UA 的
   [hidden] 规则，故显式补 [hidden] 隐藏。 */
[data-dsh-activity-pane] .dap-top {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: #1d1f25;
  color: inherit;
  cursor: pointer;
}
[data-dsh-activity-pane] .dap-top[hidden] { display: none; }
[data-dsh-activity-pane] .dap-top:hover,
[data-dsh-activity-pane] .dap-top:focus-visible {
  background: #262932;
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
  background: rgba(46, 42, 26, 0.97);
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
  [data-dsh-activity-pane][data-collapsed="true"] .dap-top { display: none; }
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
[data-dsh-activity-pane] .dap-card[data-kind="recent"] {
  padding: 6px 10px;
  border-radius: 12px;
  /* 弱化但可辨（R-01-013/AC-10、AC-11）：opacity 0.8 承载淡化；底色介于窗格底色与
     活动卡（rgba(29,31,37,0.94)）之间——暗于活动卡不抢视线、亮于背景可分辨，
     弱描边勾勒边界，淡化不得使卡片轮廓不可辨。 */
  background: rgba(26, 28, 34, 0.92);
  border-color: rgba(255, 255, 255, 0.08);
  opacity: 0.8;
}
[data-dsh-activity-pane] .dap-card[data-current] {
  border-color: color-mix(in srgb, #65a0ff 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);
}
/* 等待三类卡面按色彩语义分野（R-01-002/AC-03、AC-04、AC-13，C-040、C-043）：阻塞等待
   采用金色系催促尽快响应（自琥珀 #e8a33d 调亮调纯为金黄 #f5c542，底色同步提亮提黄——
   与旧琥珀底差异须一眼可辨，东家视觉反馈）；完成提醒采用绿色成功
   色系——深色取宿主 success 三级背景同款暗绿（green-900），底色仅保留轻微绿色色偏；
   错误提醒采用红色错误色系（与时间线错误分组行同源 #f06a72），警示会话出错。
   --dap-wait-color 供状态点与末行胶囊共用的类别色相。 */
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="blocked"],
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="done"],
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="error"] {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dap-wait-color) 35%, transparent), 0 6px 16px rgba(0,0,0,.3);
}
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="blocked"] {
  --dap-wait-color: #f5c542;
  border-color: color-mix(in srgb, #f5c542 55%, transparent);
  /* 金黄底：r/g 通道接近（明度较琥珀底更亮）、b 通道明显压低，扫一眼即金黄而非橙棕。 */
  background: rgba(46, 42, 26, 0.97);
}
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="done"] {
  --dap-wait-color: #58c98f;
  border-color: color-mix(in srgb, #58c98f 55%, transparent);
  /* 底色仅保留轻微绿色色偏（g 通道高于 r/b 均值约 +7.5，与金色面的暖偏同级），
     不用宿主 green-900 全饱和值——整卡大面积铺色时过绿过亮抢视线（东家视觉反馈）。 */
  background: rgba(32, 41, 35, 0.97);
}
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="error"] {
  --dap-wait-color: #f06a72;
  border-color: color-mix(in srgb, #f06a72 55%, transparent);
  background: rgba(40, 29, 31, 0.97);
}
/* 等待卡同为当前会话时描边/光晕回归蓝色高亮（R-01-006/AC-01）：基态 [data-current]
   与 [data-kind="awaiting"] 同优先级且定义在前，深色下被橙色描边顶掉；组合选择器
   （0-4-0）压过两者，深浅主题同值。等待状态仍由圆点、等待徽标与底色承载。 */
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-current] {
  border-color: color-mix(in srgb, #65a0ff 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);
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
/* 等待卡标题状态点静止（R-01-002/AC-08，C-040）：闪烁提醒已统一移至卡片末行，
   标题区不再抢眼；状态点只按等待类别着色——阻塞金、完成绿、错误红。 */
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"] .dap-dot {
  animation: none;
  background: var(--dap-wait-color, #58c98f);
  box-shadow: 0 0 8px color-mix(in srgb, var(--dap-wait-color, #58c98f) 85%, transparent);
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
/* 等待卡末行首行「类型胶囊」（R-01-002/AC-01、AC-02、AC-09、AC-13，C-043）：圆底类型
   图标 + 类型文字，色相随等待类别（--dap-wait-color）——阻塞金/完成绿/错误红；
   胶囊为行内元素不自占满宽，随文字内容收缩。 */
[data-dsh-activity-pane] .dap-capsule {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; line-height: 14px; font-weight: 600;
  color: color-mix(in srgb, var(--dap-wait-color, currentColor) 92%, transparent);
  background: color-mix(in srgb, var(--dap-wait-color, currentColor) 14%, transparent);
  border-radius: 999px; padding: 1px 8px 1px 3px;
}
/* 胶囊圆底类型图标：圆形底 + 12px 字形，与卡片其它图标尺度对齐。 */
[data-dsh-activity-pane] .dap-capsule-icon {
  width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--dap-wait-color, currentColor) 22%, transparent);
}
[data-dsh-activity-pane] .dap-capsule-icon:empty { display: none; }
[data-dsh-activity-pane] .dap-capsule-icon svg { display: block; width: 12px; height: 12px; }
/* 等待三类的末行脉冲（R-01-002/AC-08，C-043）：闪烁载体为卡片末行——类型胶囊与正文
   文字同频同相闪烁（三类一致）；「移入历史」按钮不闪。骨架挂载与 kind 重建路径下各元素
   天然同帧起步；原地跨类转换的相位对齐由渲染层在 data-wait 变化时同步重启（见 syncCards），
   标题状态点三类均静止。 */
[data-dsh-activity-pane] .dap-card[data-kind="awaiting"] .dap-foot :is(.dap-capsule, .dap-note) {
  animation: dap-pulse 1.2s ease-in-out infinite;
}
/* 复审修复（C-040、C-043）：状态点光晕三类同强度、仅换色相——阻塞金、完成绿与错误红光晕一致。 */
/* 工作区徽标「图标+文本」双段：文件夹图标与左边栏工作区条目同源（R-01-003/AC-06）；
   名称字号不低于 10.5px（AC-07），行高保持 14px 以维持胶囊与卡片高度。
   着色（AC-08～AC-11）：核心映射提供 OKLCH hue；深色主题文字取高明度中高彩度，
   浅色主题文字取低明度中高彩度。文字直接使用调色板色，底色与描边在 OKLCH
   空间按透明度混合；前景与背景始终同色相、明度对比拉开。 */
[data-dsh-activity-pane] .dap-workspace {
  width: fit-content; max-width: 100%; display: flex; align-items: center; gap: 3px;
  overflow: hidden;
  font-size: 10.5px; line-height: 14px;
  --dap-workspace-color: oklch(0.78 0.16 var(--dap-workspace-hue, 235));
  color: var(--dap-workspace-color);
  background: color-mix(in oklch, var(--dap-workspace-color) 14%, transparent);
  border: 1px solid color-mix(in oklch, var(--dap-workspace-color) 34%, transparent);
  border-radius: 999px; padding: 0 7px;
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-workspace {
  --dap-workspace-color: oklch(0.48 0.15 var(--dap-workspace-hue, 235));
  background: color-mix(in oklch, var(--dap-workspace-color) 10%, transparent);
  border-color: color-mix(in oklch, var(--dap-workspace-color) 28%, transparent);
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
  /* 多行正文（R-01-002/AC-09）：待回复卡的 Q 行列表以 \n 换行呈现（pre-line 保留
     换行符、折叠其余空白）；完成提醒/错误提醒等单行正文不受影响（无换行符时不产生新行）。 */
  min-width: 0; overflow: hidden; white-space: pre-line;
  font-size: 11px; line-height: 15px;
  color: color-mix(in srgb, currentColor 62%, transparent);
}
/* 等待卡末行两段容器（R-01-002/AC-08、AC-09、AC-13，C-043）：首行类型胶囊、其下为
   正文行（正文文字 + 完成提醒卡的「移入历史」按钮——胶囊与正文同闪，按钮不闪）。 */
[data-dsh-activity-pane] .dap-foot {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  min-width: 0; margin: 2px 0 0;
}
[data-dsh-activity-pane] .dap-note-row {
  display: flex; align-items: center; gap: 6px; min-width: 0; align-self: stretch;
}
[data-dsh-activity-pane] .dap-note-row .dap-note { flex: 1 1 auto; }
[data-dsh-activity-pane] .dap-confirm {
  flex: none; padding: 0 7px; margin: 1px 0;
  font-size: 10.5px; line-height: 16px;
  /* 次要按钮（东家视觉反馈）：文字压暗不与末行提示争抢，悬停略提仍可辨。 */
  color: color-mix(in srgb, currentColor 58%, transparent);
  background: color-mix(in srgb, currentColor 9%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 5px;
  cursor: pointer;
}
[data-dsh-activity-pane] .dap-confirm:hover {
  color: color-mix(in srgb, currentColor 82%, transparent);
  background: color-mix(in srgb, currentColor 14%, transparent);
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
  flex: none; width: 12px; height: 12px; display: inline-flex;
  align-items: center; justify-content: center;
}
[data-dsh-activity-pane] .dap-history-icon svg { display: block; width: 12px; height: 12px; }
[data-dsh-activity-pane] .dap-history-text {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-dsh-activity-pane] .dap-history-label { flex: none; }
[data-dsh-activity-pane] .dap-history-separator {
  width: 2px; height: 2px; flex: none; border-radius: 50%;
  background: #778394;
}
/* 动作时间线：纵向竖线串起圆点（对齐 answer-pet 的 .ap-session-trace，并修正几何细节——
   轨道列从卡片内容左边起步，和标题圆点/状态行/进度条共用左边界；竖线回收为容器级
   整条绘制，节点项只留圆点。时间线节点与 7px 标题点使用同尺寸承载盒（left:0、圆心
   x=3.5），和 1px 竖线保持同一跨 DPR 光栅相位；1px 半透明 border 在 7px 盒内留出
   5px 实心核，1px box-shadow 恢复小圆核外围的半透明环。1px 竖线 left:3px（圆心
   x=3.5），与圆点严格同圆心。竖线为容器
   ::before 单元素整条绘制（对齐层级连接线 .dap-conn-track 的零拼接原则，T-033）：
   逐项分段曾在接缝处双线叠加、半透明相加成亮带（T-069）。线从容器顶贯穿（穿过首个
   节点圆点并向上引出，表示更早历史被省略），bottom:7px 使终点没入最末圆点内部不外露；
   单项（含加载行）不画线；圆点高处盖线、位于内容区内不被子代理卡 overflow 裁切。 */
[data-dsh-activity-pane] .dap-trace {
  position: relative;   /* 容器级整条竖线的定位基准 */
  display: flex; flex-direction: column; gap: 3px;
  margin: 1px 0 2px;
  min-width: 0;
}
[data-dsh-activity-pane] .dap-trace:empty { display: none; }
/* 单条连续竖线（z-index 低于圆点）：行恒 14px + 间距 3px，最末圆心距容器底 7.5px，
   bottom:7px 使终点没入最末圆点实心核内不外露；:only-child 时无可连接的下一颗圆点，
   沿用原末项不画线语义。 */
[data-dsh-activity-pane] .dap-trace::before,
[data-dsh-activity-pane] .dap-subtrace::before {
  content: ""; position: absolute; left: 3px; top: 0; bottom: 7px;
  width: 1px; z-index: 0;
  background: rgba(126, 147, 177, .3);
}
[data-dsh-activity-pane] .dap-trace:has(> :only-child)::before,
[data-dsh-activity-pane] .dap-subtrace:has(> :only-child)::before { content: none; }
/* 用户消息行标识（C-019、C-022）：行下 1px 中性灰实线下划线，宽度仅为图标+文字的内容
 *  宽度（fit-content 收缩、超长仍按可用宽截断，不贯穿整行），深浅主题各自适配，
 *  不占用状态色（蓝=运行中、绿=完成、红=错误、橙=中断）；浅色主题在覆盖块中改色。
 *  以 bottom 1px 背景渐变画实线而非 border-bottom——border 会把 14px 行高撑成 15px，
 *  破坏圆点/竖线节奏；背景不占盒高。 */
[data-dsh-activity-pane] .dap-trace-item[data-icon="user"] .dap-trace-main {
  width: fit-content;
  max-width: 100%;
  background-image: linear-gradient(rgba(139, 152, 165, .55), rgba(139, 152, 165, .55));
  background-size: 100% 1px;
  background-position: bottom;
  background-repeat: no-repeat;
}
[data-dsh-activity-pane] .dap-trace-item {
  position: relative; display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 7px; min-width: 0;
  padding-left: 14px;   /* 左侧轨道：7px 承载盒、竖线与 7px 标题点共用圆心 x=3.5 */
  color: #c7ced9; font-size: 10px; line-height: 14px;
}
[data-dsh-activity-pane] .dap-trace-item::before {
  content: ""; position: absolute; left: 0; top: 3px;
  width: 7px; height: 7px;
  box-sizing: border-box; border: 1px solid rgba(119, 131, 148, .14); border-radius: 50%;
  z-index: 1;           /* 圆点盖在竖线上：竖线从圆点中穿过被其遮盖 */
  background: #778394; background-clip: padding-box;
  box-shadow: 0 0 0 1px rgba(119, 131, 148, .14);
}
[data-dsh-activity-pane] .dap-trace-item[data-status="running"]::before {
  background: #65a0ff; border-color: rgba(101,160,255,.16);
  box-shadow: 0 0 0 1px rgba(101,160,255,.16), 0 0 6px rgba(101,160,255,.65);
  animation: dap-pulse 1.15s ease-in-out infinite;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="done"]::before {
  background: #58c98f;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="error"]::before {
  background: #f06a72;
}
[data-dsh-activity-pane] .dap-trace-item[data-status="stopped"]::before {
  background: #f5a524;
}
/* 竖线不在节点项内分段自绘（接缝双线叠加成亮带，T-069），统一由上方容器 ::before
   整条绘制。 */
[data-dsh-activity-pane] .dap-trace-icon {
   width: 14px; height: 14px;   /* 真实 14px 盒：content-box 下 1px padding 会把盒撑成 16px、
                                   抬高时间线行并打破圆点/竖线的 14px 行高几何 */
   flex: none; display: inline-flex;
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
/* 子代理：同一节点项几何（轨道/圆点在项内自绘，竖线由容器 ::before 整条绘制）；
   去掉容器级 overflow/padding/border，避免把左侧圆点裁掉。文本截断由 .dap-trace-main
   自处理。 */
[data-dsh-activity-pane] .dap-subtrace {
  position: relative;   /* 容器级整条竖线的定位基准 */
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
  background: repeating-linear-gradient(90deg, #58c98f 0 10px, #3fbf86 10px 20px);
  background-size: 200% 100%;
  box-shadow: 0 0 7px rgba(88, 201, 143, 0.5);
  transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  /* 进度条仅存于运行卡骨架：会话运行全程持续向右滚动条纹，作为活动标志
     （对齐 answer-pet 的 ap-stripes，R-01-009/AC-08）。 */
  animation: dap-stripes 0.8s linear infinite;
}
@keyframes dap-stripes {
  from { background-position: 0 0; }
  to { background-position: 40px 0; }
}
@media (prefers-reduced-motion: reduce) {
  /* answer-pet 保留状态脉冲/进度条纹；仅关闭宽度过渡，避免状态反馈消失。 */
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
/* 数量标识加载指示：列表在途时三处徽标内显示活动图标（R-01-014/AC-06）。 */
[data-dsh-activity-pane] .dap-count .dap-spinner,
[data-dsh-activity-pane] .dap-rail-count .dap-spinner,
.dap-toggle .dap-toggle-count .dap-spinner {
  vertical-align: middle;
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
  background: color-mix(in srgb, currentColor 16%, transparent);
  padding: 0 5px; font-size: 10px; font-weight: 700;
}
.dap-toggle[data-awaiting] .dap-toggle-count {
  background: rgba(46, 42, 26, 0.97);
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
/* 活动区↔历史区迁移动画（R-01-010/AC-07、AC-10）：旧卡克隆 ghost 挂载于窗格元素内
   （卡片样式经 [data-dsh-activity-pane] 作用域自然生效），以 absolute 覆盖层从原矩形
   FLIP 平移并形变至目标区卡片矩形，到位后再淡出、真卡同步淡入；ghost 生命周期由
   transitionend 收口。迁移帧内位置受影响的其它卡片（含历史区段头）经 dap-shift
   反向位移平滑归位，不瞬间跳变。prefers-reduced-motion 时 JS 侧整体跳过（不创建
   ghost、不加 dap-move-in、不量取受影响卡片矩形）。 */
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
/* 受影响卡片 FLIP（R-01-010/AC-10）：JS 先以无过渡内联 transform 把元素钉回旧视觉
   位置，reflow 后挂本类并清除内联位移，经 transform 过渡平滑归位；与 ghost 同时长
   同缓动。.dap-card/.dap-recent-head 均无既有 transition 规则，本类不覆盖其它过渡。 */
[data-dsh-activity-pane] .dap-shift {
  transition: transform 0.3s ease;
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
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="subagent"] {
  background: var(--dsw-specific-sidebar-fill, rgb(249, 250, 251));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="recent"] {
  /* 暗于活动卡的 --dsw-alias-bg-layer-2 纯白、深于窗格底色（R-01-013/AC-10、AC-11）。 */
  background: rgb(243, 244, 246);
  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
}
/* 当前会话高亮（R-01-006/AC-01）：蓝色描边/光晕两主题同值，但浅色块必须在
   [data-kind] 覆盖之后重声明——浅色 .dap-card/:hover/[data-kind] 规则的优先级均高于
   基态 [data-current] 规则，不重声明则浅色下选中描边与光晕被顶掉。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-current] {
  border-color: color-mix(in srgb, #65a0ff 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);
}

body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="blocked"] {
  background: rgb(253, 244, 208);
}
/* 完成提醒卡浅色主题取宿主 success 三级背景别名（R-01-002/AC-04，C-040）：淡绿成功底。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="done"] {
  background: var(--dsw-alias-state-success-tertiary, rgb(230, 250, 237));
}
/* 错误提醒卡浅色主题：与深色错误红同源的淡红错误底（C-043）。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-card[data-kind="awaiting"][data-wait="error"] {
  background: rgb(252, 233, 234);
}
/* 数量徽标等待态浅色主题覆盖：默认金色跟随阻塞卡、tone=done 跟随完成卡别名、
  tone=error 跟随错误卡淡红（R-01-002/AC-06，无描边与外环）。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-count[data-awaiting],
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-rail-count[data-awaiting],
body:not([data-ds-dark-theme]) .dap-toggle[data-awaiting] .dap-toggle-count {
  background: rgb(253, 244, 208);
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-count[data-awaiting][data-tone="done"],
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-rail-count[data-awaiting][data-tone="done"],
body:not([data-ds-dark-theme]) .dap-toggle[data-awaiting][data-tone="done"] .dap-toggle-count {
  background: var(--dsw-alias-state-success-tertiary, rgb(230, 250, 237));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-count[data-awaiting][data-tone="error"],
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-rail-count[data-awaiting][data-tone="error"],
body:not([data-ds-dark-theme]) .dap-toggle[data-awaiting][data-tone="error"] .dap-toggle-count {
  background: rgb(252, 233, 234);
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
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-label {
  color: var(--dsw-alias-label-secondary, rgb(97, 102, 107));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-separator,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-history-separator {
  background: var(--dsw-alias-label-caption, rgb(173, 178, 184));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace::before,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-subtrace::before {
  background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-trace-item[data-icon="user"] .dap-trace-main {
  background-image: linear-gradient(var(--dsw-alias-label-tertiary, rgb(129, 133, 140)), var(--dsw-alias-label-tertiary, rgb(129, 133, 140)));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-track {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08));
}
body:not([data-ds-dark-theme]) .dap-toggle {
  background: var(--dsw-alias-button-floating-fill, rgba(255, 255, 255, 0.94));
}
/* 「回到顶部」图标按钮浅色覆盖：不透明层-2 底色与外壳描边别名（R-01-018/AC-05）。 */
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-top {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
}
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-top:hover,
body:not([data-ds-dark-theme]) [data-dsh-activity-pane] .dap-top:focus-visible {
  background: var(--dsw-alias-bg-layer-3, #eceef1);
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

/** Map 键数组兜底：非 Map 输入归一空数组（快照字段防御性读取）。 */
function mapKeys(value) {
	return value instanceof Map ? [...value.keys()] : [];
}

/** 从原生会话快照归一运行卡回合开始时间。
 *  elapsed 不在快照事件时固化——渲染期用 Date.now()-startTime 实时算，时长才能
 *  随 1s 时钟逐秒跳动（R-01-009/AC-03）。 */
function livenessFromSnapshot(snap) {
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
	return { startTime };
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
	// E2E-only deterministic seams（T-089/T-090）：显式 URL fragment 最多把本页首次列表 ready 呈现
	// 或正式 models RPC 延后 1s；默认路径为 0，不伪造服务响应、快照或生产时序。
	const e2eParams = new URLSearchParams(window.location.hash.slice(1));
	const requestedListDelay = Number(e2eParams.get("dap-e2e-list-delay"));
	const e2eListReadyAt = Number.isFinite(requestedListDelay) && requestedListDelay > 0
		? Date.now() + Math.min(requestedListDelay, 1_000)
		: 0;
	const requestedModelDelay = Number(e2eParams.get("dap-e2e-model-delay"));
	const e2eModelDelayMs = Number.isFinite(requestedModelDelay) && requestedModelDelay > 0
		? Math.min(requestedModelDelay, 1_000)
		: 0;
	let e2eListReleaseTimer = null;
	const e2eModelDelayWaiters = new Map();
	function delayedModelCall(call) {
		if (e2eModelDelayMs === 0) return Promise.resolve().then(call);
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				e2eModelDelayWaiters.delete(timer);
				resolve(disposed ? null : Promise.resolve().then(call));
			}, e2eModelDelayMs);
			e2eModelDelayWaiters.set(timer, resolve);
		});
	}
	let renderedPane = null;
	let boundPane = null;
	let unbindPaneControls = null;
	let collapsed = false;
	/** 当前桌面列宽：启动时从 localStorage 恢复，拖拽实时更新，重挂载后保留（R-01-015）。 */
	let paneWidth = readStoredPaneWidth();
	/** 用户最近一次激活的卡片 id；打开重试链被更新的激活意图取代即取消。 */
	let lastActivatedId = null;
	/** 完成确认状态（R-01-002/AC-03、AC-10～AC-12）：id → { lastTurnEnd, ackedAt }，
	 *  来自宿主侧 ack 通道（SSE 全量快照），随每次推送整体替换。 */
	const completeAcksById = new Map();
	/** 上一帧已提交渲染的活动区 id 集合：活动区→历史区迁移检测（R-01-010/AC-07）。 */
	let prevRenderedActiveIds = new Set();
	/** 上一帧已提交渲染的历史区 id 集合：历史区→活动区迁移检测（R-01-010/AC-07）。 */
	let prevRenderedRecentIds = new Set();
	/** 迁移中 ghost 元素集合（含 id 索引）：同一 id 再迁移时旧 ghost 移除，卸载时统一清理。 */
	const moveGhosts = new Set();
	const moveGhostsById = new Map();
	/** 在飞平移的元素级清理（元素 → transitionend 监听移除 + 类与内联位移复位）：
	 *  平移中再次迁移以当前视觉矩形为起点重启；prune 与卸载时同步取消（R-01-010/AC-10）。 */
	const shiftCleanups = new Map();
	/** 活动区卡片 id → { el, kind } 复用表。 */
	const cardsById = new Map();
	/** 历史区卡片 id → { el } 复用表。 */
	const recentCardsById = new Map();
	/** 运行中会话原生快照订阅：id → { unsubscribe, liveness, snapshot }。 */
	const livenessById = new Map();
	/** 委托周期进度锚点记账：id → progressAnchor 状态（R-01-009/AC-06）。 */
	const progressAnchorById = new Map();
	/** 订阅停止后保留最近快照，供 awaiting/recent 卡继续显示上下文。 */
	const sessionDetailsById = new Map();
	/** 会话跳转的单一重试链；避免重复点击叠加 refresh/timer。 */
	const openRetryStates = new Map();
	/** native cold-session model/history reads, one promise per session and no polling. */
	const modelLoads = new Map();
	const historyLoads = new Map();
	/** 模型目录订阅（R-01-012/AC-16）：id → unsubscribe；模型选择切换经原生
	 *  modelDirectories store 推送即时到达，随可见性清理/卸载先 unsubscribe 再除名。 */
	const modelDirectorySubs = new Map();
	/** native session.open() requests in flight; avoid duplicate cold history reads. */
	/** 冷数据读取并发池：队列顺序即优先级（调用方已排序），逐个完成逐个重绘。 */
	const loadQueue = [];
	let loadInflight = 0;
	function pumpDetailLoads() {
		while (loadInflight < LOAD_CONCURRENCY && loadQueue.length > 0) {
			const job = loadQueue.shift();
			loadInflight += 1;
			job().finally(() => {
				loadInflight = Math.max(0, loadInflight - 1);
				if (!disposed) pumpDetailLoads();
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

	// ---- 完成确认通道（R-01-002/AC-10～AC-12、R-01-010/AC-06，C-030） ----
	// SSE 订阅宿主侧 ack 状态：连接即收全量快照（刷新/重连恢复），此后每次变更
	// （任一客户端的确认、任一回合结束）推送新全量。无 EventSource 环境静默降级
	// 为无完成提醒（宿主侧不可用时插件其余功能不受影响）。
	// 移动 PWA 退后台时系统掐断连接，恢复时 EventSource 常以 CLOSED 终态落地不再
	// 自动重连（或半开死连接看似 OPEN 却不再收到广播），本地 ack 状态随之永久停滞；
	// 故回到前台时无条件重建连接——连接即收全量快照，各失效形态一并收敛
	// （R-01-002/AC-12 缺陷回归：完成等待中的会话曾被误判入历史区直至整页重载）。
	let acksSource = null;

	/** SSE 全量快照应用：解析成功才整体替换本地状态并重绘；坏帧静默丢弃。 */
	function applyAcksState(raw) {
		if (disposed) return;
		let state = null;
		try {
			state = JSON.parse(raw);
		} catch {
			state = null;
		}
		if (state === null || typeof state !== "object") return;
		completeAcksById.clear();
		for (const [id, record] of Object.entries(state)) {
			const lastTurnEnd = Number(record?.lastTurnEnd);
			if (Number.isFinite(lastTurnEnd) && lastTurnEnd > 0) {
				completeAcksById.set(String(id), {
					lastTurnEnd,
					lastTurnEndKind: typeof record?.lastTurnEndKind === "string" ? record.lastTurnEndKind : null,
					lastTurnEndError: typeof record?.lastTurnEndError === "string" ? record.lastTurnEndError : null,
					ackedAt: Number(record.ackedAt) || null,
				});
			}
		}
		queueSync();
	}

	/** （重）建 SSE 连接：先关闭旧连接再新建；连接即收宿主侧全量快照。 */
	function connectAcksStream() {
		try {
			acksSource?.close();
		} catch {}
		acksSource = null;
		if (disposed || typeof window.EventSource !== "function") return;
		try {
			const source = new window.EventSource(`${ACK_API_BASE}/acks/stream`);
			source.addEventListener("state", (event) => applyAcksState(event.data ?? ""));
			acksSource = source;
		} catch {
			acksSource = null;
		}
	}

	/** 回到前台（含 bfcache 还原）时 ack 通道自愈：重建 SSE，借连接全量快照收敛。 */
	function resumeAcksChannel() {
		if (!disposed) connectAcksStream();
	}
	const onVisibilityResume = () => {
		if (document.visibilityState === "visible") resumeAcksChannel();
	};
	const onPageShow = (event) => {
		if (event?.persisted === true) resumeAcksChannel();
	};
	document.addEventListener("visibilitychange", onVisibilityResume);
	window.addEventListener("pageshow", onPageShow);
	connectAcksStream();

	/** 确认写回（R-01-002/AC-10～AC-12）：乐观更新本地游标（签名驱动即时解除），
	 *  再 POST 宿主侧持久化并广播；写回失败回滚本地游标（提醒恢复），不吞异常。 */
	async function ackCompletion(sessionId) {
		const id = String(sessionId);
		const prev = completeAcksById.get(id) ?? null;
		completeAcksById.set(id, { ...prev, lastTurnEnd: prev?.lastTurnEnd ?? null, ackedAt: Date.now() });
		queueSync();
		try {
			const response = await fetch(`${ACK_API_BASE}/ack`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: id }),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
		} catch (error) {
			console.warn(`[dsh-activity-pane] 完成确认写回失败（${id}）:`, error);
			if (prev !== null) completeAcksById.set(id, prev);
			else completeAcksById.delete(id);
			queueSync();
		}
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

	/** 模型目录订阅（R-01-012/AC-16，C-024）：订阅原生 modelDirectories 服务的
	 *  per-session 目录 store（与主会话窗口模型选择器同源），同客户端切换模型选择
	 *  经 select() 成功即推送，到达即重归一模型上下文并就地重绘。
	 *  只订阅不 load()——load 会推进目录 generation 计数，与进行中的 select() 竞争
	 *  会致其更新被「最新操作胜出」规则丢弃；初值与失败语义沿用一次性 RPC 路径。
	 *  服务缺失、会话无 scope 或订阅失败时静默回落为纯一次性读取。 */
	function subscribeModelDirectory(id, detail) {
		if (modelDirectorySubs.has(id)) return;
		let directory = null;
		try {
			directory = ctx.get("modelDirectories")?.directoryFor?.(id) ?? null;
		} catch {
			directory = null; // 会话无 scope：回落一次性读取
		}
		if (directory === null) return;
		const syncFromDirectory = () => {
			if (disposed) return;
			const snap = directory.store?.getSnapshot?.();
			if (!snap?.current) return; // 目录未就绪：不覆写既有取值
			detail.models = { current: snap.current, groups: snap.groups ?? [] };
			detail.model = modelMetadata(detail.models);
			// 订阅已产值标记：晚到的一次性 RPC 快照不得回写切换前的旧值。
			detail.modelLive = true;
			queueSync();
		};
		let unsubscribe = null;
		try {
			unsubscribe = directory.store.subscribe(syncFromDirectory);
		} catch {
			return; // 订阅失败：保持一次性读取结果
		}
		modelDirectorySubs.set(id, unsubscribe);
		syncFromDirectory(); // 目录已被主窗口加载时立即同步，该会话免发一次性 RPC
	}

	function loadNativeDetails(ids, previewFallbackIds = new Set()) {
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
			const subagent = isSubagentRow(byId[id], byId);
			// 主会话先试模型目录订阅：store 已有当前选择时同步填充（随后 plan.model 为假、免发 RPC）；
			// 子代理的目录不可用（宿主以 agent-busy 拒绝其模型 RPC），不建立订阅。
			if (!subagent && e2eModelDelayMs === 0) subscribeModelDirectory(id, detail);
			const snapshotReady = detail.snapshot?.openState === "open";
			// 冷窗口兜底（R-01-009/AC-06、R-01-012/AC-12）：快照就绪但窗口缺开放回合起点
			// （超长回合的 turn/start 在尾页窗口之外；等待/空闲会话不算缺口）或缺可锚
			// 用户行时，补读一次 history。
			const turnStartMissing = openTurnStartMissing({
				snapshotReady,
				running: byId[id]?.running === true,
				hasLiveness: livenessById.has(id),
				liveStartTime: livenessById.get(id)?.liveness?.startTime ?? null,
			});
			const windowComplete = snapshotReady !== true || (!turnStartMissing && detail.snapshotHasAnchorableUserRow === true);
			const plan = detailLoadPlan({
				detail,
				isSubagent: subagent,
				snapshotReady,
				historyNeeded: needsHistorySnapshot(detail.snapshot),
				previewFallbackNeeded: previewFallbackIds.has(id),
				windowComplete,
				modelInflight: modelLoads.has(id),
				historyInflight: historyLoads.has(id) || sessionOpenLoads.has(id),
			});
			if (plan.subagent) {
				// 子代理的 models 读取必被宿主以 agent-busy 拒绝：直接留空，不发注定失败的 RPC。
				detail.model ??= { model: "", reasoning: "" };
			} else if (plan.model && typeof api.models === "function") {
				const promise = enqueueDetailLoad(() => delayedModelCall(() => api.models({ sessionId: id }))
					.then((response) => {
						const value = apiValue(response);
						if (!value) {
							if (!detail.modelLive) detail.model = { model: "", reasoning: "" };
							return;
						}
						// 目录订阅已产出更新的当前选择时，晚到的 RPC 快照不得回写旧值（R-01-012/AC-16）。
						if (detail.modelLive) return;
						detail.models = value;
						detail.model = modelMetadata(value);
					})
					.catch((error) => {
						if (!detail.modelLive) detail.model = { model: "", reasoning: "" };
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
				if (previewFallbackIds.has(id)) detail.previewFallbackLoaded = true;
				const promise = enqueueDetailLoad(() => Promise.resolve()
					.then(async () => {
						// 单池任务内串行回溯深翻（默认无页数上限）：向前翻到命中最近一条
						// 用户消息或翻尽为止——超长会话的最后用户消息可能在尾页窗口之外，
						// 固定页数上限会让历史卡用户预览永久缺失（R-01-013/AC-03 回溯承诺）。
						// 运行会话缺窗口内回合起点时要求深翻至命中开放回合 turn/start
						// （R-01-009/AC-06 冷窗口兜底）。
						const { events, error } = await pagedHistoryEvents({
							fetchPage: async (beforeSeq) => apiValue(await api.history({ sessionId: id, beforeSeq, maxMessages: 50 })),
							requireOpenTurnStart: turnStartMissing,
						});
						if (error) detail.historyError = error instanceof Error ? error.message : String(error);
						detail.history = events;
						// R-01-017：冷路径同样折叠分组（取全量页内事件再折成最多 4 组，
						// 含指令锚行窗口选择，R-01-012/AC-12～AC-15）。
						detail.timeline = foldedHistoryTimeline(events, 4, byId[id]?.cwd ?? "");
						detail.previews = messagePreviews({ history: events });
					}))
				historyLoads.set(id, promise);
				promise.finally(() => {
					if (historyLoads.get(id) === promise) historyLoads.delete(id);
				});
				historyPromises.push(promise);
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
		const topBtn = pane.querySelector(".dap-top");
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
		// 「回到顶部」按钮显隐单点（R-01-018/AC-01、AC-03）：scrollTop 超阈值显示、阈值内隐藏。
		const syncTopBtn = () => {
			if (topBtn !== null && scroll !== null) topBtn.hidden = scroll.scrollTop <= TOP_THRESHOLD;
		};
		const onRailClick = () => {
			collapsed = false;
			pane.setAttribute("data-collapsed", "false");
			notifyLayoutChange();
			// 折叠期间 display:none 可能令 scrollTop 归零而不派发 scroll 事件，展开时同步一次。
			syncTopBtn();
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
		// 同一监听承载「回到顶部」按钮显隐（R-01-018/AC-01、AC-03）：回顶后的收口不经额外事件，
		// 由平滑滚动触发的 scroll 事件自然完成。
		let scrollHideTimer = null;
		const onScroll = () => {
			queueTrackSync(); // 滚动停在小数相位后重对齐轨道层（rAF 合帧）
			scroll.setAttribute("data-scrolling", "");
			syncTopBtn();
			if (scrollHideTimer !== null) clearTimeout(scrollHideTimer);
			scrollHideTimer = setTimeout(() => {
				scrollHideTimer = null;
				scroll.removeAttribute("data-scrolling");
			}, 600);
		};
		// 「回到顶部」激活（R-01-018/AC-02）：reduced-motion 直接定位，否则平滑滚动；
		// 原生 <button> 的 Enter/Space 键盘激活与 click 同路径。
		const onTopClick = () => {
			scroll?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
		};
		header?.addEventListener("click", onHeaderActivate);
		header?.addEventListener("keydown", onHeaderKeydown);
		rail?.addEventListener("click", onRailClick);
		scroll?.addEventListener("scroll", onScroll, { passive: true });
		topBtn?.addEventListener("click", onTopClick);
		resize?.addEventListener("pointerdown", onResizeDown);
		return () => {
			header?.removeEventListener("click", onHeaderActivate);
			header?.removeEventListener("keydown", onHeaderKeydown);
			rail?.removeEventListener("click", onRailClick);
			scroll?.removeEventListener("scroll", onScroll);
			if (scrollHideTimer !== null) clearTimeout(scrollHideTimer);
			topBtn?.removeEventListener("click", onTopClick);
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
				<button class="dap-top" type="button" aria-label="回到顶部" title="回到顶部" hidden></button>
				<button class="dap-rail" type="button" aria-label="展开活动会话窗格">
					<span class="dap-rail-title" aria-hidden="true">活动会话</span>
					<span class="dap-rail-count" role="status" aria-live="polite"></span>
				</button>
				<div class="dap-resize" aria-hidden="true"></div>
			`;
			pane.style.setProperty("--dap-width", `${paneWidth}px`);
			// 「回到顶部」按钮为纯图标呈现（R-01-018/AC-05）：骨架无文字，图标在创建时注入。
			pane.querySelector(".dap-top").append(createTopIcon());
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

	/** 完成提醒卡「移入历史」按钮（R-01-002/AC-10，C-040）：默认隐藏，仅完成提醒卡显示；
	 *  文案本身即可访问名称；点击与键盘激活均不得触发卡片跳转（激活锚点在渲染期绑定）。 */
	function makeConfirmButton() {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "dap-confirm";
		button.hidden = true;
		button.textContent = "移入历史";
		return button;
	}

	/** 陈旧等待卡骨架就地迁移（C-043 热装兼容）：旧版末行为「正文行 + 行尾类型徽标」单行，
	 *  新版为「胶囊行 + 正文行」两段——把旧 noteRow 移入新的 .dap-foot 包裹并去掉行尾徽标，
	 *  confirm 按钮节点复用（已绑定的 ack 监听不丢）。 */
	function migrateAwaitingFoot(el) {
		const noteRow = el.querySelector(".dap-note-row");
		if (noteRow === null) return;
		noteRow.querySelector(".dap-badge")?.remove();
		const capsule = makeEl("div", "dap-capsule");
		capsule.append(makeEl("span", "dap-capsule-icon"), makeEl("span", "dap-capsule-text"));
		const foot = makeEl("div", "dap-foot");
		noteRow.replaceWith(foot);
		foot.append(capsule, noteRow);
	}

	/** 静态骨架卡片；动态文本一律走 textContent，规避 HTML 注入。 */
	function cardChildren(kind) {
		const head = makeEl("div", "dap-card-head");
		const workspace = makeEl("div", "dap-workspace");
		const workspaceIcon = makeEl("span", "dap-workspace-icon");
		workspaceIcon.append(createWorkspaceFolderIcon());
		workspace.append(workspaceIcon, makeEl("span", "dap-workspace-text"));
		head.append(workspace, makeEl("div", "dap-model"));
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
			const userLabel = makeEl("span", "dap-history-label");
			userLabel.textContent = "用户";
			userLine.append(userIcon, userLabel, makeEl("span", "dap-history-separator"), makeEl("span", "dap-history-text"));
			const agentLine = makeEl("div", "dap-history-line");
			agentLine.dataset.role = "agent";
			const agentIcon = makeEl("span", "dap-history-icon");
			agentIcon.append(createRobotIcon());
			const agentLabel = makeEl("span", "dap-history-label");
			agentLabel.textContent = "助手";
			agentLine.append(agentIcon, agentLabel, makeEl("span", "dap-history-separator"), makeEl("span", "dap-history-text"));
			return [head, row, userLine, agentLine, makeEl("div", "dap-note")];
		}
		if (kind === "awaiting") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			// 等待三类末行结构（R-01-002/AC-08、AC-09，C-043）：首行「类型胶囊」（圆底类型
			// 图标 + 类型文字），其下为正文行——阻塞/错误的说明文字，完成提醒的
			// 「继续对话，或移入历史」+ 行尾「移入历史」按钮。
			const capsule = makeEl("div", "dap-capsule");
			capsule.append(makeEl("span", "dap-capsule-icon"), makeEl("span", "dap-capsule-text"));
			// 正文行容器：正文文本 + 「移入历史」按钮（仅完成提醒卡显示，R-01-002/AC-10）。
			const noteRow = makeEl("div", "dap-note-row");
			noteRow.append(makeEl("div", "dap-note"), makeConfirmButton());
			const foot = makeEl("div", "dap-foot");
			foot.append(capsule, noteRow);
			return [head, row, makeEl("div", "dap-trace"), foot];
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

	/** 「回到顶部」按钮的向上箭头图标（canonical 图标集无现成箭头；
	 *  几何改编自 ISC 许可证的 Lucide arrow-up，归一到 14 盒——留白 24 盒由
	 *  R-01-012/AC-11 的机器人图标守卫全局禁用，与 C-021 同一来源声明）。 */
	function createTopIcon() {
		return createInlineIcon({
			viewBox: "0 0 14 14",
			width: 14,
			height: 14,
			parts: [
				{ attrs: { d: "M7 12.5V2", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" } },
				{ attrs: { d: "m2.5 6.5 4.5-4.5 4.5 4.5", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" } },
			],
		});
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

	/** agent 角色机器人图标（R-01-013/AC-08、R-01-012/AC-09）：canonical 图标集无现成机器人，
	 *  以 Lucide bot 图标几何（ISC 许可，来源声明见 LICENSE/README）为底改造，24 框描边风格：
	 *  去双耳、头顶单折线天线改为两条外撇斜短线（bilibili 小电视式）；viewBox 保持笔墨边界盒
	 * （1 3 22 18）——纵向墨迹 y4..21（短斜天线尖含描边触 y4），横向虽去耳收窄，保框使机身
	 *  显示尺度与其他 canonical 图标一致（R-01-012/AC-11），不因裁小框而变粗变大。
	 *  字形与其他时间线图标同用 12px 盒：13px 盒在 14px 图标盒内产生 0.5px 半像素居中偏移，
	 *  所有描边边缘落在物理像素之间被抗锯齿抹灰；stroke-width 2.2 使 12/22 缩放后渲染笔触
	 *  保持 1.2px，与 canonical 填充轮廓环（约 1px）视觉重量相当。 */
	function createRobotIcon() {
		const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round" };
		return createInlineIcon({
			viewBox: "1 3 22 18",
			parts: [
				{ attrs: { d: "M10 8L7 5M14 8L17 5", ...stroke } },
				{ tag: "rect", attrs: { x: "4", y: "8", width: "16", height: "12", rx: "2", ...stroke } },
				{ attrs: { d: "M15 13v2M9 13v2", ...stroke } },
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

	/* 胶囊类型种类（R-01-002/AC-01、AC-02、AC-09、AC-13，C-043）：阻塞待确认/待审查/问题、
	 * 完成提醒（对勾）与错误提醒（感叹号）；未知种类不给图标（不冒充已知类型）。 */
	const CAPSULE_ICON_KINDS = new Set(["approval", "plan-review", "question", "done", "error"]);

	/** 阻塞等待徽标类型图标（R-01-002/AC-01、AC-02）：通用几何自绘（对勾/文档/问号气泡），
	 *  stroke 风格与机器人图标一致；16 框、12px 字形盒，与卡片其它图标尺度对齐。 */
	function createPendingIcon(kind) {
		const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" };
		if (kind === "approval")
			return createInlineIcon({
				viewBox: "0 0 16 16",
				parts: [{ attrs: { d: "M3.5 8.8L6.8 12.1L12.6 4.3", ...stroke } }],
			});
		if (kind === "plan-review")
			return createInlineIcon({
				viewBox: "0 0 16 16",
				parts: [
					{ tag: "rect", attrs: { x: "4", y: "2.5", width: "8", height: "11", rx: "1.5", ...stroke } },
					{ attrs: { d: "M6.3 6.5h3.4M6.3 9.2h3.4", ...stroke } },
				],
			});
		// question：问号气泡（圆 + 问号钩 + 圆点）。
		return createInlineIcon({
			viewBox: "0 0 16 16",
			parts: [
				{ tag: "circle", attrs: { cx: "8", cy: "8", r: "5.9", ...stroke } },
				{ attrs: { d: "M6.6 6.1c.25-1.05 1.05-1.65 1.95-1.65 1.05 0 1.85.7 1.85 1.65 0 1.25-1.25 1.55-1.85 2.3v.35", ...stroke } },
				{ attrs: { d: "M8.55 11.4v.5", ...stroke } },
			],
		});
	}

	/** 等待卡类型胶囊图标（R-01-002/AC-09、AC-13，C-043）：done 复用对勾几何（与待确认同形、
	 *  靠胶囊与卡面颜色区分成功/确认语义），error 为感叹号气泡（圆 + 感叹号钩 + 圆点）；
	 *  其余走阻塞等待图标。 */
	function createCapsuleIcon(kind) {
		const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" };
		if (kind === "done")
			return createInlineIcon({
				viewBox: "0 0 16 16",
				parts: [{ attrs: { d: "M3.5 8.8L6.8 12.1L12.6 4.3", ...stroke } }],
			});
		if (kind === "error")
			return createInlineIcon({
				viewBox: "0 0 16 16",
				parts: [
					{ tag: "circle", attrs: { cx: "8", cy: "8", r: "5.9", ...stroke } },
					{ attrs: { d: "M8 5.2v3.5", ...stroke } },
					{ attrs: { d: "M8 11.4v.5", ...stroke } },
				],
			});
		return createPendingIcon(kind);
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
		// 与 core 思考语义判定同源的 truthy 谓词：detail（reasoning）存在即思考行，否则正文行。
		if (item.kind === "assistant") return item.detail ? createThinkIcon() : createRobotIcon();
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
			// data-icon 供 CSS 区分呈现：机器人正文行单设 "robot"（思考组/思考行 icon 同为 "assistant" 但渲染
			// 思考图标，不用机器人圆底；图标圆底仅限用户指令行与助手正文行）。
			line.dataset.icon =
				item.kind === "assistant" && item.fold !== true && !item.detail
					? "robot"
					: typeof item.icon === "string" ? item.icon : "other";
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

	/** 时间线区统一渲染：在途且无工作项时显示加载行，否则渲染工作项时间线。 */
	function renderTimelineArea(container, entry, { lastOnly = false } = {}) {
		if (entry.loadingTimeline === true && entry.timeline.length === 0) {
			renderTraceLoading(container);
			return;
		}
		if (container.dataset.loading === "true") delete container.dataset.loading;
		renderTrace(container, entry.timeline, { lastOnly });
	}

	function renderCardInto(el, entry, hueByWorkspace) {
		const workspaceLabel = el.querySelector(".dap-workspace");
		if (workspaceLabel !== null) {
			const workspaceText = workspaceLabel.querySelector(".dap-workspace-text");
			if (entry.workspaceTitle !== "") {
				if (workspaceText !== null) restoreTextField(workspaceText, entry.workspaceTitle);
				const hue = hueByWorkspace.get(entry.workspaceKey) ?? workspaceHue(entry.workspaceKey);
				const hueText = hue === null ? "" : String(hue);
				if (workspaceLabel.style.getPropertyValue("--dap-workspace-hue") !== hueText) {
					if (hue === null) workspaceLabel.style.removeProperty("--dap-workspace-hue");
					else workspaceLabel.style.setProperty("--dap-workspace-hue", hueText);
				}
				workspaceLabel.removeAttribute("hidden");
			} else {
				if (workspaceText !== null) restoreTextField(workspaceText, "");
				workspaceLabel.style.removeProperty("--dap-workspace-hue");
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

		const capsule = el.querySelector(".dap-capsule");
		// 陈旧骨架就地迁移（C-043 热装兼容）：旧版「正文行 + 行尾类型徽标」骨架升级为
		// 「胶囊行 + 正文行」；仅迁移等待卡且确认按钮节点复用（不丢已绑定的 ack 监听）。
		if (capsule === null && entry.kind === "awaiting" && el.querySelector(".dap-badge") !== null) {
			migrateAwaitingFoot(el);
		}
		if (capsule !== null || entry.kind === "awaiting") {
			// 胶囊文字：blocked=待确认/待审查/问题（pendingText），done=「已完成」，error=「错误」。
			const capsuleText = el.querySelector(".dap-capsule-text");
			const text =
				entry.waitClass === "blocked"
					? (entry.pendingText ?? "")
					: entry.waitClass === "done"
						? "已完成"
						: entry.waitClass === "error"
							? "错误"
							: "";
			if (capsuleText !== null && capsuleText.textContent !== text) capsuleText.textContent = text;
			// 胶囊前置圆形类型图标：blocked=对勾/文档/问号，done=对勾，error=感叹号。
			const iconHolder = el.querySelector(".dap-capsule-icon");
			const iconKind =
				entry.waitClass === "blocked"
					? CAPSULE_ICON_KINDS.has(entry.pendingKind)
						? entry.pendingKind
						: ""
					: entry.waitClass === "done"
						? "done"
						: entry.waitClass === "error"
							? "error"
							: "";
			if (iconHolder !== null && (iconHolder.dataset.kind ?? "") !== iconKind) {
				iconHolder.dataset.kind = iconKind;
				iconHolder.replaceChildren(...(iconKind === "" ? [] : [createCapsuleIcon(iconKind)]));
			}
		}

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
			const confirm = el.querySelector(".dap-confirm");
			if (confirm !== null) {
				// 激活锚点：只在结构重建时绑一次（卡片按 id 复用，kind 变化会重建骨架）。
				if (confirm.dataset.bound !== "true") {
					confirm.dataset.bound = "true";
					confirm.addEventListener("click", (event) => {
						event.preventDefault();
						event.stopPropagation(); // 阻断卡片激活（R-01-002/AC-10）
						const id = el.dataset.sessionId;
						if (id) ackCompletion(id);
					});
					// Enter/Space 由按钮原生合成 click；此处阻断其冒泡到卡片 keydown 激活。
					confirm.addEventListener("keydown", (event) => event.stopPropagation());
				}
				// 仅完成提醒（done）卡显示确认按钮；阻塞等待卡隐藏（其解除是真正回答）。
				confirm.hidden = entry.waitClass !== "done";
			}
		}

		const note = el.querySelector(".dap-note");
		if (note !== null) {
			const next =
				entry.kind === "awaiting"
					? (entry.noteText ?? "")
					: entry.kind === "recent"
						? fmtRecentTime(entry.activityAt)
						: "";
			if (note.textContent !== next) note.textContent = next;
		}
	}

	// ---- 轮内状态订阅生命周期（R-01-009、R-02-004） ----
	function syncLiveness(runningIds, clockWanted) {
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
		// 运行卡时钟：有运行呈现卡（含委托周期母会话）才启动，无则停。
		if (clockWanted && clockTimer === null) {
			clockTimer = setInterval(() => queueSync(), CLOCK_MS);
		} else if (!clockWanted && clockTimer !== null) {
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

	/** 数量标识内容写入（R-01-014/AC-06）：加载态显示活动指示——已是指示则不重写，
	 *  避免每轮 replaceChildren 重启动画抖动；计数态恢复文本写入，textContent 赋值自动摘除指示。 */
	function setCountBadgeContent(el, badge) {
		if (badge.mode === "loading") {
			const spinner = el.firstElementChild;
			if (!(el.childNodes.length === 1 && spinner !== null && spinner.classList.contains("dap-spinner")))
				el.replaceChildren(makeEl("span", "dap-spinner"));
		} else if (el.textContent !== badge.text) {
			// 值未变不写文本节点：aria-live 下相同赋值也会触发替换与重复播报。
			el.textContent = badge.text;
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
	function renderCardIntoList(list, entry, reuseMap, index, offset, hueByWorkspace) {
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
		// 等待三类（R-01-002/AC-08、AC-13，C-043）：blocked=阻塞等待（金色卡面、胶囊+正文闪烁），
		// done=完成提醒（绿色成功卡面、胶囊+正文闪烁、按钮不闪），error=错误提醒（红色卡面、
		// 胶囊+正文闪烁、无按钮）。
		const prevWait = rec.el.getAttribute("data-wait");
		if (entry.waitClass === "blocked" || entry.waitClass === "done" || entry.waitClass === "error")
			rec.el.setAttribute("data-wait", entry.waitClass);
		else rec.el.removeAttribute("data-wait");
		if (
			(entry.waitClass === "blocked" || entry.waitClass === "done" || entry.waitClass === "error") &&
			prevWait !== null && prevWait !== "" && prevWait !== entry.waitClass
		) {
			// 原地跨类转换（done↔blocked↔error）：卡片骨架按 id 复用不重建，胶囊与正文的
			// 动画不会自行归零而类型图标经 replaceChildren 会重新起步——一并重启对齐相位，
			// 同频同相不漂移（R-01-002/AC-08；骨架挂载/kind 重建路径天然同帧无需处理）。
			for (const node of rec.el.querySelectorAll(".dap-foot .dap-capsule, .dap-foot .dap-note")) {
				node.style.animation = "none";
				void node.offsetWidth;
				node.style.animation = "";
			}
		}
		rec.el.setAttribute(
			"aria-label",
			`${entry.workspaceTitle ? entry.workspaceTitle + " - " : ""}${entry.title}${
				entry.pendingText ? "，" + entry.pendingText : ""
			}${(entry.waitClass === "done" || entry.waitClass === "error") && entry.noteText ? "，" + entry.noteText : ""}`,
		);
		renderCardInto(rec.el, entry, hueByWorkspace);
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
			cancelShift(rec.el);
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

	/** 取消元素在飞平移：移除 transitionend 监听、过渡类与内联位移（瞬时不渐变）。
	 *  平移中再次迁移时以当前视觉矩形为起点重启前调用；prune 与卸载时同步调用。 */
	function cancelShift(el) {
		const cleanup = shiftCleanups.get(el);
		if (cleanup === undefined) return;
		el.removeEventListener("transitionend", cleanup);
		el.classList.remove("dap-shift");
		el.style.transform = "";
		shiftCleanups.delete(el);
	}

	/** 迁移动画前半（DOM 写入前）：量取迁出卡矩形（换算为窗格相对坐标）并克隆
	 *  ghost；ghost 挂载于窗格元素内，卡片样式经作用域自然生效。migrations 为双向
	 *  迁移计划 [{ id, from, to }]，from/to 分别为源/目标卡池（R-01-010/AC-07）。 */
	function prepareMoveGhosts(migrations) {
		if (migrations.length === 0 || disposed || prefersReducedMotion()) return [];
		const paneRect = renderedPane?.getBoundingClientRect?.();
		if (paneRect == null) return [];
		const plans = [];
		for (const { id, from, to } of migrations) {
			const source = from.get(id)?.el;
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
			plans.push({ id, to, ghost, left: rect.left - paneRect.left, top: rect.top - paneRect.top });
		}
		return plans;
	}

	/** 迁移动画后半（DOM 写入后）：量取目标区卡片矩形，rAF 内启动 FLIP 平移并形变至
	 *  目标矩形，到位后淡出、真卡淡入；目标不可量取时直接落位（克隆未挂载，无需清理）。
	 *  transitionend 收口，不引入定时器。 */
	function runMoveGhosts(plans) {
		const paneRect = renderedPane?.getBoundingClientRect?.();
		if (paneRect == null) return;
		for (const plan of plans) {
			const target = plan.to.get(plan.id)?.el;
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

	/** 受影响卡片 FLIP 前半（DOM 写入前，R-01-010/AC-10）：量取两卡池全部现存卡片与
	 *  历史区段头的当前视觉矩形（含在飞平移的 transform 位移，重启时从视觉位置续接）。
	 *  零尺寸（整段隐藏等）不量取：无从滑起的元素不做动画。 */
	function snapshotShiftRects() {
		const rects = new Map();
		for (const pool of [cardsById, recentCardsById]) {
			for (const rec of pool.values()) {
				const rect = rec.el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) rects.set(rec.el, rect);
			}
		}
		const head = renderedPane?.querySelector(".dap-recent-head") ?? null;
		if (head !== null) {
			const rect = head.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) rects.set(head, rect);
		}
		return rects;
	}

	/** 受影响卡片 FLIP 后半（DOM 写入后，R-01-010/AC-10）：仍连接且位置变化的元素先
	 *  以无过渡内联 transform 钉回旧视觉位置，reflow 后挂 dap-shift 并清除内联位移，
	 *  经 transform 过渡平滑归位；transitionend（once）收口。目标零尺寸（整段转隐藏）
	 *  或位置未变时跳过。迁移卡的新元素不在量取集合内（由 ghost + 淡入承担呈现）。 */
	function runShiftAnimations(preRects) {
		for (const [el, pre] of preRects) {
			if (!el.isConnected) continue;
			// 平移中再次迁移：先取消旧平移（含监听，元素瞬回布局位），再量取新布局矩形——
			// 否则 post 会混入在飞 transform 位移，反向位移量算错。
			cancelShift(el);
			const post = el.getBoundingClientRect();
			if (post.width <= 0 || post.height <= 0) continue;
			const dx = pre.left - post.left;
			const dy = pre.top - post.top;
			if (dx === 0 && dy === 0) continue;
			// 以刚量取的旧视觉矩形为起点重启：先无过渡钉回，reflow 后挂过渡类归零。
			el.style.transform = `translate(${dx}px, ${dy}px)`;
			void el.offsetWidth;
			el.classList.add("dap-shift");
			el.style.transform = "";
			// transitionend 冒泡隔离：子元素过渡（如运行卡进度条 .dap-fill 的 width
			// 0.45s transition）的 transitionend 会冒泡到卡片，不过滤则平移中途被
			// 提前收口、卡片瞬时跳到终点（违背 R-01-010/AC-10）；只收口本元素
			// transform 过渡，命中后手动移除监听（once 会被冒泡事件空耗，不可用）。
			const cleanup = (event) => {
				if (event.target !== el || event.propertyName !== "transform") return;
				el.removeEventListener("transitionend", cleanup);
				el.classList.remove("dap-shift");
				shiftCleanups.delete(el);
			};
			shiftCleanups.set(el, cleanup);
			el.addEventListener("transitionend", cleanup);
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
			prevRenderedRecentIds = new Set();
			// 旧窗格已脱离文档：其在飞平移的 transitionend 不再触发，逐元素取消避免残留。
			for (const el of [...shiftCleanups.keys()]) cancelShift(el);
		}
		applyLayout();
		const activeList = pane.querySelector(`.${LIST_CLASS}`);
		const recentSection = pane.querySelector(`.${RECENT_CLASS}`);
		if (activeList === null || recentSection === null) return;

		let snapshot = getSnapshot(sessions, "list");
		if (e2eListReadyAt > Date.now() && snapshot?.phase !== "error") {
			snapshot = { phase: "pending" };
			if (e2eListReleaseTimer === null) {
				e2eListReleaseTimer = setTimeout(() => {
					e2eListReleaseTimer = null;
					queueSync();
				}, Math.max(0, e2eListReadyAt - Date.now()));
			}
		}
		const listState = listLoadState(snapshot);
		const workspaceSnapshot = getSnapshot(workspaces, "list");
		const workspaceItems = workspaceSnapshot?.items ?? [];
		const archivedSessionIds = workspaceSnapshot?.archivedSessionIds ?? [];
		const now = Date.now();

		// 委托周期集合（R-01-003/AC-05）：由上一帧 progressAnchor 记账派生——后代耗尽
		// 至 settle 处理回合启动的空窗内，母会话保持运行呈现且不入历史区（分区不变量）。
		const delegatingIds = new Set();
		for (const [id, state] of progressAnchorById) {
			if (delegationActive(state, now)) delegatingIds.add(id);
		}
		const active = buildEntries(snapshot, workspaceItems, sessionDetailsById, completeAcksById, delegatingIds);
		// 轮内订阅仅对"运行中"会话建立（主会话 + 运行中的子代理），保持在运行中的订阅
		// 数量 == 运行中会话数量（R-02-004/AC-01）；暂停等待的子代理只显示标题。
		const runLikeIds = new Set(
			active.filter((entry) => shouldSubscribeToSession(entry, snapshot?.byId ?? {})).map((entry) => entry.id),
		);
		syncLiveness(runLikeIds, active.some((entry) => entry.kind === "running"));
		for (const entry of active) {
			const liveRecord = livenessById.get(entry.id);
			const live = liveRecord?.liveness ?? null;
			const detail = sessionDetailsById.get(entry.id);
			const detailSnapshot = liveRecord?.snapshot ?? detail?.snapshot ?? null;
			if (detail && detail.memoHistoryAnchorOf !== (detail.history ?? null)) {
				detail.memoHistoryAnchorOf = detail.history ?? null;
				detail.memoHistoryAnchor = historyInstructionAnchor(detail.history);
			}
			if (detail && detailSnapshot) {
				// 按快照引用 memo：引用不变（时钟 tick、无关推送）时命中缓存，
				// 长会话不再每次渲染全序扫描。
				const entryCwd = snapshot?.byId?.[entry.id]?.cwd ?? "";
				// 等待/暂停呈现（pendingText 存在）且自身快照为冻结值时，残留 running 行全部落定；
				// 存在活动后代时保留尾部提升的「agent 工作中」呈现（R-01-009/AC-10 委托周期语义）。
				const entryIdle = (entry.pendingText ?? null) !== null && entry.descendantActive !== true;
				if (detail.memoTimelineOf !== detailSnapshot || detail.memoTimelineCwd !== entryCwd || detail.memoTimelineDescendantActive !== (entry.descendantActive === true) || detail.memoTimelineIdle !== entryIdle || detail.memoTimelineAnchor !== (detail.memoHistoryAnchor ?? null)) {
					detail.memoTimelineOf = detailSnapshot;
					detail.memoTimelineCwd = entryCwd;
					detail.memoTimelineDescendantActive = entry.descendantActive === true;
					detail.memoTimelineIdle = entryIdle;
					detail.memoTimelineAnchor = detail.memoHistoryAnchor ?? null;
					detail.memoTimeline = foldedConversationTimeline(detailSnapshot, 4, entryCwd, entry.descendantActive === true, entryIdle, detail.memoTimelineAnchor);
					// 冷窗口兜底触发记账（R-01-012/AC-12）：窗口内有可锚用户行时锚行机制保证其
					// 出现在输出（窗口行或锚行），反之需 history 补读。
					detail.snapshotHasAnchorableUserRow = detail.memoTimeline.some(isAnchorableUserRow);
				}
				entry.timeline = detail.memoTimeline.length > 0 ? detail.memoTimeline : detail.timeline ?? [];
			} else {
				entry.timeline = detail?.timeline ?? entry.timeline ?? [];
			}
			if (detail) {
				// history 开放回合起点兜底（R-01-009/AC-06）。
				if (detail.memoOpenTurnStartHistoryOf !== (detail.history ?? null) || detail.memoOpenTurnStartSnapOf !== detailSnapshot) {
					detail.memoOpenTurnStartHistoryOf = detail.history ?? null;
					detail.memoOpenTurnStartSnapOf = detailSnapshot;
					// minTurn 取快照已知最晚回合号（partial/turnTimings/turnEnds）：history 拉取
					// 后若已切换新回合，旧开放回合起点判为陈旧不采用。
					const partialTurn = detailSnapshot?.partial?.turn;
					const hint = Math.max(
						0,
						Number.isFinite(partialTurn) ? partialTurn : 0,
						...mapKeys(detailSnapshot?.turnTimings),
						...mapKeys(detailSnapshot?.turnEnds),
					);
					detail.memoOpenTurnStart = openTurnStartFromEvents(detail.history, hint);
				}
			}
			if (detail?.model) {
				entry.model = detail.model.model;
				entry.reasoning = detail.model.reasoning;
			}
			// 待回复卡末行补全（C-040 缺陷修复）：noteText 在 buildEntries 时以当时的
			// details.timeline 派生，而快照路径的时间线在上面的循环里才按引用 memo 算出
			// （首帧之前为空/旧值）；等待卡静止后常无下一帧重绘，提问标题将永远停留在
			// 动作回落文案。时间线就绪后用同一核心纯函数对 question 卡重新求值；
			// noteText 并入 cardSignature，值变化自然驱动本帧 DOM 写入。
			// （history 冷路径异步到达本身携带一次 queueSync 重绘，不受此缺陷影响。）
			if (entry.kind === "awaiting" && entry.waitClass === "blocked" && entry.pendingKind === "question") {
				const question = timelineQuestionPreview(entry.timeline);
				if (typeof question === "string" && question !== "" && question !== entry.noteText)
					entry.noteText = awaitNoteText("blocked", "question", question);
			}
			// 字段级加载指示（R-01-014/AC-02）：补充数据在途时卡片对应位置显示活动图标。
			entry.loadingModel = !detail?.model && modelLoads.has(entry.id);
			entry.loadingTimeline =
				entry.timeline.length === 0 &&
				(historyLoads.has(entry.id) || sessionOpenLoads.has(entry.id) || (runLikeIds.has(entry.id) && !liveRecord));
			// token/速率取自 sessions.list 条目的投影（tokenUsage/sessionStats），
			// 复用既有列表订阅，无新增轮询（R-01-009/AC-05、R-02-004/AC-02）。
			const projection = snapshot?.byId?.[entry.id]?.projectionValues;
			const stats = projection?.sessionStats;
			const rateTokS =
				stats && Number.isFinite(stats.decodeMs) && stats.decodeMs > 0
					? stats.decodeTokens / (stats.decodeMs / 1000)
					: null;
			// 委托周期锚点（R-01-009/AC-06）：全部活动条目逐帧记账——锚点不因呈现翻转
			// （委托期与 awaiting 互转）或瞬时不可见而丢失，仅 dispose 时整体清除；周期内
			// 进度连续（含 settle 处理回合），周期外由宿主回合起点驱动（新回合归零）。
			// 半衰期不记入锚点（C-044）：每帧按最新实测累计速率现算，进度作为对完成度
			// 的实时估计允许随速率回落而回退。
			// 冷窗口兜底：快照 turnTimings 无开放回合起点（超长回合 turn/start 在尾页窗口
			// 之外）时，取 history 深翻提取的开放回合起点。
			const anchor = progressAnchor(progressAnchorById.get(entry.id) ?? null, {
				descendantActive: entry.descendantActive === true,
				hostStartTime: live?.startTime ?? detail?.memoOpenTurnStart ?? null,
				now,
			});
			progressAnchorById.set(entry.id, anchor);
			if (entry.kind === "running") {
				const elapsedMs = Number.isFinite(anchor.anchor) ? Math.max(0, now - anchor.anchor) : null;
				const outputTokens = projection?.tokenUsage?.outputTokens ?? null;
				Object.assign(entry, runtimeStats({ elapsedMs, outputTokens, rateTokS }));
				Object.assign(entry, usageSummary(projection?.tokenUsage ?? {}));
				// 回合进度：纯时间驱动 y = t/(t+k)，半衰期每帧按最新实测速率现算，固定
				// k 下单调性由函数本身保证；k 变化时允许进度随速率回落而回退（委托周期
				// 连续、周期外回合切换归零，R-01-009/AC-06，C-014、C-044）。
				entry.progress = progressOf({ elapsedMs: elapsedMs ?? 0, halfLifeSec: progressHalfLifeSec({ rateTokS }) });
			}
		}
		// 历史区时间精化（R-01-010/AC-08、AC-09）：从保留快照的 turnTimings 与已拉取的
		// history 同批事件提取最后回合结束时刻（取两者较新者），按引用 memo；均无则不提供，
		// 由 buildRecent 回退宿主列表时间。history/快照到达后经 queueSync 重绘就地精化。
		const turnEnds = {};
		for (const [id, detail] of sessionDetailsById) {
			const detailSnapshot = livenessById.get(id)?.snapshot ?? detail.snapshot ?? null;
			if (detail.memoTurnEndSnapshotOf !== detailSnapshot || detail.memoTurnEndHistoryOf !== (detail.history ?? null)) {
				detail.memoTurnEndSnapshotOf = detailSnapshot;
				detail.memoTurnEndHistoryOf = detail.history ?? null;
				const ends = [lastTurnEndFromTimings(detailSnapshot?.turnTimings), lastTurnEndFromEvents(detail.history)].filter((v) => v !== null);
				detail.memoTurnEnd = ends.length > 0 ? Math.max(...ends) : null;
			}
			if (detail.memoTurnEnd != null) turnEnds[id] = detail.memoTurnEnd;
		}
		const recent = buildRecent(snapshot, workspaceItems, now, undefined, sessionDetailsById, archivedSessionIds, completeAcksById, delegatingIds, turnEnds);
		// 预览只对 recent 卡计算（活动卡不显示预览）；快照/历史引用不变时命中缓存。
		// 完成瞬间的窗口快照可能先有用户消息、后到 agent reply；缺任一预览时补读一次 history。
		const previewFallbackIds = new Set();
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
			if (!entry.userPreview || !entry.agentPreview) previewFallbackIds.add(entry.id);
			entry.loadingPreviews = (!entry.userPreview || !entry.agentPreview) && historyLoads.has(entry.id);
		}
		// 补充数据读取优先级：当前会话最优先，活动区先于历史区（区内按显示顺序）。
		const detailIds = [...active, ...recent].map((entry) => entry.id);
		detailIds.sort((a, b) => Number(String(b) === String(snapshot?.current)) - Number(String(a) === String(snapshot?.current)));
		loadNativeDetails(detailIds, previewFallbackIds);
		const visibleIds = new Set([...active, ...recent].map((entry) => entry.id));
		// 详情与 loads 记账同生命周期：离开可见集合即放行，重回可见时允许重拉/重试。
		// 锚点记账不随可见性 prune：瞬时 loading 空帧不得误清（进度重置）；陈旧条目靠
		// 耗尽宽限与 turnStart 不匹配自校正，仅在 dispose 时整体清除。
		pruneInvisibleEntries([sessionDetailsById, modelLoads, historyLoads, sessionOpenLoads], visibleIds);
		// 模型目录订阅同生命周期：不可见即先 unsubscribe 再除名，监听器不残留（R-01-012/AC-16）。
		pruneSubscriptions(modelDirectorySubs, visibleIds);
		// 重试链目标已成为当前会话（他途到达）即取消，避免过期链条拽回会话。
		cancelStaleOpenRetries({ currentId: snapshot?.current ?? null, activatedId: lastActivatedId });

		const visibleEntries = [...active, ...recent];
		// listState 参与签名：空列表从 pending/error → ready 时卡集合不变，若只比较卡片
		// 会被提前返回冻结在「加载中」/「列表加载失败」；状态转换同样是可观察渲染输入。
		const sig = JSON.stringify([listState, cardSignature(visibleEntries)]);
		if (sig === lastSig) return;
		const hueByWorkspace = resolveWorkspaceHues(visibleEntries.map((entry) => entry.workspaceKey));
		// 跨区迁移（双向，R-01-010/AC-07）：DOM 写入前量取旧卡矩形并克隆 ghost。
		const migrations = [
			...movedToRecentIds(prevRenderedActiveIds, active, recent).map((id) => ({ id, from: cardsById, to: recentCardsById })),
			...movedToActiveIds(prevRenderedRecentIds, active, recent).map((id) => ({ id, from: recentCardsById, to: cardsById })),
		];
		const movePlans = prepareMoveGhosts(migrations);
		// 迁移帧内位置受影响的其它卡片与历史区段头：DOM 写入前量取当前视觉矩形
		// （R-01-010/AC-10）；reduced-motion 下 movePlans 为空，FLIP 量取整体跳过。
		const shiftRects = movePlans.length > 0 ? snapshotShiftRects() : null;

		// 逐卡异常隔离：一张卡渲染抛错不得冻结其余卡片（此前签名先于循环提交，
		// 故障卡及其后全部卡片永久滞留旧内容——历史卡因此停在过去的首条消息
		// fallback 标题，与左侧栏脱节）；本轮有失败则不提交签名，下一次同步整体
		// 重试——瞬时异常自愈，持续异常只滞留故障卡本身（R-01-013/AC-02）。
		let renderOk = true;
		const aliveActive = new Set();
		for (const [index, entry] of active.entries()) {
			try {
				renderCardIntoList(activeList, entry, cardsById, index, 1, hueByWorkspace);
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
				renderCardIntoList(recentSection, entry, recentCardsById, index, 1, hueByWorkspace);
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
		if (shiftRects !== null) runShiftAnimations(shiftRects);
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

		// 计数与折叠：n/m 只统计主会话——分子为等待行动数、分母为其加运行中主会话之和
		// （R-01-001/AC-04、AC-05）；空态同样显示 0/0（AC-06）。列表在途时不冒充计数，
		// 三处数量标识显示加载指示（R-01-014/AC-06）。脉冲由 data-awaiting 承载：
		// 任一等待行动（阻塞等待、完成提醒或错误提醒）即脉冲（R-01-002/AC-06，C-037）；
		// 底色经 data-tone 跟随等待构成——错误 > 阻塞 > 完成 优先级取红/金/绿（C-040、C-043）。
		const count = pane.querySelector(".dap-count");
		const railCount = pane.querySelector(".dap-rail-count");
		const { waiting, blocked, total } = awaitBadgeStats(active);
		const badge = countBadgeState(listState, waiting, total, blocked);
		const awaitPeriod = badge.awaiting ? awaitPulsePeriod(waiting, total) : null;
		const badgeTone = awaitBadgeTone(active);
		for (const el of [count, railCount])
			if (el !== null) {
				setCountBadgeContent(el, badge);
				el.toggleAttribute("data-awaiting", badge.awaiting);
				if (badge.awaiting && badgeTone !== null) el.setAttribute("data-tone", badgeTone);
				else el.removeAttribute("data-tone");
				if (el.getAttribute("aria-label") !== badge.ariaText) el.setAttribute("aria-label", badge.ariaText);
				setAwaitPulsePeriod(el, awaitPeriod);
			}
		const toggleCount = toggle.querySelector(".dap-toggle-count");
		if (toggleCount !== null) {
			setCountBadgeContent(toggleCount, badge);
			toggle.toggleAttribute("data-awaiting", badge.awaiting);
			if (badge.awaiting && badgeTone !== null) toggle.setAttribute("data-tone", badgeTone);
			else toggle.removeAttribute("data-tone");
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
			prevRenderedRecentIds = new Set(recent.map((entry) => String(entry.id)));
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
		acksSource?.close();
		acksSource = null;
		document.removeEventListener("visibilitychange", onVisibilityResume);
		window.removeEventListener("pageshow", onPageShow);
		completeAcksById.clear();
		if (clockTimer !== null) clearInterval(clockTimer);
		if (e2eListReleaseTimer !== null) clearTimeout(e2eListReleaseTimer);
		for (const [timer, resolve] of e2eModelDelayWaiters) {
			clearTimeout(timer);
			resolve(null);
		}
		e2eModelDelayWaiters.clear();
		for (const [, rec] of livenessById) {
			try {
				rec.unsubscribe?.();
			} catch {}
		}
		livenessById.clear();
		// 卸载即全量退订：空可见集合驱动 pruneSubscriptions 先 unsubscribe 再除名。
		pruneSubscriptions(modelDirectorySubs, new Set());
		progressAnchorById.clear();
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
		for (const el of [...shiftCleanups.keys()]) cancelShift(el);
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
