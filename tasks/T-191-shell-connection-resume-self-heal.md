---
doc-type: task
mutation: lifecycle
id: T-191
---

# T-191 回前台壳层连接自愈——长时挂起后经 connection.reconnect() 收敛推送停滞

状态: completed
类型: 缺陷修复
风险等级: major
风险面: 无（不触及契约、资金、数据迁移、对外接口、鉴权；改动为窗格客户端内部自愈通道，壳层连接 API 按 dsh 既有公开面消费、不改变其契约）
关联需求: R-01-001/AC-03（会话状态变化应当自动更新窗格内容，无需用户手动刷新）——恢复既有承诺，map 不变短路；R-01-002/AC-12（客户端重连后完成/错误提醒恢复）同族既有承诺受益
决策依据: 东家拍板（2026-11-12）插件侧自愈方案——回前台触发壳层连接重建；同期调查确认近期 T-185～T-189 增量化改动与该症状无关，根因为壳层 gateway 连接层对「半开死连接」无检测且无回前台自愈（连接层仅 `online` 事件兜底、无心跳、无可见性处理；插件自建 acks/busy 通道已有同模式自愈先例）

## 背景与目标

移动 PWA 场景（东家报告 2026-11-12）：锁屏一段时间后回前台，会话在服务端早已结束，但卡片状态与颜色滞留「运行中」，仅退出 PWA 重进（整页重载）恢复。根因链路（本轮调查实证）：卡片 kind 的四路输入（`row.running`、`pendingInteraction`、jobs roster、委托周期后代）全部来自壳层推送式 store（`sessions.list`/`sessionStatus`，经 gateway 通道），不走插件自建 SSE；iOS 挂起后 gateway 连接常呈半开死形态（无 close 事件、无 `online` 事件——锁屏解锁不触发网络状态翻转），壳层连接层（dsh-client-connection）仅在「关闭被感知」或 `online` 事件时重连，无心跳、无 visibilitychange 处理，推送永久停滞；插件既有回前台自愈只覆盖自身 acks/busy SSE 与渲染管线（src/client.mjs:1890、2075、2091），壳层通道从未有同等自愈。

目标：回到前台（hidden→visible 边沿且隐藏时长达到阈值、或 bfcache `pageshow` 还原）时，经客户端 `connection` 服务公开面 `reconnect()` 强制壳层重建连接 generation——会话控制流随 generation 变化重启并重发全量快照（dsh-api-session-controller client.js `connection.generation.subscribe(connected)` → `control.restart()`），`sessions.list`/`sessionStatus` 收敛，卡片状态自愈。不新增轮询、不改变呈现承诺（R-02-001 定时器纪律、R-01-001/AC-03 自动更新承诺）。

## 差距评估

- PRD：无变化。R-01-001/AC-03 已承诺「会话状态变化时自动更新窗格内容，无需用户手动刷新」，本修复恢复该承诺在移动挂起场景的兑现，不新增承诺。
- SOLUTION：`运行时、并发与失败语义` 节补登回前台壳层连接自愈通道（既有 acks/busy SSE 重建与 resumeRenderPipeline 的同族机制显式化 + 新增 reconnect 通道），同次由本 task 记录 SOLUTION 测试影响行。
- 代码：src/client.mjs 新增可见性边沿监听与 `resumeShellConnection`；scripts/check.mjs bundle 契约断言；新增 e2e spec。
- 关键约束（正确性论证核心，评审重点）：
  - reconnect 只在 hidden→visible 边沿且隐藏时长 ≥ 阈值（默认 30s）时触发；bfcache `pageshow(persisted)` 无条件触发。短前台切换（tab 往返）不触发，避免桌面常规使用的连接churn。
  - 触发语义是「请求重建」而非「等待检测」：`connection.reconnect()` 置 immediateRetry 并中止当前 generation，新 generation 建立即全新 TCP 连接——半开死连接被绕开而非依赖检测；壳层 `online` 事件路径与 `MANUAL_RECONNECT` 语义同构。
  - 软依赖：`ctx.get("connection")` 缺失（cordis 返回 undefined）或 `reconnect` 不可调用时按可调用性判定静默降级，插件自身 acks/busy 重建与渲染管线自愈不受影响。
  - 与插件自身通道的边界：connection.reconnect 只作用于壳层 gateway generation，不触碰插件 acks/busy SSE（独立 HTTP 连接，既有回前台重建不变）；无反馈环（触发点仅可见性边沿）。
  - 健康连接上的代价：每次长隐藏回归一次重连握手与全流重开（与壳层对 `online` 事件的既有反应同构，单次有界）；短隐藏（< 阈值）不触发。

