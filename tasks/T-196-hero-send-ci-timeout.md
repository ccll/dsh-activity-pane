---
doc-type: task
mutation: lifecycle
id: T-196
---

# T-196 收敛 hero 发送等待在 hosted runner 上的超时

状态: completed
类型: 缺陷修复
风险等级: major
风险面: 测试基础设施（e2e 共享 helper 的发送等待与重试，影响全部会话语料创建路径）；不触及产品代码与对外行为
关联需求: 无（不改变任何 AC 承诺；修复对象是 e2e 共享辅助）
决策依据: 东家 2026-11-17 批准开缺陷修复 task 收敛 main CI 连续两版红。证据：v0.19.2 的 CI run 43831539253（2026-11-16T08:47）与 v0.20.0 的 CI run 44032781243（2026-11-17T06:42）在同一 spec、同一等待上失败，报错均为「等待超时：发送消息「e2e:fast 紧凑后续会话」（最后观测：null）」；本地与 pre-push 的 compact-density 全绿（三次单跑 3/3 PASS）。

## 背景与目标

- 背景: `e2e/specs/compact-density.mjs`（及同形态的 `auto-update.mjs`）在 hosted runner 上稳定超时于 `sendHeroMessage` 的发送轮询：hero composer 已出现，但 20s 内始终不离开 hero 页。本地与 pre-push 同 spec 全绿，失败只出现在 hosted runner。
- 根因假设: 原实现以「1s 后 hero.count()===0」判定发送完成，判据偏弱——只看 hero 短暂缺席可能在水合重挂载时误判；而慢机上发送受理后切页可能超过 1s，会被判成未受理而重填重发。本地复现出另一面：发送立即返回后紧接着点「New session」会落在宿主过渡期被忽略（hero 不再出现）。
- 目标: 发送循环在 hosted runner 的三种形态下收敛——hero 被迟到的会话切换替换时重开再试、发送动作被宿主丢弃时以发送按钮启用为「可发送」信号并点按钮投递、受理后只等落地不重发；外层窗口按 hosted runner 放宽；不改变任何断言口径。
- 非目标: 不改产品代码、不改 spec 断言、不引入通用重试框架、不改其它 helper 的等待窗口。

## 差距评估

- 代码（改前）: `sendHeroMessage` 以「1s 后 hero.count()===0」判发送完成，依赖键盘 Enter；hero 短暂缺席会被判成已发送（轮询空转），hero 被迟到切换替换时 `fill` 永远写不进，hosted runner 上表现为 20s 超时。
- 测试（改前）: 失败只有「等待超时：发送消息（最后观测：null）」，无法区分「草稿未注册 / 按钮未启用 / 点击被丢弃 / 已受理但切页慢」。
- map: 无差异——本次不改产品行为，PRD/SOLUTION/DOMAIN 无需演进；失败属 e2e 基础设施缺陷。
- 环境: 失败仅出现在 hosted runner（本地与 pre-push 全绿），需以 CI 日志作为复现证据。

## 收敛方案

- 无分叉点: 修复对象与判据由 CI 日志唯一确定（草稿未注册/hero 被替换），方案选择不改变产品行为。

- 落判据改为「hero 编辑器不在场且会话页 composer 在场」（`landed`）：只判 hero 缺席会把水合重挂载误判成已发送，轮询空转返回真、会话根本没创建；命中后等 800ms 稳定窗再返回（hero 消失与会话页可交互之间还有过渡，紧随其后的「New session」点击落在过渡期会被宿主忽略，本地复现并以此修掉）。
- 投递改为点「Send message」按钮：该按钮在草稿为空时 disabled、草稿被宿主注册后启用，是比键盘焦点可靠的「可发送」信号；按钮仍 disabled 视为草稿未注册、本轮重填。Enter 依赖键盘焦点，CI 实测草稿未注册时发送被静默丢弃。
- hero 恢复分支：hero 不在场且尚未点过发送（`clickedSend` 为假）时，重新点「New session」回 hero 再试；已点发送则以「已受理」处理、只等落地不重发，避免已发送时再开一个新会话。
- 受理证据三态（均不以「草稿为空」判定——水合清空同样是空草稿，重填才是正确恢复）：①会话页 composer 出现；②发送按钮回到 disabled；③点过发送且 hero 消失。第③态没有宿主消费证据，是窄竞态下为避免叠发的保守选择，可能把「点击被丢弃」误判为受理；第②态的按钮是页面级 locator，hero 不在场时会解析到会话页 composer 的同名按钮（宿主共用同一 composer 组件），disabled 不一定代表 hero 草稿已被消费。两处都由 45s 超时与错误观测（hero/composer 计数）暴露，作为残余风险登记，不声称「必然不会误判」。
- `fill` 用 5s 短超时（切页中节点已卸载时不再空等默认 30s）；外层窗口 20s → 45s，与其它启动期等待的放宽口径一致。
- 超时错误附本轮观测（草稿未就绪/按钮未启用/已受理待切页/发送未受理 + hero 与会话 composer 计数），CI 复红可直接定位。
- 否决 `page.waitForFunction` 页内轮询：实测会显著拖慢后续步骤（同 spec 从 20s 涨到 222s），改用 locator 计数轮询。
- 注释记录触发场景与「先等落地再重发」的理由（代码说不出的约束）。

