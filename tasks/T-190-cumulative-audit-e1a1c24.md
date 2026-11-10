---
doc-type: task
mutation: lifecycle
id: T-190
---

# T-190 累计审计——窗口 e1a1c24..2e7c554（T-186 收口 + T-188 全链 + T-189 实现链）

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改动代码与 map；审计发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-187（e1a1c24）起窗口语义行 888 ≥ 800；按「立项与收口同笔」承载（agentmap_lint 对累计审计 task 明示合法），先于下一个 task 关闭（T-189）完成并登记新复位点。

## 背景与目标

窗口 e1a1c24..2e7c554 共 10 笔提交：T-186 关闭与 SOLUTION 表述同步（9787ad8/70a2ccb）、T-188 busy/acks 通道增量化全链五笔（1c2e1c5 立项、b318b1f 实现、eee3827 评审修复、3432341 关闭前微修、fd9bc5d 关闭）、T-189 时钟局部刷新实现链三笔（ad40819 立项、7b3f726 实现、2e7c554 quality 收尾）。三条性能线叠加后的跨改动语义核验是单改动评审看不到的盲区面，本 task 承载窗口全量双轴审计。

## 差距评估

- 审计对象：`git diff e1a1c24..2e7c554` 全部源码、测试、bundle 生成物与 task 文书。
- 跨改动重点：busyVersion 记账×waitingStartsMemo 失效（T-188 patch 路径×T-186 memo）；时钟帧数据源×合帧落盘延后（T-189×T-188）；queueSync 必达性（T-189 兜底结构前提×T-188 patch 事件路径）。
- 证据失实：发现登记审计更正，不修改终态 task 原文；T-189 仍 active，其文书行号更正可随其关闭提交落地。

## 收敛方案

1. Spec 轴：三线叠加跨改动交互核验 + 三份 task 终态证据量化数字互证 + SOLUTION 八处改动口径自洽核对。
2. Standards 轴：CONVENTIONS/DOMAIN 契约对照窗口累计 diff；吞错/缺失校验（时钟帧异常隔离、flushRecords 告警、storedError 暂存、红线断言有效性）；smell 扫查（守卫式写入点家族与 memo/记账结构）。
3. 结构抽查：窗口内 completed task（T-186/T-188）终态四行 + review 三标签 + 自查清单齐备性；T-189 active 文书与实现一致性；.dsh-plugin/ 生成物同步抽查。
4. 无分叉点: 审计范围为闸口机械划定（窗口 diff），无方案抉择。

## 测试计划

- 本 task 为只读审计，不新增测试；审计子代理实跑 `node scripts/check.mjs` 作证据核验（只读运行），发现若需修复另立或并入待关闭 task。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口双轴审计完成、发现清单闭环、复位点登记后 lint 直跑恢复 | `tools/agentmap_lint.py::累计审计触发`（闸口报错源，复位点登记后消失） |
| 异常 | 适用：证据失实与跨改动漂移的登记处置 | `tasks/T-190-cumulative-audit-e1a1c24.md::审计更正` |
| 边界配置 | 适用：窗口构成与语义行排除口径核对 | `tasks/T-190-cumulative-audit-e1a1c24.md::e1a1c24` |
| 副作用 | 适用：审计不改动仓库状态 | `tasks/T-190-cumulative-audit-e1a1c24.md::只读` |
| 性能 | 不适用：审计不承载性能承诺 | 无 |

## 自查清单

- 边界：窗口边界提交（e1a1c24 为 T-187 复位点登记提交、2e7c554 为窗口尾）与复位点登记口径一致。
- 异常路径：证据失实与三 task 终态的冲突处置（更正登记不改终态原文；T-189 active 文书行号随关闭修正）。
- 回归影响：审计不改代码；复位点登记后新窗口从本收口提交起算。

## 终态与证据