## 收敛方案

1. client.mjs 新增回前台壳层连接自愈块（置于既有 sync 可见性恢复块之后，同模式）：`visibilitychange` 监听 hidden 边沿记 `connHiddenAt`，visible 边沿按 `Date.now() - connHiddenAt ≥ RESUME_RECONNECT_MIN_HIDDEN_MS`（默认 30000，隐藏边沿未观测过则 0）判定后调用 `resumeShellConnection()` 并清零记账；`pageshow(persisted)` 无条件触发。
2. `resumeShellConnection()`：disposed 自门控；`ctx.get("connection")` 软依赖——cordis 对未提供服务返回 undefined，按 `reconnect` 可调用性判定降级缺席（try/catch 为防御性兜底，非语义依赖）；`reconnect` 存在才调用，调用异常吞掉并保持 acks/busy 自愈照常；触发时 `console.info` 登记隐藏时长（真机取证锚点，CONVENTIONS 移动端教训口径）。
3. e2e seam：URL fragment `dap-e2e-resume-reconnect-ms` 只覆盖阈值（0–3_600_000ms，参数缺失不构成覆盖——`Number(null)===0` 陷阱需显式 presence 判定）；hidden 边沿前置不放宽，合成事件的隐藏时长由 spec 以 stub `document.visibilityState` 承载；seam 注释随既有 T-089/T-090 形态登记（默认生产路径不变）。
4. cleanup：具名 handler 随卸载移除（与 acks/busy/sync 三组监听同型）。
5. SOLUTION `运行时、并发与失败语义` 节补登回前台自愈通道清单（acks/busy SSE 重建、渲染管线补齐、壳层连接重建），与既有节融合不平行追加。
6. 无分叉点: 东家拍板的方案范围即上述通道（决策依据行）；实现自由度仅在阈值取值与监听组织方式，无第二认真候选——壳层根修（连接层可见性探测）为跨仓独立路径，不在本仓范围。

## 测试计划

