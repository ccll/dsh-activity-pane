---
doc-type: task
mutation: lifecycle
id: T-148
---

# T-148 时间线运行中组标题去掉「正在」前缀

状态: completed
关联: R-01-017/AC-03（原地演进）→ 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家需求（2026-09-18）——活动会话时间线里「正在思考」之类的运行中组标题，把「正在」两字去掉；「正在」是冗余信息（执行中状态已由蓝色闪烁圆点与实时摘要承载），去掉可节省横向屏幕空间。
- 现状: `buildFoldRow` 运行中工具组标题为「正在运行」、运行中思考组标题为「思考」前置「正在」；已定案组标题为「运行了命令/编辑了文件/上下文注入/已思考」。
- 东家拍板（2026-09-18，当次请求即确认）: 运行中组标题「正在运行」→「运行」、「正在思考」→「思考」；已定案标题（含「已」「了」后缀的完成态措辞）不变。
- 目标: 两处运行中组标题文案简化，语义仍由状态聚合（running 圆点闪烁）与完成态措辞区分。
- 非目标: 不改其余组标题（「运行了命令」「编辑了文件」「上下文注入」「已思考」）；不改计数徽标 aria 文案（「N 个正在运行」为无障碍文案非题头）；不改状态点/闪烁语义。

## 差距评估

- PRD.md: R-01-017/AC-03 措辞含「正在运行」「正在思考」→ 原地演进。
- DESIGN.md: 非运行活动卡呈现条目引用「正在思考」标题一处 → 同步。
- src/core.mjs: `buildFoldRow` 两处 label 常量。
- scripts/check.mjs: fixtures（timelineQuestionPreview、buildEntries 提问预览）与 R-01-017/AC-03 锚点断言共 8 处引用旧文案。
- scripts/acceptance.mjs: R-01-017/AC-01 人工清单示例组标题一处。
- e2e/specs: 无组标题文案断言（已检索确认），不受影响。

## 收敛方案

1. PRD R-01-017/AC-03:「正在运行」→「运行」、「正在思考」→「思考」（东家当次请求即确认闸口，沿用 T-135 先例）。
2. DESIGN 同步该处引用。
3. `src/core.mjs` `buildFoldRow`: 两处 label 常量替换（顺带修正该分支既有的错位缩进）。
4. `scripts/check.mjs`: 两处 fixture label 与 R-01-017/AC-03 断言及关联断言消息同步。
5. 注释同步（评审补记）: `src/core.mjs` 两处派生语义注释与 `src/client.mjs` memo 注释中的旧标题引用（「正在思考」「正在运行」）同次替换。
6. `scripts/acceptance.mjs`: 人工清单示例同步。
7. `.dsh-plugin/client.js` 随实现重建并同次暂存。

## 测试计划

- `scripts/check.mjs`（UNIT，锚定 R-01-017/AC-03）: 运行中工具组标题为「运行」、双运行成员优先序、运行中思考组标题为「思考」、未落定呈现保留「运行」、落定后派生「运行了命令」/「已思考」不受影响——既有锚点用例改期望值后全部通过。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归（unit/contract + 全部浏览器 E2E，兼作前端变更的浏览器实际操作验证）。
- `.dsh-plugin/client.js` 经 `pnpm check` 从工作树重建，pre-commit 校验 staged 一致。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-017/AC-03 | 改写：运行中组标题「正在运行」→「运行」、「正在思考」→「思考」 | UNIT | update | `scripts/check.mjs#R-01-017/AC-03`（运行中工具/双运行/运行中思考/落定派生断言同次更新） |
| DESIGN | 非运行活动卡呈现条目组标题引用同步 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行中工具/思考组显示「运行」「思考」标题并实时更新摘要 | `scripts/check.mjs#R-01-017/AC-03`、`src/core.mjs::buildFoldRow` |
| 异常 | 适用：落定语义不变——done 圆点配已定案标题（「运行了命令」「已思考」），不出现已定案圆点配运行中标题 | `scripts/check.mjs#R-01-017/AC-03`、`src/core.mjs::buildFoldRow` |
| 边界配置 | 适用：双运行成员优先序（tool 优先于 think）标题/摘要不变；提问预览穿透组行 fixtures 同步 | `scripts/check.mjs#R-01-017/AC-03`、`scripts/check.mjs::timelineQuestionPreview` |
| 副作用 | 适用：仅文案常量变化，fold 派生/状态聚合/图标/窗口选择逻辑不变；全量回归 | `package.json::verify` |

