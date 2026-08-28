---
doc-type: task
mutation: lifecycle
id: T-034
---

# T-034 桌面窗格拖拽调宽

状态: completed
关联: R-01-015 / 窗格渲染器、活动状态模型（宽度夹取纯函数）
风险等级: standard

## 背景与目标

桌面窗格列宽目前是代码常量 280px（`DEFAULT_WIDTH`，经 `--dap-width` 驱动 `flex: 0 0`），东家要求支持拖拽改变宽度。PRD 新增 R-01-015（已经东家确认）：桌面形态下拖拽窗格右缘在 200–480px 内实时调宽，主会话同步让位；折叠窄条与移动端抽屉不提供拖拽；调宽结果存 localStorage，刷新后恢复。

## 差距评估

- `src/client.mjs`：`DEFAULT_WIDTH = 280` 常量，无拖拽手柄元素、无指针拖拽逻辑、无持久化。
- `src/core.mjs`：无宽度夹取纯函数。
- `scripts/check.mjs` / `scripts/acceptance.mjs`：无 R-01-015 测试锚点。

## 收敛方案

- `src/core.mjs`：新增 `PANE_WIDTH_MIN/MAX/DEFAULT`（200/480/280）与 `clampPaneWidth(raw)`——非有限数值（含空串）回退默认 280px，有限数值取整后夹取进范围；拖拽与持久化恢复共用同一函数。
- `src/client.mjs`：
  - 窗格模板尾部新增 `.dap-resize` 手柄（右缘 6px 命中区，`col-resize` 光标，`touch-action: none`）；折叠窄条与移动断点下经 CSS `display: none`。
  - `bindPaneControls` 绑 `pointerdown` → `setPointerCapture` + `pointermove` 实时 `clampPaneWidth(startWidth + dx)` 写入 `--dap-width`（主会话经既有 `flex:1 1 0%` 自动让位）；`pointerup`/`pointercancel` 持久化 localStorage（`dsh-activity-pane:width`）并 `notifyLayoutChange`；unbind 移除 `pointerdown`。
  - 启动 `readStoredPaneWidth()` 归一恢复（localStorage 异常静默回退默认）；`ensurePane` 创建窗格时应用当前宽度，重挂载后保留。
- `scripts/check.mjs`：`clampPaneWidth` 纯数据断言（AC-02、AC-04）+ bundle 契约（手柄/指针拖拽/夹取/持久化/折叠与移动端隐藏，AC-01～AC-04）。
- `scripts/acceptance.mjs`：新增 4 条 GUI 人工验收步骤（AC-01～AC-04）。
- 不新增依赖。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约。
- `python3 tools/agentmap_lint.py --report`：追溯完整（R-01-015 / 4 AC / 4 锚点）。
- `git diff --check`：空白检查。
- GUI 现场演示（拖拽实时调宽、夹取、折叠/移动端无手柄、刷新恢复）由东家验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：拖拽实时调宽、主会话让位、刷新恢复 | `scripts/check.mjs#R-01-015/AC-01`、`scripts/acceptance.mjs#R-01-015/AC-01`、`src/client.mjs::onResizeDown`、GUI 现场验收 |
| 异常 | 适用：localStorage 抛异常（隐私模式）静默回退默认；拖拽中 pointercancel 正常收尾 | `src/client.mjs::readStoredPaneWidth`、`src/client.mjs::onResizeDown` |
| 边界配置 | 适用：越界拖拽夹取 200/480；非法/缺失持久化值回退 280；折叠与移动端无手柄 | `scripts/check.mjs#R-01-015/AC-02`、`scripts/check.mjs#R-01-015/AC-03`、`src/core.mjs::clampPaneWidth` |
| 副作用 | 适用：仅写 `--dap-width` 与 localStorage，卸载随 unbind/元素移除清理；不引入定时器与轮询 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |

## 终态与证据

- 实现: `src/core.mjs` 以 `clampPaneWidth` 单点归一 200–480px 宽度；`src/client.mjs` 提供桌面右缘 pointer 拖拽、实时 `--dap-width` 更新、主会话弹性让位、折叠/移动端禁用及 localStorage 持久化恢复。
- 测试: `scripts/check.mjs` 覆盖宽度夹取与 bundle 契约；`e2e/specs/resize.mjs` 覆盖桌面拖拽、夹取、折叠与恢复，`e2e/specs/mobile-drawer.mjs` 覆盖移动端无拖拽手柄。发布前收敛时 `pnpm verify` 全绿，11/11 E2E spec 通过（127.467s）。
- DESIGN 对照: DESIGN 的桌面宿主布局、拖拽手柄、宽度夹取和持久化契约与当前实现一致，无差异。
- commit: 0aa74776252bb846290179241bd40b559b3c3a86
- review:
  - 审核方: Standards reviewer `e156fa4c-f0fd-46c9-bca3-736689a22eee`；Spec reviewer `cbaa86d7-90aa-41da-a18c-00e481363d63`（含分项子审）
  - 目的理解: 兑现 R-01-015 的桌面实时拖拽调宽、200–480px 夹取、折叠/移动端禁用与刷新恢复，并保证主会话同步让位。
  - 执行方式: `code-review` skill 双轴审核当前 HEAD 与历史实现提交，读取 PRD、DESIGN、任务、实现和现有测试证据。
  - 问题与修复: Spec 初审发现 R-01-015/AC-03 只有桌面折叠态浏览器证据、移动端仍为人工项；`970ec526c157162be0780ae254fd0ad74153eb6e` 在 `mobile-drawer.mjs` 增加真实移动视口下调宽手柄不可见断言，并同步 acceptance 迁移映射。Standards 无代码 finding。
  - 复审结论: 同一 Standards 与 Spec reviewer 确认移动端证据缺口关闭，无新增 finding，允许关闭。