- e2e 新增 `e2e/specs/connection-resume.mjs`：seam 阈值收窄至 1s，stub `document.visibilityState` 合成真实 hidden→visible 对承载隐藏时长——长隐藏（1.2s ≥ 阈值）断言 console.info 自愈标记出现且新的 gateway WebSocket 连接出现（page.on("websocket") 计数增长）；负例钉门控语义（未观测 hidden 边沿不触发、短隐藏低于阈值不触发、同沿 2s 去重不双触发）；bfcache 还原（pageshow persisted）在去重窗外以正向用例钉住（防 handler 失效而去重负例仍全绿）。锚定 R-01-001/AC-03（状态变化自动更新、无需手动刷新）。
- unit/bundle 契约：`scripts/check.mjs` 新增断言——visibilitychange/pageshow 监听与卸载移除的具名 handler 字符串、`connection.reconnect()` 调用点、seam 参数读取入列。
- 移动壳层验证：mobile-shell/mobile-resume 既有 spec 全绿（本通道与既有自愈不互斥）。
- 全量 `pnpm verify`；`pnpm perf:ab --check`（若轻负载窗 fail-closed 按 T-186/T-188/T-189 既有口径以总 CPU 对照收口并如实登记）。
- 测试影响：PRD 无变化；SOLUTION 新增自愈通道描述（`SOLUTION` 动作行，随本 task 登记）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层表述新增：`运行时、并发与失败语义` 节补登「回前台通道自愈」三条路径（渲染管线/自建 SSE/壳层推送通道）——把既有 T-181/T-149 机制显式化并新增 T-191 壳层重建通道描述，机制文字，无承诺变化 | UNIT/E2E | update | 行为由 `e2e/specs/connection-resume.mjs`（新增）与全量 specs 承载 |
| R-01-001/AC-03 | 不变（缺陷修复恢复既有承诺） | E2E | 保留 | 会话状态变化自动更新窗格、无需手动刷新——本修复恢复其在移动挂起场景的兑现（connection-resume 新 spec 锚定） |
| R-01-002/AC-12 | 不变 | E2E | 保留 | acks 通道回前台重建行为不变（mobile-resume 等既有 spec） |
| R-01-009/AC-03、R-01-020、R-01-023 | 不变 | E2E+unit | 保留 | 渲染管线、累计时长、后台任务呈现不受影响（全量 specs） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：回前台长隐藏后 reconnect 触发、壳层快照重发后窗格收敛 | `e2e/specs/connection-resume.mjs::connectionResume`（新增）、`e2e/specs/mobile-resume.mjs::mobileResume` |
| 异常 | 适用：connection 服务缺失/reconnect 抛错静默降级，acks/busy 自愈与渲染管线不受影响 | `scripts/check.mjs::resumeShellConnection`（软依赖降级与调用点契约断言；降级路径的行为级断言为已知测试缺口，随终态 review 证据登记） |
| 边界配置 | 适用：未观测 hidden 边沿不触发、短隐藏低于阈值不触发、同沿 2s 去重、bfcache 还原正向触发、seam 阈值覆盖 | `e2e/specs/connection-resume.mjs::connectionResume` 场景 1（前置门控）、场景 2 去重段、场景 3（阈值门控）、场景 4（bfcache 正向） |
| 副作用 | 适用：桌面短切 tab 无额外重连、壳层流重建后窗格照常渲染、卸载监听清零 | `e2e/specs/idle-quiescence.mjs::idleQuiescence`、`e2e/specs/mobile-thermal.mjs::mobileThermal`、`scripts/check.mjs::onConnectionVisibilityResume`（卸载移除断言） |
| 兼容性 | 适用：dsh 0.2.0-rc.2 ConnectionHandle.reconnect 公开面；服务缺失降级不阻断窗格 | `scripts/check.mjs::resumeShellConnection` bundle 契约断言 |

## 自查清单

- 边界：hidden→visible 极短间隔（不触发）；连续多次隐藏-恢复（每次独立评估、hiddenAt 复位）；bfcache pageshow 与 visibilitychange 同帧到达（幂等，reconnect 幂等安全——重连即重建 generation，重复调用只多一次重建）。
- 异常路径：ctx.get("connection") 缺失（cordis 对未提供服务返回 undefined）→ 静默降级；reconnect 抛错不阻断 acks/busy 重建与渲染补齐；页面隐藏期收到事件不触发（visible 边沿判定）。
- 回归影响：既有三组回前台监听（acks/busy/sync）行为不变；定时器纪律与 R-02-004 不轮询承诺不损（事件驱动、无周期唤醒）；shell 流重启为壳层 online 路径既有形态，无新失败模式。

## 终态与证据