## 终态与证据

- 实现: `src/core.mjs` `buildFoldRow` 运行中工具组标题「正在运行」→「运行」、运行中思考组标题「正在思考」→「思考」（顺带修正该分支既有错位缩进）；三处派生语义注释（core.mjs 两处、client.mjs memo 注释）同次替换为新标题引用；PRD R-01-017/AC-03 与 DESIGN 非运行活动卡呈现条目同步；已定案组标题（「运行了命令」「编辑了文件」「上下文注入」「已思考」）、状态聚合、图标与窗口选择逻辑不变；计数徽标 aria 文案（「N 个正在运行」）按非目标保留。
- 测试: `pnpm verify:fast` 三轮通过（首轮仅 task 验证矩阵证据格式不合规，补 `::` 消费方引用后通过；实现轮与注释同步轮各一轮，`node scripts/check.mjs` 全量断言含 bundle 契约全绿）；`pnpm verify` 全量一轮 18/18 浏览器 E2E spec 通过（401998ms，运行于注释同步前的工作树——其后仅注释文字变化、无行为差异，且 e2e/specs 无组标题断言，经检索确认）；UNIT 锚点 `scripts/check.mjs#R-01-017/AC-03`——runTool=「运行」、双运行优先序=「运行」、runThink=「思考」、blockedAskRunning=「运行」、blockedAskSettled=「运行了命令」、frozenIdle=「已思考」全部通过。前端浏览器实际操作验证由该全量 E2E 承载（spec 不含组标题断言，文案变化无浏览器断言影响）。
- DESIGN 对照: PRD R-01-017/AC-03 措辞与 `buildFoldRow` 两处 label 一致；DESIGN 非运行活动卡呈现条目组标题引用与实现一致；DOMAIN 无术语变化（「正在」非登记术语）。
- commit: 5bbcce4 实现与 map 演进（PRD AC-03、DESIGN、core/client 注释、check/acceptance、bundle）
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = 工作树 vs HEAD dbeb76b；复审由同一双轴审核方各自行复核修复 hunks）
  - 目的理解: 时间线折叠分组运行中组标题按东家要求去掉「正在」前缀（正在运行→运行、正在思考→思考）以节省横向空间；约束——已定案组标题（「运行了命令」「编辑了文件」「上下文注入」「已思考」）、状态聚合、图标与落定语义不变，计数徽标 aria 文案为非目标；验证方式 = check.mjs R-01-017/AC-03 锚点断言 + 全量浏览器 E2E + staged bundle 字节一致。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照全局/项目 AGENTS 工程原则 + CONVENTIONS + Fowler 基线；Spec 轴对照 T-148 收敛方案 + PRD R-01-017/AC-03 + DESIGN 同步落点），两轴独立并行后聚合；复审仅复核注释修复 hunks（core.mjs:837/1048、client.mjs:3682）。
  - 问题与修复: ①【Standards·硬违规（轻微，注释级）】core.mjs:837 注释仍引旧标题「正在思考」（违反全局工程原则 7 注释与实现一致）→ 同步替换为「思考」；同批修复 Spec 轴重合点位 core.mjs:1048、client.mjs:3682 的「正在运行」→「运行」，T-148 收敛方案补记第 5 条消除差距评估漏记。修复后同一双轴审核方各自复审通过。
  - 复审结论: 双轴复审通过，无未关闭发现、无新增问题。documented waiver：①label 常量表收敛建议（疑似 Shotgun Surgery·弱）按 KISS & YAGNI 与聚焦修改纪律豁免——两处字符串改名不构成建表需求；②注释与 task 文档同步计入本 task 收敛方案第 5 条。残余风险与测试缺口：无新增；E2E spec 无组标题文案断言（检索确认），浏览器覆盖由全量 18 spec 回归承载，提交时 pre-commit 强制 staged source/bundle 字节一致、推送前 `pnpm verify` 为权威验证。
