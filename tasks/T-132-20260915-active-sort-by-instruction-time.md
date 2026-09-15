---
doc-type: task
mutation: lifecycle
id: T-132
---

# T-132 活动区主会话按最后一次用户指令时间倒序排列

状态: completed
关联: R-01-001/AC-07 → 活动状态模型
风险等级: standard

## 背景与目标

东家要求调整活动会话排序：改为按最后一次用户发出的指令时间倒序，让最新对话过的会话排最前，活动（运行中）会话自然列在完成提醒与阻塞等待会话的最前方。现状活动区按工作区侧栏顺序 + lineage 排序，与「最近对话」直觉不符；历史区口径（C-020）不变。R-01-001 新增 AC-07 承载该承诺（东家已确认 PRD/DESIGN 演进与两项方案决策：数据源取宿主列表时间、工作区顺序彻底退出排序）。

## 差距评估

- `src/core.mjs#buildEntries`：rootIds 排序以 `workspaceRank`（工作区索引 + position）为主键、lineage 为兜底；与 AC-07 口径不符。`workspaceRank` 及其 `rank` 调用随之成为死代码，需删除。
- `scripts/check.mjs`：无活动区排序的 AC 锚定断言，需新增 R-01-001/AC-07 用例（多会话不同指令时间 + 平局回落）。
- e2e：卡片选择全部按标题文本（`filter({ hasText })`），不依赖位置；long-list 的「最早卡在底部」与新口径（宿主按新到旧列出、逐会话创建即消息时间序）一致，无需改动。

## 收敛方案

- `buildEntries` rootIds 排序改为：`row.updatedAt`（宿主列表时间）从新到旧；缺失视为最旧；相同时间保持 `ids` 出现顺序（lineage 稳定序，沿用既有 `ids.indexOf` 兜底）。子代理仍嵌套跟随母会话，不参与排序。
- 删除死代码 `workspaceRank`；`workspaceItems` 入参保留（`workspaceInfoForSession` 徽标/名称仍需要）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：排序不变量与 buildEntries 契约改为宿主列表时间倒序（复审补载「缺失视为最旧」防御语义），工作区顺序退出排序 | UNIT | update | `scripts/check.mjs#R-01-001/AC-07` 断言多会话指令时间倒序、平局回落、缺失最旧与子代理跟随 |
| R-01-001/AC-07 | 新增：活动区主会话按最后一次用户指令时间倒序 | UNIT | add | `scripts/check.mjs#R-01-001/AC-07`（工作区顺序不再决定排列 + 缺失 updatedAt 视为最旧 + 平局保持 lineage） |

## 测试计划

- `pnpm verify:fast` 编辑循环（agentmap lint + test-impact + core 单测与 bundle 契约）。
- `pnpm verify` 全量门禁（含全部浏览器 E2E）。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：多会话不同指令时间时按时间从新到旧排列 | `scripts/check.mjs#R-01-001/AC-07`、`src/core.mjs::instructionTime` |
| 异常 | 适用：行缺失 `updatedAt` 时视为最旧且不抛错；空快照仍返回空数组 | `scripts/check.mjs#R-01-001/AC-07`、`src/core.mjs::buildEntries` |
| 边界配置 | 适用：相同指令时间保持宿主列表出现顺序；子代理仍跟随母会话缩进、不参与排序 | `scripts/check.mjs#R-01-003/AC-01`、`src/core.mjs::buildEntries` |
| 副作用 | 适用：排序变化经既有移动动画平滑过渡，渲染签名与订阅纪律不变 | `e2e/specs/session-lifecycle.mjs#R-01-010/AC-02`、`src/core.mjs::cardSignature` |
| 兼容性 | 适用：历史区排序口径（C-020）与卡片工作区徽标呈现不变 | `e2e/specs/recent-infinite-scroll.mjs#R-01-010/AC-03`、`src/core.mjs::buildRecent` |

## 终态与证据

- 实现: `src/core.mjs#buildEntries` rootIds 排序改为按 `instructionTime`（宿主列表时间 = `row.updatedAt`，缺失/非法视为最旧）从新到旧，相同时间回落 `ids` 宿主列表出现顺序；工作区顺序退出排序，`workspaceItems` 入参保留供 `workspaceInfoForSession` 徽标/名称；死代码 `workspaceRank` 删除。子代理仍嵌套跟随母会话、不参与排序。
- 测试: `pnpm verify` 全量通过——agentmap lint（156 AC 全锚定）+ test-impact（+R-01-001/AC-07）+ core 单测与 client bundle 契约 + 17 个浏览器 E2E spec；审核修复后单元检查复跑全绿。
- DESIGN 对照: 排序不变量（活动状态模型关键内部结构）、产品契约 `buildEntries` 条目与实现一致；复审补载「缺失视为最旧」防御语义后无缝隙；追溯索引 R-01-001 主责子系统不变；DOMAIN「宿主列表时间」词条沿用未改。
- commit: 9a742f7
- commit: 5cba571
- review:
  - 审核方: Standards reviewer 与 Spec reviewer（code-review skill 并行双轴，基线 `9bc76ab...HEAD`）
  - 目的理解: R-01-001/AC-07 演进后，活动区主会话按最后一次用户指令时间（宿主列表时间，无用户消息取创建时刻，缺失视为最旧）从新到旧排列，相同时间保持宿主列表出现顺序，工作区顺序退出排序仅承载徽标，子代理不参与排序、始终跟随母会话；历史区口径（C-020）不变。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `9bc76ab`→`9a742f7`；修复后同审核方基于 `git diff 9a742f7...HEAD` 复审。
  - 问题与修复: Standards 轴 judgement call——DESIGN 排序不变量未载「缺失视为最旧」防御语义 → 已补（5cba571）；Spec 轴——AC-07 子代理条款缺新排序键激活下的直接断言 → `sNew-c1` 子代理行（母会话 `updatedAt=3000` 互异）加入用例并断言 `[id, kind, depth, parentId]` 组合；Standards 轴 Primitive Obsession（`-1` 哨兵）经评估维持现状，处置留痕于 commit 取舍。
  - 复审结论: 两轴复审均通过——Standards 轴确认防御语义落点正确、测试锚定 strict 闭合、无新违规；Spec 轴确认子代理条款锚点真有区分力、顺序仍 spec 一致、无生产代码漂移。