- 实现: src/client.mjs 回前台壳层连接自愈块（sync 可见性恢复块之后，src/client.mjs:2146-2204）——visibilitychange 双沿记账、严格 hidden 边沿前置门控（connHiddenAt===0 不触发）、隐藏时长阈值评估（默认 30_000ms，e2e seam `dap-e2e-resume-reconnect-ms` 只覆盖阈值且缺参不构成覆盖）、bfcache pageshow(persisted) 无条件通道、2s 同沿去重（只由实际触达 reconnect 的消费推进）、软依赖 `ctx.get("connection")`（cordis 对未提供服务返回 undefined，按 reconnect 可调用性降级缺席，try/catch 防御性兜底）与 reconnect 调用异常隔离；卸载具名 handler 成对移除（src/client.mjs:5533-5534）。
- 测试: `pnpm check` 全绿（新增 4 条自愈契约断言：监听注册/卸载成对、软依赖 reconnect 调用点、seam presence 判定与具名常量）；`e2e/specs/connection-resume.mjs` 实跑通过——长隐藏（stub 承载 1.2s ≥ seam 1s）断言自愈标记与新 gateway WebSocket 世代出现，负例钉前置门控/阈值门控/2s 去重，bfcache 去重窗外正向钉住；全量 `pnpm verify` 25 specs 全绿（409691ms，exit 0；首轮 auto-update 超时为偶发，单跑与本轮全量均通过）；`pnpm perf:ab --check` PASS。
- SOLUTION 对照: SOLUTION.md「运行时、并发与失败语义」新增「回前台通道自愈」条目（渲染管线/自建 SSE/壳层推送通道三路径清单）与实现逐语义一致——≥30s 阈值、2s 去重、bfcache 无条件、短切 tab 不触发、软依赖静默降级、事件驱动无周期唤醒（R-02-001 不轮询承诺不损）；E2E 契约失败语义行补「断言壳层连接世代重建的 spec 除外」例外句；核对日期按仓库近期实践（T-188/T-189 关闭亦未更新）保持不动。
- commit: 047a7b1（task 文书与实现、测试、SOLUTION、bundle 同笔工作单元提交；验证矩阵证据引用与提交树一致性由 pre-commit lint 裁决，故未按 T-189 先例拆独立立项提交）。
- review:
  - 审核方与执行方式: code-review skill 双轴独立子代理（Spec 轴 + Standards 轴并行，缺省方式）
  - 目的理解: 移动 PWA 挂起后半开死壳层连接致卡片状态滞留至整页重载，回前台经软依赖 reconnect() 重建 generation 收敛壳层推送（R-01-001/AC-03 恢复既有承诺，map 不变短路）；约束为事件驱动无轮询、短切 tab 不触发、软依赖降级不外溢、seam 默认生产路径不变。
  - 问题与修复: Spec 轴 1 条 blocking——seam `Number(null)===0` 叠加 `>=0` 使参数缺失时 override 恒真、叠加「前置放宽」后每次 visible 边沿强制重建（生产门控失效），修复为显式 `raw !== null` presence 判定并删除「前置放宽」（scope creep），e2e 改 stub document.visibilityState 承载真实隐藏时长并补 bfcache 正向锚点；Standards 轴 0 blocking、5 条 judgement call（cordis 注释语义纠正、SOLUTION E2E 契约例外句、e2e 时序加固、验证矩阵证据归属纠正、console.info 维持）全部落实。
  - 复审结论: 两轴复审通过——blocking 清零、无新引入问题，同意收口（残余：WS 计数未过滤 URL、reconnect 抛错窗口已消费可接受、降级路径行为级断言缺位为登记在案的测试缺口）。
- 残余风险与测试缺口: 降级路径无行为级断言（仅 bundle 契约承载，登记为已知测试缺口）；e2e WS 计数未过滤 URL（单 WS 源前提下以标记共现佐证）；默认 30s 路径无直接 e2e（30s 不可等，由 bundle 契约与 seam 门控负例间接承载）；真机半开死形态桌面不可复现（spec 为机制级断言）；iOS 无 hidden 边沿观测的病理路径不覆盖；健康连接每次长隐藏回归一次重连握手（与壳层 online 路径同构、单次有界）。

