---
doc-type: task
mutation: lifecycle
id: T-160
---

# T-160 移动端「活动」开关嵌入宿主头部标题行

状态: active
关联: R-01-008/AC-04、R-01-008/AC-05 / 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈：移动端「活动」浮动开关（`position:fixed; top:12px; left:44px`，挂 body）遮住宿主头部会话标题 crumb 按钮（隔离环境 Playwright `elementsFromPoint` 实测开关正下方为 `BUTTON.crumb.crumbCurrent`），违背 R-01-008/AC-04「不遮挡会话内容与其它界面控件」。

历史：T-029 因遮右侧栏切换按钮组把开关从 `right:12px` 移到 `left:44px`，该坐标按当时侧栏切换按钮 28px 宽硬编码；宿主侧栏切换按钮现为 36×36（x=10），中列头部标题行自 76px 起，固定坐标再次失配。根因是浮层覆盖式呈现对第三方几何的持续追赶。

经东家确认（方案闸口 2026-10-09）：开关常态嵌入宿主头部标题行作为布局子项参与排布；打开抽屉时嵌入态以 `visibility:hidden` 留位隐藏（标题行不重排）。

## 差距评估

- `src/client.mjs`：`.dap-toggle` 为 fixed 浮层，无落位守卫；需新增嵌入态 CSS 与 `placeToggle` 守卫并挂入 `ensurePane`。
- `SOLUTION.md`：161/608/819 行描述 fixed 坐标机制，需随实现同步。
- `scripts/check.mjs`：4451–4458 行 bundle 契约断言绑定 fixed 坐标与注释旧几何（28px），需改写为嵌入机制断言。
- `e2e/specs/mobile-drawer.mjs`：AC-04 仅断言文案与视口内几何，无嵌入与不遮挡回归断言；AC-05 无留位语义断言。
- `scripts/acceptance.mjs`：AC-04 人工步骤措辞需同步。
- `RATIONALE.md`：嵌入 vs 换位浮层的取舍需记 C-087。
- 数据层、桌面形态、抽屉/遮罩交互均不变。

## 收敛方案

- CSS：`.dap-toggle` 保留 fixed 作为兜底形态（默认 `left:44px`）；新增 `.dap-toggle[data-embedded] { position: static; margin-right: 8px; flex: none; }`；媒体查询内新增 `.dap-toggle[data-embedded][data-drawer-open] { display: flex; visibility: hidden; }`（嵌入态打开抽屉留位，`visibility` 不可见不可命中，满足 AC-05），兜底形态维持 `display:none`。
- JS：`placeToggle()` 幂等落位守卫，挂 `ensurePane()` 首行（渲染路径与开关点击补绑路径共用）。
  - 锚点为 seat 域 `header` 的首个子行；插入点在行内 crumb 导航所在顶层簇之前。
  - 宿主若把侧栏切换按钮放进行内，插入点天然在其右侧；导航缺席时退化为行首。
  - 命中目标位置不动 DOM；行不可得时挂回 body、移除 `data-embedded`。
  - 兜底 `left` 经 sidebar 槽位首个按钮（当前宿主即侧栏切换钮）实测右缘 + 8px 写入，右缘为 0（隐藏/未渲染）或元素缺席视同测不到，清回 CSS 默认 44px。
  - 头部位于 seat 子树内，宿主重渲染由既有 `conversationObserver` 唤醒 `queueSync` 后守卫重插，无需新观察者。
- 卸载契约不变：`toggle.remove()` 对任意父级生效。
- `SOLUTION.md`、`scripts/check.mjs`、`e2e/specs/mobile-drawer.mjs`、`scripts/acceptance.mjs`、`RATIONALE.md` 按上文同步。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言——兜底 fixed 形态存在、`data-embedded` 规则存在、嵌入态留位规则存在、落位写入与兜底锚点字符串存在、不再位于右上角、文案「活动」（锚定 R-01-008/AC-04、AC-05）。
- `e2e/specs/mobile-drawer.mjs`：AC-04 新增——开关为宿主头部标题行布局子项（`data-embedded` + 父行为标题行）、位于会话标题 crumb 之前（相对顺序，不断言行首）、视口内其它可交互元素矩形与开关矩形不相交、兜底分支（移除头部后回退 body fixed、兜底 left 按侧栏按钮实测右缘或回落 CSS 默认 44px、兜底态下外部点击收起与开关点击展开仍可用）；AC-05 新增——嵌入态打开抽屉时 `boundingBox` 仍在原位（留位）且不可见。
- `scripts/acceptance.mjs`：AC-04 人工步骤改为嵌入观感与真机头部拥挤度验收。
- `pnpm build:client && pnpm check`；`pnpm verify:fast`；全量 `pnpm verify`（含移动端抽屉 E2E）；隔离环境 Playwright 探针复核嵌入几何与截图。
- 独立 Standards/Spec review（code-review skill）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | 证据面演进（AC 正文不变，验证机制由坐标断言改嵌入断言） | UNIT/E2E/MANUAL | update | `scripts/check.mjs` 嵌入机制契约断言；`e2e/specs/mobile-drawer.mjs` 嵌入/相对顺序/不遮挡/兜底落位断言；`scripts/acceptance.mjs` 人工步骤同步 |
| R-01-008/AC-05 | 证据面演进（AC 正文不变，隐藏语义按形态细分） | UNIT/E2E | update | `scripts/check.mjs` 留位规则断言；`e2e/specs/mobile-drawer.mjs` 嵌入态留位断言 |
| SOLUTION | 移动端开关机制段由 fixed 坐标呈现改为嵌入布局子项（C-087） | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关嵌入宿主头部标题行参与布局、位于 crumb 之前、不与任何可交互元素相交；文案「活动」；抽屉打开时留位隐藏、关闭恢复 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：宿主头部不可得（视图替换窗口期）回退 fixed 兜底形态、兜底 left 按侧栏按钮实测右缘落位，开关仍可见可点、点击补绑路径不回归 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-05` |
| 边界配置 | 适用：桌面断点外开关由媒体查询隐藏（嵌入节点 display:none 无布局影响）；无侧栏切换按钮时兜底 left 回落 CSS 默认 44px | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::placeToggle` |
| 副作用 | 适用：抽屉/遮罩/卡片交互不变，卸载从嵌入位置移除不残留，落位守卫幂等不自激渲染循环 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::cleanup` |

## 终态与证据

（待实现完成后填写）
