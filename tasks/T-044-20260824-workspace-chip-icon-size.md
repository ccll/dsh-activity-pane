---
doc-type: task
mutation: lifecycle
id: T-044
---

# T-044 工作区徽标加侧栏同款图标并调大字号

状态: active
关联: R-01-003 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

窗格卡片的工作区名称胶囊（`.dap-workspace`）当前只有一串 9.5px 小字，东家反馈两点：字号偏小；缺少视觉语义，无法一眼辨认这串文字是工作区归属而非其它元信息。目标：在名称文字前常驻显示与左边栏工作区条目相同的文件夹图标（dsh-client-ui-primitives IconFolderClose16 同源 path），并将名称字号提升到 10.5px（经东家闸口确认），活动卡与最近卡统一生效。

## 差距评估

- PRD R-01-003 只承诺「显示该工作区名称」（AC-03），无图标与字号约束 → 需演进：新增 AC-06（侧栏同款图标）、AC-07（字号下限 10.5px）。
- DESIGN 窗格渲染器无徽标结构描述，需求追溯索引 R-01-003 实现位置缺 src/client.mjs → 同步补齐。
- `src/client.mjs`：
  - `.dap-workspace` 为 `display: block` 单文本段胶囊，`text-overflow: ellipsis` 直接作用于容器文本；`font-size: 9.5px`。
  - 无文件夹图标工厂；`cardChildren` 骨架仅建空 div，`renderCardInto` 对容器整体写 textContent。
- `scripts/check.mjs`：无对应契约断言。
- `scripts/acceptance.mjs`：无对应人工验收步骤。

## 收敛方案

- `src/client.mjs`：
  - 新增 `createWorkspaceFolderIcon()`：经既有 `createInlineIcon` 复刻 canonical IconFolderClose16 path（fill currentColor，默认 12×12），注明出处。
  - `cardChildren`：`.dap-workspace` 内建「`.dap-workspace-icon`（图标）+ `.dap-workspace-text`（文本）」双段结构。
  - `renderCardInto`：名称经 `restoreTextField` 写入文本段；无归属时清空文本段并对整枚胶囊置 hidden（沿用既有显隐逻辑）。
  - 样式：胶囊改 `display: flex; gap: 3px`，`font-size` 9.5px → 10.5px，`line-height` 保持 14px（胶囊与卡片高度不变）；省略号截断移至 `.dap-workspace-text`，图标 `flex: none` 不被挤压。
- `scripts/check.mjs`：新增契约断言锚定 R-01-003/AC-06、AC-07（图标工厂与同源 path、10.5px 字号、双段结构与文本段写入路径）。
- `scripts/acceptance.mjs`：新增一条人工验收步骤（图标一致性与可辨识性、字号、窄卡截断不波及图标）。
- 不新增依赖；`src/core.mjs` 与数据流不变。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约（含新锚点）。
- `python3 tools/agentmap_lint.py --report`：追溯完整（R-01-003 新增 AC 全锚定）。
- `git diff --check`：空白检查。
- GUI 现场演示（活动卡/最近卡徽标图标与左边栏一致、字号可读性、窄卡省略号不波及图标、深浅主题协调）由东家按 scripts/acceptance.mjs 验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：活动卡与最近卡的工作区名称前呈现左边栏同款文件夹图标，字号 ≥10.5px | `scripts/check.mjs#R-01-003/AC-06`、`scripts/check.mjs#R-01-003/AC-07`、`scripts/acceptance.mjs#R-01-003/AC-06`、`src/client.mjs::createWorkspaceFolderIcon`、GUI 现场验收 |
| 异常 | 适用：无工作区归属时整枚徽标隐藏（既有行为不回归）；图标缺失不得导致渲染报错 | `scripts/check.mjs#R-01-003/AC-03`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：窄卡片下超长工作区名仍省略号截断且图标完整；行高不变保持卡片高度与列表密度 | `scripts/check.mjs#R-01-003/AC-07`、`src/client.mjs::.dap-workspace-text`、GUI 现场验收 |
| 副作用 | 适用：纯呈现层变更，不改数据流、订阅与签名输入字段；深浅主题经 currentColor 继承 | `scripts/check.mjs#R-02-003` 签名去重回归、`src/core.mjs::cardSignature` |
## 终态与证据

（待实现完成后填写）
