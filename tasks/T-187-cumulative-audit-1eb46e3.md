---
doc-type: task
mutation: lifecycle
id: T-187
---

# T-187 累计审计——窗口 1eb46e3..94f710b（T-185 卡顿修复线 + T-186 分配清零）

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改动代码与 map；审计发现按严重度登记，修复另立或并入待关闭 task）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-184（1eb46e3）起窗口语义行 854 ≥ 800（累计审计行数间隔），先于 completed task 计数阈值触发；按规则先完成累计审计并登记新复位点，才可关闭下一个 task（T-186 关闭被此闸口阻断）。

## 背景与目标

窗口 1eb46e3..94f710b 共 7 笔提交，覆盖两条性能线：

- T-185 流式派生增量化（6f4164c 合并间隔 100→250ms 先行缓解、c09d441 增量折叠主体、46f5e2f 关闭）。
- T-186 渲染帧名册级分配清零（c2c142d 立项、0c17bc1 实现主体、1dc11e3 评审修复 F1 排序前切片回归、94f710b N1 平局索引一次性建表；task 关闭被本审计闸口阻断，关闭证据在审计后填写）。

单改动审核看不到跨改动漂移，逐改动审核替代不了窗口视角——本 task 对窗口内全部累计改动做全量双轴审计：跨改动交互（T-185 增量折叠与 T-186 memo/两段式在同一派生与渲染管线上的叠加语义）、证据失实检查、completed task 必填结构抽查。

## 差距评估

- 审计对象：`git diff 1eb46e3..94f710b`（全部源码、测试、bundle 生成物与 task 文书）。
- 抽查对象：窗口内 completed task（T-185）的必填结构（major 自查清单与 review 三标签）；T-186 的 task 文书与实现一致性（其终态证据在审计后填写，审计按 active 期事实核对）。
- 证据失实：发现登记审计更正，不修改终态 task 原文。

## 收敛方案

1. Spec 轴：窗口累计 diff 对照 T-185/T-186 两份 task 文书与上游链（PRD R-01-009/012/020/023/025、R-02-003；SOLUTION 派生管线与渲染器节）——重点为跨改动交互面：增量折叠状态（T-185）与覆盖层/两段式 memo（T-186）对同一 detail 生命周期的叠加；250ms 合并间隔与派生复用路径的相互作用。
2. Standards 轴：CONVENTIONS/DOMAIN/SOLUTION 契约对照累计 diff；内置 smell 基线加吞错/缺失校验。
3. 结构抽查：T-185 终态证据四行 + review 三标签 + 自查清单齐备性；T-186 文书与实现的对照。
4. 输出：findings 按严重度排序、逐条 file:line；无发现明确写无；残余风险与测试缺口列明。
5. 无分叉点: 审计范围为闸口机械划定（窗口 diff），无方案抉择。

## 测试计划

- 本 task 为只读审计，不新增测试；审计发现若需修复，另立 task 或并入待关闭 task 的修复轮。
- 审计子代理可复跑 `node scripts/check.mjs` 作证据核验（只读运行）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口双轴审计完成且发现清单闭环、复位点登记后 lint 直跑恢复 | `tools/agentmap_lint.py::累计审计触发`（闸口报错源，复位点登记后消失） |
| 异常 | 适用：证据失实或跨改动漂移的登记处置 | `tasks/T-187-cumulative-audit-1eb46e3.md::findings`（审计发现清单入终态） |
| 边界配置 | 适用：窗口含生成物与文书改动，排除清单口径核对 | `tasks/T-187-cumulative-audit-1eb46e3.md::1eb46e3`（窗口边界与提交清单登记） |
| 副作用 | 适用：审计不改动仓库状态 | `tasks/T-187-cumulative-audit-1eb46e3.md::只读` |
| 性能 | 不适用：审计不承载性能承诺 | 无 |

## 自查清单

- 边界：窗口边界提交（1eb46e3 为 T-184 关闭提交、94f710b 为窗口尾）与复位点登记口径一致。
- 异常路径：审计发现与两份 task 终态证据的冲突处置（更正登记 vs 修复另立）。
- 回归影响：审计不改代码；复位点登记后新窗口从本 task 关闭提交起算。

