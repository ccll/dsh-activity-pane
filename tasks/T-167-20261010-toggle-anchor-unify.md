---
doc-type: task
mutation: lifecycle
id: T-167
---

# T-167 开关去除兜底浮层：嵌入态层级归位 + hero 页锚定展开按钮右侧

状态: completed
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家 iOS Safari 真机反馈：点开宿主左边栏抽屉时开关浮在抽屉上方，抽屉完全展开后才突然消失。探针复现（WebKit + iPhone UA + 触屏 + 390×844，临时 profile 加装 dsh-web-mobile@3.0.0）定位根因：

- 层级逃逸：`.dap-toggle` 基规则声明 `z-index: 2147482991`；嵌入态仅覆盖 `position: static`，而按钮是标题行（flex 容器）子项——按 CSS Flexbox 规范 flex 子项的 z-index 即使 static 也生效并创建 stacking context，2147482991 压过移动壳层抽屉（dsh-web-mobile 抽屉列 z-index:1300、transform .28s 滑入）与遮罩（1250）。探针逐帧证实抽屉与按钮重叠后 `elementFromPoint` 仍命中按钮。
- 显隐时序：T-165 的 `data-host-drawer-open` 隐藏依赖 pointer 事件触发的「rAF 首帧 + 400ms 复检」离散检测，判据 `x > -10` 在 transform 滑入最后约 3% 才为真；400ms 复检落在动画结束后，`visibility` 突变即东家看到的「完全展开后才突然消失」。
- 兜底形态本身是 fixed 独立图层（T-166 贴靠成组仅改位置未改层级），且静默降级掩盖嵌入失败。

东家决策：按层级归位修复；去除兜底浮层；英雄页/空白会话（宿主 `data-phase="hero"`）仍保留入口，落位于宿主侧栏展开按钮右侧（⊡，dsh-web-mobile 语义属性 `data-mobile-nav="fab"`/`"toggle"`）；两落位均不可得时不渲染（fail-visible）。

已探明约束（探针与壳层源码）：

- hero 页无布局流容器：⊡ 为 AppFrame grid 直接子元素（壳层 `frame.appendChild`，绕开 React 管辖的 `shell.overlay` 层），grid 列被压成 `minmax(0,1fr) 0 0`、行恒 `100%`，static 插入会进隐式行破坏布局。
- 会话页贴靠不可行：壳层仅给 ⊡ 留位 40px（layout.css.ts:795-812），标题簇从 x=40 起，64px 胶囊贴靠会压住宿主标题；现状流内嵌入观感即「⊡ 右侧」（⊡ 8~36、按钮 40~104）。

## 差距评估

- `src/client.mjs` CSS：基规则 `position: fixed; top: 12px; left: 44px; z-index: 2147482991` 为兜底形态载体与层级逃逸根源；嵌入态未清层级。
- `src/client.mjs` `placeToggle`：兜底分支（body + fixed + 两级锚点回退）需替换为 hero 贴靠分支；无锚时需摘除开关。
- `scripts/check.mjs`：兜底形态断言（fixed 缺省位、锚点两级、display:none 显隐）需改写为 hero 贴靠断言。
- `e2e/specs/mobile-drawer.mjs`：兜底分支段（移除 header 强制兜底）需改写为不渲染断言。
- PRD R-01-008/AC-04 回退条款与 SOLUTION 开关机制段同步（东家确认的需求变更）。

## 收敛方案

- `src/client.mjs` `placeToggle`：嵌入分支保持（标题行行首）。
- `src/client.mjs` `placeToggle`：新增 hero 贴靠分支。
  - 锚为 `button[data-mobile-nav="toggle"], button[data-mobile-nav="fab"]` 首个在屏者（判据 `ON_SCREEN_X`）。
  - 挂载点取 `[data-shell-overlay]` 的 parentElement（宿主语义属性，与壳层 findFrame 同源）。
  - 内联钉 `position:absolute`、`top`（锚矩形垂直居中）、`left`（锚右缘 + 8px），写入 `data-hero`。
  - 锚或挂载点不可得时 `toggle.remove()`。
- 初始创建不再挂 body：开关仅在落位时进入 DOM（未落位即不渲染）。
- CSS：基规则去除 `position:fixed; top; left; z-index:2147482991`。
- CSS：嵌入态补 `z-index: 1`（flex 子项 z-index 生效，1 免疫宿主 header 内定位装饰）。
- CSS：hero 态 `z-index: 1060`（低于壳层遮罩 1250、抽屉 1300、宿主菜单 1100，等同页面内容层）。
- CSS：移动断点显示改为 `data-embedded`/`data-hero` 属性驱动。
- CSS：`data-drawer-open` 统一 `visibility:hidden` 留位隐藏（pointer-events 同步摘除）。
- 删除兜底锚点两级回退逻辑（sidebar 槽位按钮 → 祖先链按钮）。
- PRD R-01-008/AC-04 回退子句改写（东家确认）；SOLUTION 开关机制段同步；RATIONALE 增 C-093；DOMAIN 视需要补词条。

