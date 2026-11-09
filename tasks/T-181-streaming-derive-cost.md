---
doc-type: task
mutation: lifecycle
id: T-181
---

# T-181 活动窗格卡顿修复——派生与唤醒开销收敛

状态: active
类型: 性能优化
风险等级: major
风险面: 无（渲染管线内部开销收敛：呈现结果、jobs 订阅面与对外契约均不变，不触及契约、资金、数据迁移、对外接口、鉴权）
关联需求: R-01-009（时间线呈现回归面）、R-01-023（jobs 消费语义）、R-01-025/AC-08（资源纪律同向）、R-01-012（预览/模型回归面）、R-01-013（最近卡回归面）
决策依据: 东家批准 ~/ops/HANDOFF-dsh-activity-pane-卡顿修复.md 的修复方向并核定验收口径——事件流入期渲染进程燃烧 ≤ 修复前 55% 且剖析热点占比重新分布（原文书 <20% 目标按结构推算修正，东家 2026-11-09 批准）；达标类收敛按 map 不变短路处理，量化守恒对照 C-082 门禁口径。

## 背景与目标

dsh web 前端在后台 agent 会话活跃期出现整页卡顿。只读调查（HANDOFF-dsh-activity-pane-卡顿修复.md，证据基线 commit 6b2eb95）实测：渲染进程主线程 86–186%、CDP 剖析约 76% 样本集中于 `conversationTimelineFromHistory`、GC 约 19%，服务端无异常。根因在插件自身派生/唤醒管线。本 task 落地东家批准的 ①②③：

- ② render 侧复用 flush 侧派生结果，消掉每拍两遍全量折叠中的第二遍。
- ③ 时钟与流式派生的可见性门控（隐藏页停摆，回前台补齐）。
- ① jobs 状态订阅脏检查，签名不变的推送不点亮渲染轮。

明确不做：订阅面收窄（R-01-023/AC-01 要求窗格对全会话保有在跑任务感知，收窄属需求变更）；④a 有界回扫（宿主日志窗口本身有界：dsh doOpen 尾页 `maxMessages: 500`，活动 attempt 的 transient chunk 才是无界输入，回扫省不掉流式大头，挂账）；④b 真增量（TODO 登记，重剖后决断）。

调查补充的两项事实（修正原文书口径）：插件遍历的输入是宿主分页尾页窗口而非全会话历史；隐藏页烧核的真实来源是 flush 侧派生折叠（`setTimeout` 在活跃 WS 页面不被深度节流、照常触发折叠），而渲染管线经 rAF 挂起本就不消费其结果——因此 ③ 的主收益形态是隐藏页延迟派生，而非仅时钟门控。

## 差距评估

- PRD：无变化。时钟、jobs 呈现、时间线 settle 语义等可观察承诺全部保持；隐藏态本无可观察面。
- SOLUTION：定时器纪律（「仅保留运行中可见时长的单一 1 秒时钟」）、jobs 订阅描述（「订阅 state 快照变化重算，不新增轮询」）与新实现相容，不改写。
- 代码：`applyLogEvents` 每拍全量折叠+预览（src/client.mjs:2296-2299）；render 侧 memo 锚 history 引用必失效重算第二遍（src/client.mjs:4513-4517）；时钟无可见性门控（src/client.mjs:3914-3919）；recent 60s 定时器同（3923-3930）；jobs.state 订阅直通 queueSync（src/client.mjs:2572）；flush 派生定时器在隐藏期照常触发折叠（src/client.mjs:2479-2494）。
- 契约核对：窗格对 jobs 的全部消费经 `liveJobsOf`（status ∈ {running, stopping} 行的 id/kind/label/status/startedAt 五元组，src/core.mjs:2074-2094），`observed` 不消费——脏检查签名以此为界不丢语义。

## 收敛方案

