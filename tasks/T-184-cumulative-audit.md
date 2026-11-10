---
doc-type: task
mutation: lifecycle
id: T-184
---

# T-184 累计审计——卡顿修复与性能基建窗口（T-180 复位点起）

状态: completed
类型: 累计审计
风险等级: major
风险面: 无（审计 task 免风险分级；窗口内改动为 T-181/T-182/T-183 性能线与 e2e helper 修复，产品契约未动）
关联需求: 无新承诺——审计窗口覆盖 T-181（流式派生与唤醒收敛）、T-182（A/B 测量基建）、T-183（名册渲染家族常量成本收敛）、e2e helper 遮罩竞态短路修复与东家的 AgentMap 规范 v9→v10 升级（f23bcc0 等 agent 层提交为过程内容，抽查结构不计语义）
决策依据: CONVENTIONS 累计审计闸门（自复位点 T-180 起窗口语义行 906 ≥ 800，先到先触发）；复位点登记 commit 816a446（2026-10-22）。

## 背景与目标

窗口内三笔性能线 task（T-181 卡顿修复、T-182 A/B 测量基建、T-183 名册成本收敛）与一笔 e2e helper 短路修复先后落地，各 task 均经独立双轴审核；累计审计的职责是跨改动视角——审查叠加效应、共享文件漂移与口径一致性，并抽查窗口内 completed task 的必填证据结构。

## 差距评估

- 窗口范围：816a446..HEAD，代码语义变更集中于 src/client.mjs（+152/-78 中大头）、src/core.mjs（+89）、scripts/perf-ab.mjs（新 367 行）、scripts/check.mjs、e2e/helpers.mjs、.dsh-plugin/client.js（生成物）。
- 三笔 task 的改动存在同文件叠加（src/client.mjs 被 T-181 与 T-183 先后改写；scripts/ 被 T-182 与 T-183 先后改写）——单改动审核已各自覆盖，跨改动一致性（派生管线的缓存叠加、断言口径的两次演进）为本审计的重点面。

## 收敛方案

1. 双轴审计由独立子代理执行：Spec 轴对照窗口内三个 task 的收敛承诺（T-181 修复三件套、T-182 工具口径、T-183 缓存化）与 SOLUTION 契约；Standards 轴对照 AGENTS/CONVENTIONS/DOMAIN 与 smell 基线（吞错/缺失校验）。
2. 跨改动视角专项：派生管线的缓存叠加（T-181 的 memo 与 T-183 的备忘/记忆化/缓存三层共存）是否引入失效盲区；perf-ab 断言口径两次演进（T-182 建立、T-183 换轨）的工具语义一致性；e2e helper 与 specs 的口径漂移。
3. 抽查窗口内 completed task（T-181/T-182/T-183）的必填证据结构（major 自查清单与 review 三标签）。

## 测试计划

- 审计为只读活动；窗口内全部改动的验证证据已在各 task 终态与全量 verify 记录（本窗口最后一次全量 verify 22 specs 全绿）。
- 测试影响：无（审计不改代码；如审计发现 blocking 项，修复走对应路径后另计）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口全部改动经审计无未处置 blocking | `tasks/T-184-cumulative-audit.md` 终态 review 证据（独立子代理双轴） |
| 异常 | 适用：审计发现的处置路径（修复/登记）在终态记录 | `tasks/T-183-roster-render-cost.md::收敛方案`（口径演进处置例证） |
| 边界配置 | 适用：窗口内三档密度与档位资源纪律改动（T-181 隐藏页门控）的交互 | `e2e/specs/density-resource.mjs::densityResource`、`e2e/specs/idle-quiescence.mjs::idleQuiescence` |
| 副作用 | 适用：跨改动的缓存叠加与唤醒源收敛无交互回归 | `scripts/perf-ab.mjs::measureProfiledEventPeriod`（折叠绝对采样守恒 96→93） |
| 性能 | 适用：窗口内性能改动均有实测对照（折叠占比比值 0.555/0.569；活实例热点结构改善） | `tasks/T-181-streaming-derive-cost.md::终态与证据`、`tasks/T-183-roster-render-cost.md::终态与证据` |

## 自查清单

- 边界：窗口内三笔 task 的缓存层（T-181 memo/门控、T-183 三层缓存）失效路径互不掩盖。
- 异常路径：e2e helper 遮罩竞态修复与 perf-ab 口径演进均为窗口内短路/工具改动，其回归面经单跑回执与两次实跑覆盖。
- 回归影响：全量 verify 22 specs 全绿（含移动端热静默 rAF 门禁，C-082 对照）；窗口内无 map 变更。

## 终态与证据

- 实现: 独立子代理累计审计（窗口 816a446..251cfc7 全量 diff src/scripts/e2e + T-181/T-182/T-183 三份 task 文书全文核验）——五个专项：A 缓存叠加（T-181 memo/门控层与 T-183 三层缓存的代际边界与双基线交互：无发现）、B 指标语义漂移（1 条：perf-ab 剖析注释与零采样告警残留占比口径，已随本收口改写为绝对采样守恒语义）、C e2e helper/spec 一致性（无发现）、D 三 task 终态证据结构抽查（齐备，所引 commit 均存在）、E 标准扫查（1 条：pageHidden JSDoc 整块重复，已随本收口去重）。
- 测试: 审计为只读活动；窗口内最后一次全量 verify 22 specs 全绿（含移动端热静默 rAF 门禁 PASS，C-082 对照）；审计收口增量（注释去重与改写、订阅差集基线复位行）经 node --check、scripts/check.mjs 全量断言与 agentmap lint 复验。
- SOLUTION 对照: 窗口内无 map 变更（T-181/T-182/T-183 均为 map 不变达标类或工具基建）；PRD/SOLUTION/DOMAIN 未改写。
- commit: 251cfc7（审计窗口端点 816a446..251cfc7；复位点登记随本关闭提交生效）
- review:
  - 审核方: 累计审计独立子代理（单轮双轴，累计视角专项）
  - 目的理解: 窗口为卡顿修复线三连——T-181 流式派生与唤醒收敛（折叠减半/隐藏页门控/jobs 脏检查）→ T-182 A/B 测量基建 → T-183 名册渲染家族常量成本收敛（工作区索引/记忆化/缓存）——外加 e2e helper 遮罩竞态修复与东家的 AgentMap 规范 v9→v10 对齐；约束=SOLUTION 派生管线与呈现契约、CONVENTIONS 定时器纪律与验证门禁、DOMAIN canonical；预期行为=三笔性能改动叠加不引入缓存失效盲区、perf-ab 断言口径自洽、呈现与排序不变
  - 问题与修复: B 项 perf-ab 剖析注释与零采样告警残留占比口径 → 随本收口改写为绝对采样守恒语义（与文件头、--check 块、报告行对齐）；E 项 pageHidden JSDoc 重复块 → 去重；T-183 自查清单交叉引用错位（收敛方案 5→6）→ 更正。三项均一行级，随审计收口提交落地
  - 复审结论: blocking 0；non-blocking 4 全部随收口处置——缓存叠加与 e2e 一致性两个专项核验无发现，终态证据结构抽查齐备
- 残余风险: 窗口外既有项随审计在案——名册 O(名册) 枚举的固有成本（T-183 终态已登记，进一步收敛走可见窗口订阅的需求变更路径）；e2e boot 就绪竞态家族（TODO 既有缺陷线索，三轮单跑回执收口）；移动端真机验证既有缺口（T-160–T-165 教训线）。
