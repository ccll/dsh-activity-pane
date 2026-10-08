---
id: T-159
doc-type: task
mutation: lifecycle
状态: completed
---

# T-159 适配 dsh 0.2.0-rc.2 客户端数据面迁移（staging 分支）

风险等级: standard

## 背景与目标

东家要求部署最新 RC（@deepseek-ai/dsh 0.2.0-rc.2）的独立 staging 环境并为本插件产出适配版本。
调查证据：`sessions.list` 删除 `current`/`subagentsByParent`/`jobsBySession`/`currentAddress`
（0.2.0-rc.2 `service.d.ts:43-52`，破坏始于 0.1.7-alpha.1）；`uiSession.pendingInteractions`
替换为 `sessionStatus`（client-ui-session `index.d.ts:142`）；`binding()` 收紧为只借用已保留
代际、`open()/dispose()` 移出会话面、`eventSource` 上移至 binding；`sessions.open` 删除，导航
改经 `uiWorkspace.openSession(target)`。宿主侧（host.mjs）四服务面经核对不变：`sessionQuery.
listEvents`、`SessionEventRecord`、`webServer.register`、`connection.requestRejection` 与
0.1.5 逐字一致。本 task 在适配分支承载全部差距，PRD 不变。

## 差距评估

1. current 高亮（6 处消费）→ 以行上 `retainedBy.mainView > 0` 推导（宿主外壳
   DocumentTitle/UiSession.publishMain/isMain 同款口径）。
2. 子代理目录（4 处消费）→ `list.projectionsBySession[parentId].values.subagentCatalog`
   （新条目形状 `{id, createdAt, mode, label?}`）+ `sessions.refreshProjections(parentId)`
   按需拉取；地址 mode 兜底改 `unknown`（0.2.0 SessionAddress 新增合法值）。
3. 后台任务（4 处消费）→ 注入 `jobs` 服务：`watchRows(ids)` 逐会话订 roster（随列表
   prune），`jobs.state.getSnapshot().rows` 形状与旧 `jobsBySession` 一致，
   `liveJobsOf` 逻辑不变。
4. 等待状态（2 处消费）→ `uiSession.sessionStatus`（HostObservable，Map<id,
   {running, pendingInteraction, completionUnread}>），stamp 路径取
   `.pendingInteraction.kind`。
5. 会话日志窗口/liveness（`binding()` 3 处 + `session.open()` 2 处 + `dispose()` 1 处）
   → retain 生命周期：`sessions.retain(target, { source: "dsh-activity-pane" })`，
   `reference.ready` 后接线 `binding.eventSource` 与 session 订阅；释放点 =
   可见性 prune / 紧凑档拆窗 / 服务代际更替 / dispose；子代理经
   `sessions.subagentAddress(childId)` 解析持久地址作为 retain target。
6. 卡片激活（`openSession` 经 `sessions.open`）→ `uiWorkspace.openSession(target)`，
   到达判定经 mainView 推导的 currentId 驱动既有重试链。
7. `sessionOpenLoads`（显式 open 记账）随 open 语义删除整体移除。

## 收敛方案

- core.mjs：新增 `currentIdOf(list)`、`subagentCatalogOf(projections, parentId)` 导出；
  `buildEntries`/`buildRecent`/`subagentTitle` 的 current 与目录输入改经新推导，
  其余派生逻辑与签名不变。
- client.mjs：inject 增 `jobs`/`uiWorkspace`；pending/jobs/catalog stamp 改源；
  新增 retain 引用登记（acquire/release/prune）；密度拆窗改 release；服务代际更替
  时整体释放旧代际引用。
- navigation.mjs：`openSession` 改调 `uiWorkspace.openSession`（语义改为"已受理"，
  到达判定交由重试链的 currentId 判定）。
- SOLUTION：数据源契约与生命周期段更新为 0.2.0 目标态；RATIONALE 记 C-086。
- e2e mock 双线协议（459ae1f）：dsh 0.2.0 DeepSeek provider 改走 Messages API
  （`${baseURL}/messages` SSE + tool_use 增量 + session-title LLM 起标题），
  mock 按 URL 分流，chat/completions 引擎保留（0.1.5 基线不受影响）。
