---
doc-type: task
mutation: lifecycle
id: T-151
---

# T-151 子代理会话事件流打开前置持久父地址（自动加载修复）

状态: active
关联: R-01-009/AC-01～AC-03、R-01-012/AC-02、AC-03（缺陷修复）→ 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家实测（2026-09-20）——活动区子/孙会话卡片的工作项时间线不再自动加载与实时滚动，必须手动点选该子代理卡后才加载并恢复实时更新；主会话卡不受影响。
- 根因: dsh 0.1.5 起宿主按地址校验会话事件流路由——子代理会话（`header.origin === "subagent"`）经普通地址 `{kind:"session", sessionId}` 的 page/follow 一律被拒（`session/agent-busy`，"subagent Sessions require their durable parent address"，宿主 `api-session-controller/lib/types/history.js::validateAddress`）；持久子代理地址仅经原生导航（`SessionManager.select/selectSubagent`）留存，惰性 `get()` 建出的未点选子代理 Session 无地址并回落普通地址。T-123 迁移后活动卡时间线以 `session.eventSource` 窗口为主源，插件自动路径两处 open（`captureSessionLog` 守卫 open、`syncLiveness` 运行中无条件 open）均未先安装地址 → follow 被拒、`openState='error'`，两处 `.catch` 静默吞错并逐渲染重试 → `detail.history` 恒空、时间线走空分支。0.1.4 时代经 `api.history({sessionId})` 直读不依赖打开，故「以前可以」；e2e 与 mock LLM 均无子代理场景，回归未被抓到。
- 目标: 自动加载路径对子代理行在 open 前经 `session.configureSubagent` 安装从列表行派生的持久父地址，使未点选的子代理卡片时间线自动加载并随原生推送实时更新；已开失败的会话经地址变更 resync 自愈。

## 差距评估

- src/client.mjs `captureSessionLog`（open 守卫）与 `syncLiveness`（运行中订阅 open）open 前无地址安装。
- src/client.mjs `syncLiveness` 的 `opening = session.open?.()` 为无声明赋值（bundle 经典脚本非严格下靠隐式全局侥幸工作，严格化即抛 ReferenceError 中断整个 sync），同函数顺手收敛为显式声明。
- DESIGN 轮内状态/数据链句未承载「子代理事件流仅接受持久父地址」的宿主约束与插件处置，map≠code 需同次收敛。

## 收敛方案

1. `src/client.mjs` 新增 `ensureSubagentAddress(id, session)`：行 `origin === "subagent"` 且父会话有效时，经母会话子代理目录条目取地址 mode（mode 必须与子代理描述符一致，不符被宿主 subagent/unauthorized 拒绝——目录条目是唯一可靠 mode 来源，行 `continuable` 启发仅为深翻分页回退），调用 `session.configureSubagent(address, parentAvailable)`（与原生 selectSubagent 同构，不切换当前会话）；目录未加载时经 `sessions.refreshSubagents(parentId)` 单发拉取（每父会话至多一次、失败不热重试）并跳过本轮安装；非子代理或方法缺失为无操作，全程防御式 try/catch。
2. `captureSessionLog` 的 open 守卫块内、`syncLiveness` 的 open 前各调用一次，使首次 open 即携带合法地址；已存在 error 态窗口的会话经 `configureSubagent` 的 changed-address resync 自愈。
3. `sessionPageAddress` 增母会话目录参数：mode 目录条目优先、行启发回退，深翻分页地址与 open 地址同源同 mode。
4. `DESIGN.md` 轮内状态数据链句补宿主地址/mode 校验约束与插件前置处置（map 同步，PRD 不变；DESIGN 演进经东家批准立项时确认）。
5. `scripts/check.mjs` 增源码断言（`ensureSubagentAddress` 恰两处调用且均先于对应 open、目录拉取接线在位）与 bundle 断言（`configureSubagent`/`refreshSubagents` 进 bundle）。
6. `.dsh-plugin/client.js` 随实现重建并同次暂存。

## 测试计划

- `scripts/check.mjs`：新增 T-151 源码/bundle 断言（`ensureSubagentAddress` 先于两处 open、`configureSubagent` 进 bundle），锚定 R-01-012/AC-03（卡片随原生推送同步更新——地址缺失时 eventSource 窗口对子代理永不水合，该 AC 不可满足）。
- `pnpm verify:fast` 编辑循环；全量 `pnpm verify` 收尾回归。
- 东家实测: 重启宿主后未点选的子代理卡时间线自动加载并随工作推进实时滚动（R-01-009/AC-01、R-01-012/AC-03 实景）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-012/AC-03 | 修复：子代理卡 eventSource 窗口经持久父地址水合，原生推送驱动的时间线更新恢复可达 | UNIT | add | `scripts/check.mjs` 源码/bundle 断言（configureSubagent 先于 open 进 bundle） |
| DESIGN | 轮内状态数据链句补宿主子代理地址校验约束与插件前置处置 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：未点选的子代理卡时间线自动加载并随推送更新 | `scripts/check.mjs#R-01-012/AC-03` T-151 断言、`src/client.mjs::ensureSubagentAddress`、东家实测（终态记录） |
| 异常 | 适用：configureSubagent 缺失/抛错静默回落既有空白详情路径，不阻断主会话链路 | `src/client.mjs::ensureSubagentAddress` 防御式实现 |
| 边界配置 | 适用：非子代理行 no-op；父会话行缺失时沿用 pagedHistoryEvents 空白收敛 | `src/client.mjs::sessionPageAddress` 既有回退语义 |
| 副作用 | 适用：不新增订阅、轮询或定时器；地址安装复用原生导航同构路径 | `scripts/check.mjs#R-01-024/AC-03` 既有 fetch/EventSource 面断言不变化、`src/client.mjs::ensureSubagentAddress` 无新增网络面 |

