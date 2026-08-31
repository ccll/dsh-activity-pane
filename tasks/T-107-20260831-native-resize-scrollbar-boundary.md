---
doc-type: task
id: T-107
mutation: lifecycle
---

# T-107 原生式调宽与滚动条命中边界

状态: active
关联: R-01-004/AC-03、R-01-015 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: activity-pane 的 `.dap-resize` 位于 pane 右缘并覆盖原生 scrollbar 命中区；鼠标进入右侧时优先命中调宽手柄，无法悬停显示或拖动 native scrollbar。
- 对照: DSH 原生左边栏也不是 CSS `resize`，而是 AppFrame 的窄透明 pointer-capture handle；其滚动区通过右侧 inset 将 scrollbar 留在手柄左侧，手柄只改变光标、不绘制 hover 高亮。
- 目标: 保留 activity-pane 调宽手柄在 pane 右缘，不把手柄整体左移；让滚动条落在手柄左侧的可命中区域，鼠标进入窗格时显示滚动条，native scrollbar 可直接拖动，调宽仍能实时生效。
- 非目标: 不自绘 scrollbar，不引入新的依赖，不改变移动端/折叠态禁用调宽，不改变主会话滚动隔离。

## 差距评估

- `src/client.mjs` 的 `.dap-scroll` 没有右侧外部 inset，DSH 全局 WebKit scrollbar 为 8px。
- `src/client.mjs` 的 `.dap-resize` 为 `right: 0; width: 6px; z-index: 6`，覆盖滚动条右侧 6px。
- 滚动条只由 `data-scrolling` 显示，没有指针进入窗格的显示路径。
- 当前手柄 hover 会绘制背景，区别于 DSH 左边栏的透明窄命中区。
- 现有 `long-list` 只覆盖滚轮/编程滚动，未覆盖指针进入、native thumb 拖动与调宽/滚动条命中边界；本任务需补齐这些可观察行为。

## 收敛方案

1. 更新 R-01-004/AC-03：滚动或鼠标指针进入窗格时显示 scrollbar；滚动停止且指针离开窗格后隐藏。
2. `src/client.mjs`：在 `.dap-scroll` 增加 `scrollbar-gutter: stable` 与一个 `--dsh-scrollbar-width` 右侧 inset，使 scrollbar 与 `.dap-resize` 严格分离并留在其左侧；保留 `.dap-resize` 的 `right: 0` 与窄命中宽度。
3. `src/client.mjs`：删除 `.dap-resize:hover`/拖动高亮背景；在 `bindPaneControls` 绑定 pane 的 mouse pointer enter/leave，使用 `data-pointer-inside` 驱动 WebKit 与 Firefox 两条现有 scrollbar 绘制路径；unbind 对称清理。
4. `scripts/check.mjs`：增加右侧 inset、stable gutter、指针显隐监听、双路径显示和无手柄 hover 高亮契约断言。
5. `e2e/specs/long-list.mjs` 与 `scripts/acceptance.mjs`：补充窗格右缘调宽区与 scrollbar 区的边界验收；headed Chromium 现场验证 native thumb 拖动不触发调宽、调宽仍实时改变宽度。
6. 生成 `.dsh-plugin/client.js`，运行快速验证、focused headed probe 与完整验证。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-004/AC-03 | 从仅滚动显示扩展为滚动或鼠标进入窗格显示；离开且停止滚动后隐藏 | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-004/AC-03`、`e2e/specs/long-list.mjs#R-01-004/AC-03`、`scripts/acceptance.mjs#R-01-004/AC-03`、headed Chromium probe |
| R-01-004/AC-01～AC-02 | 独立滚动与全部卡片可达保持不变 | E2E | regression | `e2e/specs/long-list.mjs#R-01-004/AC-01`、`e2e/specs/long-list.mjs#R-01-004/AC-02` |
| R-01-015/AC-01 | 手柄仍在右缘，调宽实时生效 | E2E/MANUAL | regression | `e2e/specs/resize.mjs#R-01-015/AC-01`、headed Chromium probe |
| R-02-003/AC-02 | 指针监听随窗格解绑清理，不残留属性监听 | UNIT | update | `scripts/check.mjs#R-02-003/AC-02` |
| DESIGN | 记录 DSH 同类透明 pointer-capture 手柄与 scrollbar inset 几何 | UNIT/MANUAL | update | `DESIGN.md#R-01-015`、`scripts/check.mjs#R-01-004/AC-03` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：指针进入显示 scrollbar，移出且无滚动后隐藏；native thumb 拖动滚动；右缘手柄调宽 | `scripts/check.mjs#R-01-004/AC-03`、`e2e/specs/long-list.mjs#R-01-004/AC-03`、`scripts/acceptance.mjs#R-01-004/AC-03`、`src/client.mjs::bindPaneControls`、headed Chromium probe、`e2e/specs/resize.mjs#R-01-015/AC-01` |
| 异常 | 适用：pointer leave、pointer capture、pointercancel、窗格卸载均不遗留显示属性或监听 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：scrollbar 宽度 token 缺失时 fallback；折叠态与移动端仍隐藏手柄；Firefox 标准路径 | `scripts/check.mjs#R-01-004/AC-03`、`src/client.mjs::CSS`、`scripts/acceptance.mjs#R-01-004/AC-03` |
| 副作用 | 适用：主会话滚动位置不变；调宽持久化与现有卡片渲染不受影响；不新增轮询 | `e2e/specs/long-list.mjs#R-01-004/AC-02`、`e2e/specs/resize.mjs#R-01-015/AC-04`、`scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |

## 测试计划

- 先更新 `scripts/check.mjs` 与 `e2e/specs/long-list.mjs` 的契约/行为断言，使旧实现失败。
- 修改 `src/client.mjs`、`PRD.md`、`DESIGN.md`、`scripts/acceptance.mjs`，重建 `.dsh-plugin/client.js`。
- 使用 headed `/opt/google/chrome/chrome` 对 `http://127.0.0.1:3080/` 验证：handle 仍在 pane 右缘且无 hover 高亮；指针进入 pane 后 thumb 显示；从 handle 向左移至 scrollbar 后，拖动 thumb 改变 `scrollTop` 而不改变 pane width。
- 运行 `pnpm verify:fast` 与 `pnpm verify`；`e2e/run.mjs` 显式移除 Playwright 的 `--hide-scrollbars` 默认参数，使 native thumb 拖动在自动 E2E 中可命中。
- 调用 `code-review` skill 做独立 Standards/Spec 双轴审核，finding 清零后再关闭 task。

## 终态与证据

待实现。