- e2e 夹具模型 id（459ae1f/b5466ee）：0.2.0 宿主模型目录移除 deepseek-v4-flash，
  boot.mjs 改用两代共有的 deepseek-flash，helpers MOCK_MODEL 同步
  DeepSeek-V41-Flash（目录外 id 无显示名映射）。
- 移动端聚焦抑制时机（b5466ee）：uiWorkspace.openSession 的外壳聚焦 effect 与
  selection 同一提交周期，抑制从「到达判定后」前置到「发起导航时」武装。
- 滚动条/调宽手柄重叠（b5466ee）：0.2.0 宿主 scrollbar-width token 收窄为 5px，
  滚动区右缘 margin 取 `max(var(--dsh-scrollbar-width, 8px), 6px)` 下限=手柄宽。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| SOLUTION | 方案层演进：客户端数据源契约迁移到 dsh 0.2.0（边界与对外契约、活动状态模型、窗格渲染器内部结构；R-01-001/003/005/006/009/012/023 落点同步） | UNIT/E2E | update | `scripts/check.mjs` 快照形状与导航契约断言更新、`tmp-rc-diff/` tarball 证据；RATIONALE C-086 承载取舍 |
| R-01-001/AC-01 | 行为不变（等价源替换）：current 高亮改经 retainedBy.mainView 推导 | UNIT | update | `scripts/check.mjs` currentIdOf 推导与 isCurrent 断言（新快照形状） |
| R-01-003/AC-01 | 行为不变（等价源替换）：子代理目录改读 projectionsBySession 投影 | UNIT | update | `scripts/check.mjs` subagentCatalogOf 与子代理标题断言（projections 形状） |
| R-01-005/AC-01 | 行为不变（导航 API 替换）：激活改经 uiWorkspace.openSession | UNIT/E2E | update | `scripts/check.mjs` uiWorkspace.openSession 契约断言 + staging e2e 激活跳转 |
| R-01-023/AC-01～AC-08 | 行为不变（roster 源替换）：jobsBySession 改经 jobs 服务 state.rows | UNIT | update | `scripts/check.mjs` liveJobs 断言（jobs.state.rows 形状） |
| R-01-009/R-01-012/R-02-004 | 行为不变（retain 生命周期替换）：会话窗口与轮内订阅迁移 retain/release | UNIT/E2E | update | `scripts/check.mjs` retain/释放契约断言 + staging e2e 时间线与轮内订阅 |

## 测试计划

- 单元（scripts/check.mjs）：currentIdOf 推导、subagentCatalogOf 取数、
  buildEntries/buildRecent 在新快照形状下的条目派生与旧行为等价（锚定既有 R-ID AC）。
- 契约：client bundle 重建校验（pnpm check）。
- E2E：staging dsh 0.2.0-rc.2 上全量 `pnpm test:e2e`（每 spec 独立隔离环境）。
- 浏览器功能测试：长驻 staging 实例黄金路径（挂载/卡片/确认写回/busy 计时/激活跳转/
  窄屏抽屉），watch stderr 无 bundle skip 告警。
- 生产零影响：生产 PID 与 ~/.dsh 快照首尾对比一致。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：迁移后窗格在 0.2.0-rc.2 全功能可用 | `tasks/T-159-20261008-dsh-020-client-migration.md::pnpm test:e2e` |
| 异常 | 适用：快照缺字段/服务缺失时降级不抛错 | `scripts/check.mjs::currentIdOf` |
| 边界配置 | 适用：紧凑档拆窗、子代理地址缺失重试、归档/空白行过滤 | `scripts/check.mjs::logWindowSuppressedFor` |
| 副作用 | 适用：retain 引用不泄漏——离开可见集/卸载即 release | `scripts/check.mjs::releaseSessionRef` |
| 兼容性 | 适用：生产 0.1.5 环境零改动 | `tasks/T-159-20261008-dsh-020-client-migration.md::生产零影响` |

## 终态与证据