## 终态与证据

- 实现: `ensureSubagentAddress` 目录驱动前置（母会话子代理目录条目承载 mode/parentAvailable；目录未加载经 `sessions.refreshSubagents` 单发拉取并跳过本轮安装）；`captureSessionLog` open 守卫与 `syncLiveness` 运行中订阅 open 两处接入；`sessionPageAddress` 增目录参数使深翻分页地址与 open 地址同源同 mode；`syncLiveness` 的 `opening` 无声明赋值收敛为显式 `let`；`subagentCatalogEntry` 单源目录查找。
- 测试: `pnpm verify:fast` 全绿（AgentMap lint、test impact、`scripts/check.mjs` 全部断言含 T-151 顺序钉与 bundle 断言）；`pnpm verify` 17/18 浏览器 E2E 通过，唯一失败 `background-jobs.mjs` 属并行会话新落的后台任务链路 spec——在其提交 a247f11 工作树（不含本修复）同 spec 同样失败（复跑实证），与本修复无因果；宿主侧 mode 校验（`validateAddress` 的 `identity.mode !== address.mode → subagent/unauthorized`）与 `configureSubagent`/`refreshSubagents`/`subagentsByParent` 契约经复审对照宿主 bundle 核实。未实测项：真实子代理会话的浏览器黄金路径（自动加载 + 随工作推进实时滚动）待东家实测回填——staging mock LLM 无委托能力造不出子代理场景；客户端 bundle 变更经 dsh-client-hmr 热载即生效，无需重启 dsh web。
- DESIGN 对照: 轮内状态数据链句补宿主地址/mode 校验约束、持久地址仅经原生导航留存语义、插件前置处置（目录 mode 优先 + 目录未加载先单发拉取再安装、与 selectSubagent 同构不切换会话），与实现对照无差异；DESIGN 同步经东家批准立项时确认（2026-09-20「批准」）。
- commit: dfffc0d、219165c、b500ffb
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = HEAD~1 a247f11 对工作树全 diff；修正轮 219165c 同轴复跑）
  - 目的理解: 在 dsh 0.1.5 宿主按地址校验子代理事件流路由（普通地址被 agent-busy 拒绝、地址 mode 须与描述符一致）的约束下，恢复未点选子代理卡时间线的自动水合与实时更新；插件在 open 前安装与原生导航同构的持久父地址，不切换当前会话、不新增订阅/轮询/定时器；PRD 不变，DESIGN 数据链句同步宿主约束。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS.md/CONVENTIONS.md + Fowler 基线；Spec 轴对照本 task 收敛方案与 DESIGN 契约句），两轴独立并行后聚合；修复后同轴复审一轮。
  - 问题与修复: ① 首版地址 mode 走行启发（列表行不携带 `continuable`，恒得 one-shot），continuable 子代理仍被宿主拒绝 → 改目录条目驱动，目录未加载先单发拉取并跳过安装；② `configureSubagent` 漏传 parentAvailable → 补传目录值；③ check 断言未锁定调用顺序 → 升级为「ensure 恰两处且先于对应 open」顺序钉 + bundle 断言；④ 目录条目查找两处重复 → 抽 `subagentCatalogEntry` 单源；⑤ 注释「目录未加载时回退」未覆盖在途空窗 → 措辞对齐实际回退面；⑥ `syncLiveness` 的 `opening` 无声明赋值（bundle 经典脚本下靠隐式全局侥幸工作）→ 显式 `let`；⑦ `refreshSubagents` 方法缺失时记账残留 → 前置方法存在性检查。全部修复经同轴复审确认收敛。
  - 复审结论: 通过。残余风险与测试缺口：宿主 mode 拒绝路径无运行时自动化回归（e2e 零子代理场景，mock LLM 无委托能力），行为证据依赖东家实测；`refreshSubagents` 拉取失败时该父会话的子代理保持空白详情降级且无诊断信号（与深翻失败的有界哲学一致，未观测到实际失败形态）；后台任务链路 spec 失败为并行会话在途工作，不在本 task 范围。