## 测试计划

- 本地回归：`node e2e/run.mjs compact-density`（该 spec 是失败发生点，覆盖 hero 发送与历史会话激活路径）与全量 `pnpm verify`（26 specs，确认共享 helper 改动不波及其它会话创建路径）。
- 环境级验证：推送后观察 main CI 的 compact-density 是否转绿；若仍红，按 CI 日志继续收敛（该 spec 为此前唯一失败点）。
- 证据口径：本地无法复现 CI 专属竞态，回归证据为本地全量绿 + CI 复跑结论；不新增断言（避免为慢机形态引入可在本地空转通过的断言）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：hero 发送在本地与 hosted runner 都能落地并建立会话 | `e2e/specs/compact-density.mjs#R-01-021`、`scripts/acceptance.mjs::steps`、`e2e/helpers.mjs::sendHeroMessage` |
| 异常 | 适用：草稿被水合清空、发送按钮未启用、hero 被迟到切换替换时都能显式超时或恢复 | `e2e/helpers.mjs::sendHeroMessage`、`e2e/specs/auto-update.mjs#R-01-001` |
| 边界配置 | 适用：hero 被替换后重开不产生多余会话——本轮以一次性探针实测卡数恰为 2（探针未入仓）；现有 spec 的 `done >= 4` 断言发现不了多开会话，属测试盲区 | `e2e/specs/compact-density.mjs#ACTIVE_DONE_COUNT`、`e2e/helpers.mjs::newSessionWithMessage` |
| 副作用 | 适用：每次发送新增 800ms 稳定窗对依赖计量的 spec（移动热静默、空闲静默窗）不越阈值 | `e2e/specs/mobile-thermal.mjs::mobileThermal`、`e2e/specs/idle-quiescence.mjs::idleQuiescence`、`e2e/helpers.mjs::sendHeroMessage` |

## 自查清单

- 边界：hero 被迟到的会话切换替换（hero=0 且会话页 composer 在场）时不得丢消息，也不得因重开而多开会话——探针实测卡数恰 2；重开失败以「hero 不在场且重开失败」显式超时。
- 异常路径：草稿被水合清空与按钮保持 disabled 两种形态必须走重填；点击被宿主丢弃时以超时暴露，不得静默返回成功。受理证据限三态（composer 出现 / 按钮 disabled / 点过发送且 hero 消失），其中第三态与「按钮解析到会话页同名按钮」两处存在窄竞态误判可能，已作为残余风险登记；超时错误带 hero/composer 计数。
- 回归影响：共享 helper 改动波及全部会话创建路径；`compact-density`、`auto-update`、`long-list`、`mobile-resume`、`back-to-top` 单跑全绿，全量 26/26 通过，CI run 44050672159 success。

## 终态与证据