- 实现: 独立子代理累计审计（窗口 10 笔提交双轴全量）——跨改动交互五组全部核验闭环：①busyVersion×waitingStartsMemo：busyById 4 写点与 4 递增点一一对应（src/client.mjs:1968/1993/2011/5451），T-188 patch 路径 memo 失效覆盖完整；②时钟帧数据源隔离：T-188 合帧落盘延后只影响 host 磁盘，client 读路径走内存权威缓存（src/host.mjs:130-133 即 GET 响应源），无交互盲区；③queueSync 必达：33 处调用覆盖全部数据变化路径（applyAcksPatch/applyBusyPatch 尾部 queueSync，src/client.mjs:1994 及同构），check.mjs 红线断言机械保障；④锚点与签名隔离：progressAnchor 输入不含条目 progress/elapsedMs（src/core.mjs:2918-2950），时钟帧写回不污染记账与签名；⑤密度门控一致：job 条目仅 full 档入 active 与 lastCommittedEntries 同源。Spec 轴 4 条 non-blocking：N1 委托周期 settle 翻转延迟（T-189 后 grace 过期翻转由下一事件帧或 60s 时钟承载，呈现时机非数据正确性）；N2 回填退避重试稀疏化（30s+下一事件帧，R-02-004 不轮询承诺不损）；N3 patch 坏帧静默丢弃不自愈（丢失窗口较全量广播放大，EventSource 完整性+host 自产 JSON 使概率极低，登记残余）；N4 T-188 文书 review 行「六行」括注 5 行号表述 nit（实测 SOLUTION diff 7 处行号全部命中）。Standards 轴 2 条 judgement call：N5 patch/state 四函数解析骨架可再收敛为单 helper（规模小可选）；N6 busyVersion 记账家族 4 写点靠注释清单+人工纪律承载（可选单写入口，不翻 T-186 已定选型）。吞错/缺失校验与 map 无意触碰核验无 finding。
- 测试: 审计为只读活动；审计实跑 `node scripts/check.mjs` 全部断言通过（1465）；bundle blob 前后一致复核（746a27b）确认审计零改动；窗口内最近全量 e2e 为 2e7c554 上 24 specs 全绿。
- SOLUTION 对照: 窗口内 SOLUTION 8 处改动行（149/218/260/272/275/343/406/417）全部有测试影响表 update 行承载（T-188 三行 + T-186 一行），state/patch/500ms 合帧/裁剪口径在 map 各处自洽；PRD/DOMAIN/CONVENTIONS/TODO/RATIONALE 未触碰。
- commit: 2e7c554（审计窗口端点 e1a1c24..2e7c554；复位点登记随本收口提交生效）
- review:
  - 审核方: 累计审计独立子代理（单轮双轴，三线叠加跨改动专项）
  - 目的理解: 三条性能线叠加后的渲染/传输管线整体语义与交互盲区核验——单改动评审看不到 memo/记账/时钟/合帧结构的叠加失效，兼终态证据互证与 map 同步承载核对
  - 问题与修复: blocking 0。证据失实更正 4 处登记（审计更正口径，不改终态原文）：E1 T-186 终态断言计数应为 1402→1431（净增 29 非 37）；E2 T-188 终态计数应为 1431→1461（净增 30，起点继承 E1 失实值）；E3 T-188 终态 core.mjs 三函数行号应为 2980/3001/3033（2971 为注释区、3060 为内部函数）；E4 T-189 立项时钟回调行号应为 4072（4005 为 T-186 前旧基线）——随 T-189 active 文书关闭时修正承接。N5/N6 登记 TODO 待后续触及收敛；N1/N2/N3 登记终态残余
  - 复审结论: 双轴全量审计无 blocking；三条性能线叠加语义自洽、五组核心交互全部闭环；正互证清单（T-186/T-188 终态行号与全部 commit 哈希、specs=24、SOLUTION 八行号）全部命中；T-186/T-188 终态结构抽查齐备，T-189 active 文书与实现逐项一致
- 残余风险: N1 委托 settle 翻转静默窗口（下一事件帧或 ≤60s 校正，呈现时机非正确性，无专项 e2e）；N2 回填退避重试稀疏化（不轮询承诺不损，无专项断言）；N3 patch 坏帧丢失窗口（概率极低，与既有 state 坏帧同风格）；e2e 无 patch 帧线格式显式断言（T-188 已登记）；三线共用活实例同窗实测待东家重负载窗口。