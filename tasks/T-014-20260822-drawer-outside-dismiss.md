---
doc-type: task
id: T-014
mutation: lifecycle
---

# T-014 移动端抽屉外部点击收起

风险等级: standard
状态: active

## 背景与目标

- 背景: 移动端抽屉（≤767px，`position:fixed` 滑入）目前只能经浮动开关按钮或抽屉头 × 收起；点击抽屉外部区域无任何响应。东家要求补齐「点击外部区域也能关闭抽屉」的交互，并确认采用透明遮罩方案（PRD R-01-008/AC-03）。
- 目标: 抽屉打开时显示透明全屏遮罩，点击遮罩收起抽屉；开合状态收敛为单点写入，重复挂载与卸载完整清理遮罩元素与监听。
- 非目标: 不改变抽屉外观（遮罩完全透明）、不改变桌面形态与折叠行为、不改变卡片交互、不修改 DSH 宿主。

## 差距评估

- 现状基线:
  - `togglePane(open)` 写 `data-open`；抽屉头 × 的 `onCloseClick` 直接 `setAttribute`，开合存在两个写入点。
  - 无遮罩、无 document 级监听，点击抽屉外部不产生任何行为。
  - `apply()` 重复挂载清理选择器只覆盖 pane/toggle/style。
- 目标差距:
  - 新增透明遮罩元素，z-index 介于主会话与抽屉（2147482990）之间，浮动开关（2147482991）位于其上。
  - 开合状态单点写入并同步遮罩显隐；遮罩点击收起抽屉。
  - 重复挂载清理与卸载清理覆盖遮罩。

## 收敛方案

1. `src/navigation.mjs` 新增 `bindBackdropDismiss(backdrop, dismiss)`：绑定遮罩 `click`（preventDefault/stopPropagation 后回调收起），返回卸载函数；无 DOM 假设，可 Node 单测。
2. `src/client.mjs`：
   - CSS 新增 `.dap-backdrop`（`position:fixed; inset:0; display:none`，z-index 2147482989，透明背景）；`@media (max-width: 767px)` 下 `[data-drawer-open]` 时 `display:block`，桌面断点外由媒体查询保持隐藏。
   - `apply()` 创建遮罩元素挂 `document.body`；`togglePane(open)` 同步 `data-open` 与 `data-drawer-open`；`onCloseClick` 改经 `togglePane(false)` 写入（开合单点）。
   - 遮罩点击经 `bindBackdropDismiss` 回调 `togglePane(false)`；重复挂载清理选择器与卸载清理移除遮罩并解绑。
3. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 锚定 R-01-008/AC-03：遮罩 click（触摸轻点经浏览器 tap→click 合成，与既有交互一致）触发收起并阻止传播；非 click 事件不触发；卸载后监听移除、点击不再触发；非法输入返回 no-op 卸载函数。
- `scripts/acceptance.mjs` 增加人工步骤：移动端打开抽屉后点击外部区域收起且不误触主会话；开关按钮不受遮罩拦截；桌面宽度无遮罩。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：移动端打开抽屉后点外部区域收起是主路径 | `scripts/check.mjs#R-01-008/AC-03`、`src/client.mjs::togglePane`、`src/navigation.mjs::bindBackdropDismiss` |
| 异常 | 适用：窗格未挂载/重复挂载/卸载后点击不得报错或残留监听 | `scripts/check.mjs#R-01-008/AC-03`、`src/client.mjs::apply`、`src/client.mjs::cleanup` |
| 边界配置 | 适用：桌面断点外遮罩不得显示，不影响桌面贴边列与折叠 | `src/client.mjs::MOBILE_BREAKPOINT`、`scripts/acceptance.mjs#R-01-008/AC-03` |
| 副作用 | 适用：开合单点写入不得破坏开关切换与 × 收起；遮罩不得拦截浮动开关 | `scripts/check.mjs#R-01-008/AC-03`、`scripts/acceptance.mjs#R-01-008/AC-03`、`src/client.mjs::bindPaneControls` |

## 终态与证据

（active，待实现与审核完成后填写）