- 实现: `e2e/helpers.mjs` 的 `sendHeroMessage` 重写发送循环——草稿校验 → 等「Send message」按钮启用（空草稿时宿主置 disabled，草稿注册后启用）→ 点按钮投递 → 落地判据「hero 编辑器不在场且会话页 composer 在场」+800ms 稳定窗；新增 hero 恢复分支（hero 被迟到的会话切换替换且尚未点发送时，重新点「New session」回 hero 再试；已点发送则只等落地不重发）；`fill` 用 5s 短超时；外层窗口 20s → 45s；点过发送后 hero 消失按「已受理」记法、只等落地不重发；超时错误附本轮观测（草稿未就绪/按钮未启用/已受理待切页/发送未受理 + hero 与会话 composer 计数）。`newSessionWithMessage`、产品代码、断言口径、PRD/SOLUTION/DOMAIN 均未改动。
- 测试: 本地单跑 `compact-density` 3/3、`auto-update` 1/1、`long-list` 3/3（全量中一次滚动断言失败，单跑全绿；e2e runner 为串行 `MAX_CONCURRENCY=1`，属未复现偶发失败）；恢复路径以一次性探针实测「hero 被会话切换替换 → 重开 hero → 发送」成功、卡数恰 2（探针未入仓，见验证矩阵边界行）；全量 `pnpm verify` 多次通过（26/26，415534ms / 410376ms，lint 与 unit 全绿）。CI：run 44050672159 在 HEAD ada45fe 上 success，main push 全量 26/26（387867ms）；此前两版红为 v0.19.2 run 43831539253 与 v0.20.0 run 44032781243 的同一条「等待超时：发送消息」。
- SOLUTION 对照: 本次只改 e2e 共享辅助，无产品行为、对外接口或数据结构变化；SOLUTION 不登记测试基础设施的实现细节，PRD/SOLUTION/DOMAIN 与实现对照无差异，agentmap lint 与测试影响门禁通过（测试影响报告 changed=0，无 map 语义变化）。
- commit: bc19aff（落判据 + 落地稳定窗）、ae18466（发送按钮投递 + 超时诊断）、ada45fe（hero 重开恢复）
- review:
  - 审核方: 独立子代理双轴评审（Spec 轴 + Standards 轴，独立上下文，两轮）
  - 目的理解: 两版 main CI 在同一处 `sendHeroMessage` 超时（v0.19.2 run 43831539253 与 v0.20.0 run 44032781243 同断言），本地不可复现；目标是让发送等待在 hosted runner 的慢机、水合清空、hero 被迟到切换替换三种形态下收敛，不改产品代码与断言口径，证据为本地全量绿 + CI 复跑。
  - 问题与修复: 第二轮 blocking（受理证据口径与记录冲突）按复审给出的选项②处置——不改已绿的代码，改定三处记录（收敛方案/自查清单/本节）：如实写明三态受理证据，并明确第三态（点过发送且 hero 消失）与「按钮是页面级 locator、可能解析到会话页同名按钮」两处窄竞态可能把「点击被丢弃」记成受理，由 45s 超时与观测暴露；不声称「必然不会误判」。首轮 6 条非阻断——记录与实现不一致（删除 click 相关表述）、accepted 双义（改为以会话页 composer 出现/按钮 disabled 为受理证据）、与 task 无关的 count 抽取（复原单行）、重复与盲等（leftHero 并入 landed、复用 sessionComposer、注释写明 800ms 稳定窗理由）、诊断缺失（超时错误附本轮观测与 hero/composer 计数）、时序依据不足（45s 与 800ms 在收敛方案记明来历）。CI 日志驱动的两处实质改动：投递从 Enter 改为点「Send message」按钮（Enter 依赖键盘焦点，CI 实测草稿未注册时发送被静默丢弃）；hero 被替换时重开恢复且已点发送不重发（避免多开会话）。
  - 复审结论: 第二轮 blocking 按「只改记录、明确残余」处置（选项②），非阻断项（验证矩阵引用失实、边界证据仅一次性探针、把偶发失败说成并行负载抖动、45s 无实测依据）一并改为如实记录；首轮 6 条非阻断确认处置。按钮投递不弱化发送成功判据（所有 sent 返回必经 landed）、hero 重开分支不误开会话。残余风险：三态受理证据中的第三态与页面级按钮解析可能把「点击被丢弃」记成受理（窄竞态，超时带观测）；恢复分支依赖「New session」在 hero 被替换后仍可用；800ms 稳定窗为盲等；45s 无实测分布支撑；现有 spec 无法发现多开会话（边界证据为一次性探针）；超时诊断中的计数读取在页面关闭时可能以 Playwright 错误盖掉超时信息。
