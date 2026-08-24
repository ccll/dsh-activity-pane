---
doc-type: task
mutation: lifecycle
id: T-044
---

# T-044 工作区徽标加侧栏同款图标并调大字号

状态: completed
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

- 实现: `src/client.mjs` 新增 `createWorkspaceFolderIcon()`（经既有 `createInlineIcon` 复刻 dsh-client-ui-primitives `IconFolderClose16` canonical path，逐字节一致）；`.dap-workspace` 胶囊改「`.dap-workspace-icon` + `.dap-workspace-text`」flex 双段结构（gap 3px），字号 9.5→10.5px、行高保持 14px；省略号截断移至文本段、图标 `flex: none`；`renderCardInto` 经 `restoreTextField` 只写文本段并对热装旧骨架容空（`if (workspaceText !== null)`）；无归属整枚隐藏的既有行为不变。`scripts/check.mjs` 新增 8 条契约断言锚定 R-01-003/AC-06、AC-07（图标工厂与同源 path、10.5px 字号与双段布局、DOM 顺序、容空守卫、文本段截断），并将 T-043 结构回归锚点更新为「规则闭合 + 徽标注释前缀 + 顶层选择器」新形态。`scripts/acceptance.mjs` 补一条人工验收步骤。
- 测试: `pnpm build:client && pnpm check` 全部断言通过（含新增锚点）；`python3 tools/agentmap_lint.py --report` 通过（20 需求 / 94 AC 全追溯、全锚定）；`node scripts/acceptance.mjs` 可执行；`git diff --check` 干净。GUI 现场验收（活动卡/最近卡徽标图标与左边栏一致、字号可读性、窄卡截断不波及图标、深浅主题协调）由东家按 scripts/acceptance.mjs 清单执行。
- DESIGN 对照: 与 DESIGN「窗格渲染器 → 关键内部结构 → 工作区徽标双段结构条目」（同源 path、文字之前、10.5px 下限、行高不变、无归属隐藏、截断不波及图标）及需求追溯索引（R-01-003 → 活动状态模型，实现位置 src/core.mjs、src/client.mjs）逐条一致，无差异。
- commit: 657264316d7aa31c325e64093b286914942eadad
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理、Spec 子代理，code-review skill 流程；修复后由同轴 brief 的独立复审子代理复审）
  - 目的理解: 工作区徽标原为 9.5px 纯文字胶囊，东家要求字号调大并在文字前加与左边栏工作区条目相同的文件夹图标使归属一眼可辨；关联 PRD R-01-003/AC-06、AC-07 与 AC-03 不回归约束，DESIGN 窗格渲染器双段徽标条目；预期行为与验证方式以 PRD 验收点 + check/acceptance 锚点为准（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill 双轴并行子代理，评审基线为工作树 `git diff HEAD`（实现提交前，HEAD=ae353a24），范围含 src/client.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN 演进与 task 文件。
  - 问题与修复: Standards 轴无硬违规，判断性建议 3 项——check 断言把中文长注释纳入锚点脆弱（已采纳：缩短为规则闭合+注释前缀+顶层选择器，完整规则体由 AC-07 断言钉住）、renderCardInto 对 `.dap-workspace-text` 未判空致热装旧骨架可能抛 TypeError（已采纳：两处写入加容空守卫并新增对应断言）、函数名实现锚定沿袭仓库先例（经取舍保留）；Spec 轴轻微备注 2 项——「名称文字之前」缺 DOM 顺序机械锚点（已采纳：新增 append 顺序断言）、AC-07 字面等值断言可接受（保留）。实现期间一次批量编辑误删 `if (kind === "parent")` 与 `const modelLabel` 两行既有代码，由 bundle 语法检查暴露并当场补回。
  - 复审结论: 同轴 brief 独立复审确认全部采纳项消除、无新问题引入（Standards：三项均落实且保护意图保留；Spec：备注均消除、modelLabel 声明在位、图标 path 与 IconFolderClose16 逐字节一致、实跑 build/check 通过），通过。