- 实现: 客户端数据面六处换源全部落地（currentIdOf 推导、subagentCatalog 投影 + refreshProjections 按需拉取、jobs 服务 roster、sessionStatus 等待态、retain/release 生命周期、uiWorkspace.openSession 导航）；审核修复补齐档位门控前置（紧凑档不发起水合）、无引用运行卡降级 sessionStatus/busy、深翻投影预拉、锚定补偿沉降窗化、聚焦抑制时机前置与窗宽分档；e2e 基建双线协议（Messages API mock、模型目录共有 id、公告循环清除）。
- 测试: pnpm verify:fast 全绿（agentmap lint + test-impact lint + check.mjs 全部断言）；`pnpm test:e2e` 带追踪全量 20/20 通过（E2E_TRACE=2，311318ms，/tmp/e2e-final8.log）；compact-density 单跑 4/4、session-lifecycle 单跑 3/3 复验；staging 长驻实例黄金路径 8/8（挂载/回合/完成提醒/确认写回/第二卡/激活跳转/控制台干净，stderr 无 bundle skip 告警）；生产零影响（PID 3936344 存活，~/.dsh 文件集合首尾零增删）。
- SOLUTION 对照: 数据源契约、活动状态模型、retain 生命周期、导航、档位资源纪律（门控先于 retain、降级状态源）均已写入目标态；双轴独立审核确认 map 与 code 一致（mode 陈述纠偏、C-086 收敛）。
- commit: 918fc77
- commit: 459ae1f
- commit: b5466ee
- commit: 4199fde
- commit: 387bfa5
- commit: bc33a34
- commit: c2257b9
- review:
  - 审核方: code-review skill 双轴并行子代理（Standards 轴 + Spec 轴，独立上下文）。
  - 目的理解: staging 分支把窗格客户端数据面迁到 dsh 0.2.0-rc.2（current/目录/jobs/等待态/retain/导航六处换源），PRD 不变、SOLUTION 演进到目标态；预期行为 = 行为不变迁移（AC 全集等价），验证 = verify:fast + 全量 e2e + staging 黄金路径 + 生产零影响。
  - 执行方式: code-review skill，评审基线 011db72（main merge-base），范围 011db72...HEAD 全部 7 commit；Standards 轴按 CONVENTIONS.md + AGENTS.md 工程原则 + Fowler 基线，Spec 轴按 task 差距评估/收敛方案 + SOLUTION 目标态，API 真实性经 0.2.0-rc.2 tarball d.ts 核实。
  - 问题与修复: ①（高）紧凑档门控前 retain 触发水合且引用常驻（双轴一致发现）→ 门控前置 + peekSessionFace 只借用 + 降级 sessionStatus/busy + 拆窗兜底释放 + check 断言恢复强度（387bfa5）；②SOLUTION mode 陈述失实（SubagentAddress 仍含 mode）→ 纠偏（387bfa5）；③深翻路径缺投影预拉 → ensureParentProjections + 重试（387bfa5）；④task 清单未含 b5466ee 两项 → 收敛方案补录四条（387bfa5）；⑤抑制重复武装（失败链连续吞聚焦约 30s）→ 窗宽分档 1200/60ms（387bfa5）；⑥注释形状失配、缩进残留、C-086/SOLUTION 文风 → 修正（387bfa5）；⑦三处 Duplicated Code → 抽 releaseAllSessionRefs/stopAllJobWatches/parentSessionIdOf + mock 派发与 tool_result 抽取合一（387bfa5）；⑧新发现（复审 2/3 轮）：释放紧凑档引用使高档位窗口异步重建，单帧锚定补偿漏后期增长 → 沉降窗逐帧补偿、仅按超时撤除（bc33a34、c2257b9）；⑨commit 标题类型与内容错配（🧪 实含行为修复，轻）→ 记录不重写历史。
  - 复审结论: Standards 轴「7/7 已修复，1 项新发现（轻，标题类型），判定通过」；Spec 轴两次复审均「全部已修复，无新问题，复审通过，无遗留阻塞项」（bc33a34 追加复审通过；c2257b9 两处均通过，两条不阻塞备注已处理/记录）。残余风险：紧凑档无引用运行卡不更新 detail.snapshot（取舍已声明，history 补读兜底）；e2e 偶发环境级抖动（宿主启动空白页/时序敏感断言，单跑均绿，已留失败截图证据链）；`.dsh-plugin/client.js` 为生成物不在审核范围。
- 状态说明：任务在 staging 分支（adapt/dsh-0.2.0-rc.2）承载，合入 canonical 前为 provisional；commit 387bfa5 标题类型错配为已记录偏差，不在未推送分支重写历史。
