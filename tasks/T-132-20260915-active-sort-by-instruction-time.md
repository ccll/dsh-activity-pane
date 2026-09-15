---
doc-type: task
mutation: lifecycle
id: T-132
---

# T-132 活动区主会话按最后一次用户指令时间倒序排列

状态: active
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
| DESIGN | 改写：排序不变量与 buildEntries 契约改为宿主列表时间倒序，工作区顺序退出排序 | UNIT | update | `scripts/check.mjs#R-01-001/AC-07` 新增多会话指令时间倒序与平局回落断言 |
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

（active 期间留空，关闭时填写）