1. ② render 侧复用：`applyLogEvents` 落地 `detail.history` 时同点记录 `detail.flushTimelineCwd`；render memo 失效重算处，当 `entryIdle === false` 且 cwd 未漂移且 `detail.timeline` 为数组时直接复用，否则照旧重算（阻塞等待卡的 settle 变体与 cwd 漂移保持重算路径）。
2. ③a 时钟门控：新增 `pageHidden()` 判定；`syncLiveness` 的 1s 时钟与 `syncRecentTimeClock` 的 60s 定时器仅在「需求成立且页面可见」时启动，否则停；回前台经既有 `visibilitychange → resumeRenderPipeline` 补一轮渲染并按需重启。
3. ③b 隐藏页延迟派生：`captureSessionLog` 在页面隐藏时不建派生窗、置 `logDerivePending`（记录回退 cwd）；在途 flush 定时器触发时遇隐藏同样顺延置位；派生体抽单点 `deriveSessionDetail`（子代理/cwd 消化时刻现取口径与 T-127 注释一致）；`resumeRenderPipeline` 回前台对 pending 详情按最新日志窗口一次补齐。
4. ① jobs 脏检查：
   - core 新增纯函数 `jobsPaneSignature(jobsBySession)`：全会话 live 行五元组稳定序列化、键序无关。
   - `jobs.state.subscribe` 回调先比对签名，不变则跳过 `queueSync`。
   - 代际更替时以当帧快照重置基线。
5. 无分叉点: 验收线与范围由东家批准口径承载（决策依据行）；实现形态均无第二认真候选——②复用点唯一、③门控点唯一、①签名以 liveJobsOf 消费面为唯一正确边界。

## 测试计划

- scripts/check.mjs：`jobsPaneSignature` 单测（空/非法输入归一空串；live 行五元组入签名；status 迁移与 label 变化改变签名；纯 done 行不入签名；键序无关）。
- e2e/specs/hidden-derive-resume.mjs（新增）：流式期间转入隐藏、回合在隐藏期收尾，回前台后卡片时间线补齐至落定态（约束延迟派生不丢数据、resume 补齐路径工作）。
- 既有回归面（全部保持通过）：
  - card-content：时间线/预览/settle 呈现。
  - background-jobs：任务卡与提升语义。
  - idle-quiescence：空闲静默。
  - mobile-thermal：C-082 rAF 阈值守恒。
  - density-resource：档位裁剪。
  - session-lifecycle。
- 隐藏期烧核消除的量化证据：仓库测试无法闭合（需要真实活跃负载窗），按 C-082 同款口径在 task 终态记录运行时实测对照（CDP 剖析脚本 ~/ops/tmp-dsh-cdp-profile.mjs），作为东家排期的验证窗口事项。
- 测试影响：PRD/SOLUTION 无变化（map 不变短路），无 AC 锚点变更。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：三项修复落地且可见呈现不变 | `scripts/check.mjs::jobsPaneSignature`、`e2e/specs/hidden-derive-resume.mjs::hiddenDeriveResume`、`e2e/specs/card-content.mjs::cardContent` |
| 异常 | 适用：隐藏期收尾、代际更替与订阅回退路径均有分支承载 | `e2e/specs/hidden-derive-resume.mjs::hiddenDeriveResume`、`src/client.mjs::lastJobsSignature` |
| 边界配置 | 适用：紧凑裁剪与隐藏门控叠加、无运行卡空闲静默 | `e2e/specs/density-resource.mjs::densityResource`、`e2e/specs/idle-quiescence.mjs::idleQuiescence` |
| 副作用 | 适用：渲染轮次下降不改变可见呈现与提醒及时性 | `e2e/specs/completion-sync.mjs::显示完成提醒`、`e2e/specs/mobile-thermal.mjs::MAX_RAF_REQUESTS` |
| 性能 | 适用：事件流入期燃烧降至验收线为关闭前置口径 | `e2e/specs/idle-quiescence.mjs::MAX_RAF_REQUESTS`、`e2e/specs/mobile-thermal.mjs::MAX_RAF_REQUESTS`；事件期量化（≤ 修复前 55%）由东家排期的运行时实测承载（T-181 终态记录） |

## 自查清单

- 边界：`detail.timeline` 未就绪（非数组）时复用条件不命中、走重算；`flushTimelineCwd` 缺失（旧详情对象）时不复用。
- 异常路径：隐藏期在途 flush 定时器与事件回调双路置 pending 不重复派生；`disposed` 后 resume/flush 均短路；jobs 订阅抛错保持既有 catch 回退。
- 回归影响：settle 语义（阻塞等待卡蓝闪落定）、流式 live 行合并、tool/call–result 配对呈现经 card-content 与 hidden-derive-resume 断言；jobs 提升/徽标/子卡语义经 background-jobs 断言。

## 终态与证据

（关闭时填写）
