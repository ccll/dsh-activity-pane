---
doc-type: task
mutation: lifecycle
id: T-041
---

# T-041 移动端抽屉标题栏对齐桌面最新迭代

状态: active
关联: R-01-008、R-01-011 → 窗格渲染器
风险等级: standard

## 背景与目标

桌面版标题栏已迭代为「活动会话」标题行整体控件（T-035）：整行可点/可键盘激活、hover 高亮、cursor pointer、行尾 « 方向符号、无独立按钮。移动端抽屉标题栏仍是旧样式与旧行为：标题行自身不可点，仅行尾 20px 小圆 × 按钮关闭抽屉，无方向符号、无可点反馈。经东家确认按「完全对齐桌面」演进：PRD R-01-008/AC-02 改为标题行整体激活收起抽屉、R-01-011/AC-06 改为移动端标题行激活解释为收起抽屉而非折叠窄条；DESIGN 同步演进（标题行整体控件两端断点一致呈现，不再提供独立 × 关闭按钮）。

## 差距评估

- `src/client.mjs`：
  - 模板含独立 `.dap-close` × 按钮；`.dap-collapse-hint` 默认 `display: none` 仅桌面媒体查询显示。
  - header 的 `cursor: pointer` / hover / focus 反馈仅在 `@media (min-width: 768px)` 内生效。
  - `onHeaderActivate` 移动端断点早退（无交互）；`onCloseClick` 单独绑 × 并 stopPropagation。
  - `onHeaderKeydown` 的 `event.target !== header` 守卫为 × 子控件而设，× 移除后成死代码。
- `scripts/check.mjs`：契约断言绑定旧实现（`close?.addEventListener("click", onCloseClick)`、「标题行收起仅桌面断点生效」注释）。
- `scripts/acceptance.mjs`：R-01-008/AC-02、AC-05 与 R-01-011/AC-06 步骤仍描述 × 按钮与「移动端无标题行收起」。

## 收敛方案

- `src/client.mjs`：
  - 模板：移除 `.dap-close` 按钮。
  - 样式：删除 `.dap-close` 全部 CSS 与移动媒体查询中的显示规则；`.dap-collapse-hint` 与 header 的 cursor/hover/focus 反馈移出桌面媒体查询，两端断点一致呈现；移动媒体查询仅保留 `.dap-resize` 隐藏。
  - 交互：`onHeaderActivate` 移动端分支改为 `togglePane(false)` 收起抽屉，桌面分支折叠窄条不变；移除 `close` 查询、`onCloseClick` 及其绑定/解绑；`onHeaderKeydown` 移除 × 遗留的 target 守卫。
- `scripts/check.mjs`：契约断言替换为新实现锚点（无 dap-close/onCloseClick 残留、移动端分支 togglePane(false)、方向符号两端呈现），锚定 R-01-008/AC-02、R-01-011/AC-06。
- `scripts/acceptance.mjs`：R-01-008/AC-02、AC-05 与 R-01-011/AC-06 三条步骤改写为新语义。
- 不新增依赖；`src/core.mjs` 不变。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约。
- `python3 tools/agentmap_lint.py --report`：追溯完整（R-01-008、R-01-011 / AC / 锚点）。
- `git diff --check`：空白检查。
- GUI 现场演示（移动端标题行整行点击/键盘收起抽屉、行尾 « 与桌面一致、无 × 按钮、桌面折叠不回归）由东家验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：移动端标题行整行点击/键盘激活收起抽屉；行尾 « 与桌面一致呈现 | `scripts/check.mjs#R-01-008/AC-02`、`scripts/acceptance.mjs#R-01-008/AC-02`、`src/client.mjs::bindPaneControls`、GUI 现场验收 |
| 异常 | 适用：桌面断点折叠行为不回归；键盘激活（Enter/Space）与点击同路径 | `scripts/check.mjs#R-01-011/AC-03`、`scripts/acceptance.mjs#R-01-011/AC-06`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：遮罩点击收起、激活当前卡片收起抽屉、移动端无拖拽手柄等既有移动端行为不变 | `scripts/acceptance.mjs#R-01-008/AC-03`、`scripts/acceptance.mjs#R-01-008/AC-06`、`scripts/check.mjs#R-01-015/AC-03`、`src/client.mjs::bindPaneControls` |
| 副作用 | 适用：卸载移除全部监听（× 监听随元素一并移除，无新增监听）；不引入定时器与轮询；纯 DOM 层变更 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |

## 终态与证据

（待关闭时填写）