## 测试计划

- `scripts/check.mjs`：层级断言（嵌入态 z 低于宿主覆盖层、hero 态 z 同）、hero 锚断言（语义属性、右缘 +8、垂直居中）、不渲染断言、显隐统一断言。
- `e2e/specs/mobile-drawer.mjs`：兜底段改写为不渲染断言；嵌入段断言保持。
- `e2e/specs/loading-ready.mjs`：注入模拟 ⊡ 锚镜像部署环境（pending 加载指示覆盖保持）。
- `e2e/specs/mobile-drawer.mjs`：补 hero 态摘除后经宿主抽屉检测路径恢复落位回归（Spec 审核发现的恢复缺口）。
- 帧状态观察（恢复缺口修复的第二层）：键盘 Escape 与滑动手势关抽屉不派发 pointer 事件，pointer 检测覆盖不到；`armFrameObserver` 以 MutationObserver 观察 frame 的 `data-sidebar-collapsed` 翻转（壳层抽屉状态机本体），翻转即检 + 400ms 复检（壳层重挂 ⊡ 晚于属性翻转，仅翻转即检会扑空）；按元素记挂（外壳重挂载换挂）、随 cleanup 摘除，回调无轮询成本。部署壳层探针验证：抽屉打开期间开关摘除、Escape 关抽屉后恢复贴靠。
- `e2e/helpers.mjs`：新增 `injectMobileFabAnchor`（模拟 ⊡ 锚注入，幂等重试）。
- 说明：模拟锚注入在 loading-ready 的浏览器 init script 上下文内联、在 mobile-drawer 经 helpers 共用——init script 无法引用 Node 侧函数，重复为结构性。
- 说明：hero 分支不设嵌入式幂等早退——贴靠几何须随 ⊡ 实测刷新（窗口缩放/壳层重排），10Hz 渲染节流下重写同值成本可忽略。
- `pnpm verify:fast`；全量 `pnpm verify`；探针复验（会话页滑入遮挡、hero 贴靠几何与遮挡、无锚不渲染）。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：会话页嵌入标题行行首、hero 页贴靠 ⊡ 右侧、宿主抽屉滑入遮挡开关、关闭恢复 | `scripts/check.mjs#R-01-008/AC-04`、`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| 异常 | 适用：锚按钮与标题行均不可得时开关不渲染；宿主改版使 1060/40px 判据失真时开关或被遮挡或暴露缺失（不再浮于抽屉之上） | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：仅移动断点内生效；dsh-web-mobile 缺席的环境 hero 页不渲染（会话页嵌入不受影响）；阈值 1060/锚语义属性耦合壳层改版 | `scripts/check.mjs#R-01-008/AC-04`、`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| 副作用 | 适用：无 rAF 新增（T-165 离散检测保留、其复检点各补一次落位重跑）、cleanup 对称、嵌入态 z-index:1 与 hero 态 1060 均不创建高于宿主覆盖层的层级 | `scripts/check.mjs#R-01-008/AC-05`、`e2e/specs/mobile-thermal.mjs::mobileThermal` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | 回退子句改写（fixed 浮层回退与左上角缺省 → hero 贴靠与不渲染），AC 主句不变 | UNIT/E2E | update | `scripts/check.mjs#R-01-008/AC-04`；`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| R-01-008/AC-05 | 实现加固（嵌入态与 hero 态统一留位隐藏 + pointer-events 摘除），AC 正文不变 | UNIT/E2E | update | `scripts/check.mjs#R-01-008/AC-05`；`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| R-01-014/AC-06 | 测试影响（spec 镜像部署环境：e2e 壳层无 dsh-web-mobile，注入模拟 ⊡ 锚承载 hero 贴靠落位），AC 正文不变 | E2E | update | `e2e/specs/loading-ready.mjs::loadingReady` |
| SOLUTION | 开关机制段更新（层级归位、hero 贴靠、不渲染、统一留位隐藏）；调宽手柄段兜底句同步 | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |
| PRD | AC-04 回退子句改写（东家会话确认：去除兜底、hero 贴靠 ⊡ 右侧、无落位不渲染） | UNIT/E2E | update | `scripts/check.mjs#R-01-008/AC-04`；`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| RATIONALE | 增 C-093（去除兜底浮层决策与被否方案） | - | add | 同次变化由本 task 记录 |
| DOMAIN | 增词条「宿主侧栏展开按钮」 | - | add | 同次变化由本 task 记录：新词汇先登记再使用 |

## 终态与证据

- 实现: `src/client.mjs` CSS 基规则去除 `position:fixed/top/left/z-index:2147482991`（层级逃逸根因，flex 子项 z-index 即使 static 也生效）；嵌入态补 `z-index:1`；hero 态 `z-index:1060`（页面内容层，低于壳层遮罩 1250/抽屉 1300/菜单 1100）；移动断点显隐改 `data-embedded`/`data-hero` 属性驱动，`data-drawer-open` 统一 `visibility:hidden` 留位并摘除 pointer-events；`placeToggle` 删除 fixed 兜底与两级锚点回退，新增 hero 贴靠分支（锚 `data-mobile-nav="toggle"/"fab"` 首个在屏者、挂 `[data-shell-overlay]` 的 parentElement、内联钉锚右缘 +8 并垂直居中），两落位不可得时 `toggle.remove()`；开关不预挂 DOM；`scheduleHostDrawerCheck` 两个复检点补 `placeToggle()`（含 disposed 防护）；`armFrameObserver` 以 MutationObserver 观察 frame `data-sidebar-collapsed` 翻转（翻转即检 + 400ms 复检、按元素记挂、随 cleanup 摘除）承载键盘/手势关抽屉后的恢复。PRD R-01-008/AC-04 回退子句改写（东家确认）；SOLUTION 开关机制段同步；RATIONALE 增 C-093；DOMAIN 增词条「宿主侧栏展开按钮」。commit: 8b04847（实现）、75e2de8（文档拆分）
- 测试: `pnpm verify` 全绿（最终 bundle，20/20 e2e specs）；`scripts/check.mjs` 新增断言全绿（层级归位、hero 锚语义属性、右缘 +8/垂直居中、不渲染、帧观察器、disposed 防护）；部署壳层探针实测：会话页抽屉滑入后按钮命中从 TOGGLE 变抽屉内容（被逐步遮挡）、hero 贴靠 gap=8 垂直居中 z=1060、抽屉打开期间摘除、Escape 关抽屉后恢复贴靠；e2e 新回归：hero 贴靠几何/不渲染/摘除后经宿主抽屉检测路径恢复。真机最终观感留东家人工验收。
- SOLUTION 对照: 开关机制段（层级归位、hero 贴靠、不渲染、统一留位隐藏、恢复唤醒点）与实现一致；PRD AC-04 主句不变、回退子句承载新语义；C-093 与 DOMAIN 词条登记完整。
- commit: 8b04847
- review:
  - 审核方: Standards 子代理 `c588ae18-e7de-4ef8-a5ca-f0031dc0a0c5`；Spec 子代理 `b18a5535-1eec-4f90-bc8c-fdc4f6a7d083`。
  - 目的理解: 东家 iOS Safari 真机抽屉滑入时开关浮于其上、完全展开后突变消失；根因为开关高层级 z-index 在嵌入态（flex 子项）依然生效逃逸宿主抽屉之上，兜底浮层本身即独立图层且静默降级掩盖嵌入失败；约束为层级归位、去除兜底、hero 页贴靠宿主侧栏展开按钮右侧、两落位不可得不渲染、锚不耦合宿主哈希类、cleanup 对称、无新增 rAF。
  - 执行方式: `code-review` skill 双轴并行（Standards/Spec），固定基线 HEAD=5293a17，范围为工作树 diff；Spec 轴两轮复审（恢复缺口修复复审 + disposed 防护复审）。
  - 问题与修复: Standards 一轮 2 hard + 4 项——注释层级数值口径矛盾（统一为遮罩 1250/抽屉 1300/菜单 1100，1400 为抽屉打开时宿主浮层抬升值并注明）、模拟锚几何证据出处缺失（spec 注释补 dsh-web-mobile base.css.ts 实现值与 T-166 实测）、isConnected 冗余（删）、check.mjs 重复断言（删）、模拟锚注入两处重复（抽 helpers；loading-ready 的 init script 上下文无法引用 Node 侧函数，结构性内联记录）、同题两解（统一 helpers 语义）。Spec 一轮 1 实质 + 2 轻——(c)1 hero 态摘除后恢复缺口（两层修复：pointer 复检点补落位守卫 + frame 属性翻转观察器，探针实测 Escape 路径恢复）；复审发现新缺陷（挂起 rAF/400ms 回调无 disposed 防护致 cleanup 后孤儿按钮）→ 两处回调补守卫，复审实核异步调用点全覆盖后关闭；hero 分支幂等早退维持不加（几何须随 ⊡ 刷新，效率取舍记录）。
  - 复审结论: Spec 轴 (c)1 关闭确认（disposed 守卫就位、孤儿复活窗口闭合、全部异步调用点无遗漏）；Standards 硬违规清零；残余风险：Escape/手势恢复路径无 e2e（部署壳层探针 + 静态断言承载）、hero z 1060 与锚语义属性耦合壳层契约（注释与验证矩阵记录为边界）。