## 终态与证据

- 实现: 独立子代理累计审计（窗口 1eb46e3..94f710b 全量 diff 双轴 + T-185/T-186 两份 task 文书全文核验）——跨改动交互轴四项逐一核验正交成立：增量失效键（前缀长度/末条 seq/cwd，src/core.mjs:1072-1089）× 覆盖层与清单 memo 键（引用/版本，src/core.mjs:1454-1535）作用面不同无干扰；foldState.cwd 与 render entryCwd 同源且漂移回落全量（src/client.mjs:4629-4631 fail-closed）；SYNC_MIN_INTERVAL_MS 节流与 memo 失效语义独立；T-185 增量路径调用点未被 T-186 options 迁移误伤（foldedTimelineFromFoldState 家族保持位置签名，全仓 grep 无残留）。证据失实更正 2 处（审计更正口径，不改终态原文）：T-185 终态「23 specs」与 46f5e2f 正文「22 specs」按同一事实口径均应为 24（git ls-tree 核验 46f5e2f e2e/specs 计 24 项）；连带提示 T-186 文书测试计划行同差 1，关闭终态勿照抄。结构抽查：T-185 四行证据 + review 三标签 + 自查清单齐备；T-186 收敛方案 1–5 与三笔提交对应完整。
- 测试: 审计为只读活动；审计子代理实跑 `node scripts/check.mjs` 全部断言通过；窗口内最近全量 e2e 为 T-186 修复批次 24 specs 全绿（含 mobile-thermal rAF 门禁 PASS，C-082 对照）。
- SOLUTION 对照: 窗口内无 map 变更（7 笔提交未触碰 PRD/SOLUTION/DOMAIN/RATIONALE/CONVENTIONS，git show --stat 逐笔核验）；PRD/SOLUTION/DOMAIN 未改写。
- commit: 94f710b（审计窗口端点 1eb46e3..94f710b；复位点登记随本关闭提交生效）
- review:
  - 审核方: 累计审计独立子代理（单轮双轴，跨改动视角专项）
  - 目的理解: 窗口为两条性能线叠加——T-185 流式派生增量化（纯追加校验+失效整表重建+合并间隔 250ms）与 T-186 渲染帧名册级分配清零（覆盖层/清单/等待起点 memo、buildEntries/buildRecent options 化+currentId 入参、buildRecent 两段式、平局索引）——红线同为 C-082 达标类 map 不变；审计捕捉单改动评审看不到的叠加失效盲区、指标口径漂移与证据失实
  - 问题与修复: blocking 0。S1 无 seq 条目使增量指纹 seq 比较恒真（src/core.mjs:1072-1074，T-185 已登记两点指纹残余的更窄延伸）→ 并入 T-185 已登记的 O(窗) seq 单调扫描待议项一并评估，随 TODO 登记承接；D1 buildRecent 第二段幂等冗余排序（Speculative Generality 形态）→ TODO 登记待后续触及该函数时清理；S2/D2 容错口径 nit（applyStatusOverlay isRecord 微差、waitingStartsFrom 非 Map 无守卫）→ 登记不动代码；证据失实 2 处 → 审计更正登记
  - 复审结论: 双轴全量审计无 blocking；跨改动交互 4 项（增量失效×引用 memo、cwd 口径、节流×失效、调用点迁移）全部正交；0c17bc1 曾一次引入两处行为回归（F1 排序前切片、N1 平局索引退化）已由同窗 1dc11e3/94f710b 修复并补对抗夹具，审计确认闭环
- 残余风险: S1 指纹退化（现行生产者条目普遍带 seq 且守追加+出窗纪律，可达性低，与 T-185 指纹残余同族待议）；引用 memo 信任「宿主快照两次推送间引用稳定且不可变」既有约定（与 currentIdOf/syncJobsWatches 同一信任模型，现行无违反生产者，接受型残余）；T-186 关闭时补齐活实例同窗实测与 perf-ab 量化终态记录。
- review 结论引用: 0 blocking；Spec 轴 2 条观察级（S1/S2）；Standards 轴 1 non-blocking + 2 nit（D1/D2 含于 S2/D2）；审计更正 2 处。
