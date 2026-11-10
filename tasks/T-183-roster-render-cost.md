---
doc-type: task
mutation: lifecycle
id: T-183
---

# T-183 名册渲染家族常量成本收敛（第一档：逐帧重复劳动消除）

状态: completed
类型: 性能优化
风险等级: major
风险面: 无（纯内部计算路径优化：呈现结果、jobs 订阅面与对外契约均不变，不触及契约、资金、数据迁移、对外接口、鉴权）
关联需求: 无新承诺——达标类性能收敛（map 不变短路，C-082 口径），消除已确认的逐帧常量耗电源；服务 R-01-001/AC-07（卡片集合排序呈现）与 R-01-023 的既有承诺不受影响
决策依据: 东家批准（2026-11-10）——活实例实测（4 运行会话并发）渲染进程 69–83% 单核，非空闲采样 53–54% 集中于名册渲染家族（HANDOFF 补记 2026-11-10 节）；东家批准第二刀方案（缓存化第一档先行，可见窗口订阅留待实测后再议）。

## 背景与目标

T-181 消除折叠放大后，活实例重负载实测（2026-11-10 11:27）定位出当前主要成本：窗格每次渲染交付对全部 4700 会话做多次全量扫描与逐会话重复计算，活跃期稳定烧 69–83% 单核（A/B 两版一致、与折叠正交）。本 task 以等价变换消除逐帧重复劳动，预期把活跃期占用压到 10–20% 量级；生产验收以活实例同窗实测对照（基线=2026-11-10 上午四窗数据）。

## 差距评估

- PRD：无变化（不改变任何可观察呈现与承诺；达标类收敛不增设机制类承诺）。
- SOLUTION：无变化（内部计算路径，定时器纪律与呈现契约不受影响）。
- 代码（热点函数与病灶，均带实测依据）：
  - `workspaceInfoForSession`（src/core.mjs:1395-1414）：每次调用遍历全部工作区×各区会话清单做字符串比对；buildEntries 对每个非子代理会话调用一次（src/core.mjs:1721）、buildRecent 对每个候选调用一次（src/core.mjs:2518）——每帧 O(名册×工作区会话数) 字符串比较，为四热点之最。
  - `currentIdOf`（src/core.mjs:1532-1540）：每次调用 O(全名册) 扫描 `retainedBy.mainView`；每帧被调 5–6 次（src/core.mjs:1610、2491；src/client.mjs:2284、4212、4792、4914、5072）。
  - `buildEntries` 的 `isArchived`（src/core.mjs:1617-1627）：每 id 新建 Set + 沿父链重走；该函数同时作为排除谓词被 `lineageActiveIds`（src/core.mjs:1633 传入 1628 的 descendantActiveIds）逐 id 反复调用，链走重复。
  - `lineageActiveIds`（src/core.mjs:1983-1996）：`Object.entries(byId)` 每帧分配 4700 项键值对数组。
  - `syncJobsWatches`（src/client.mjs:3936-3957）：每帧对列表快照全部 ids 重建 String 集合（约 4700 次 String 转换）做订阅差集。
- 明确不做：可见窗口订阅（R-01-023/AC-01 契约约束，属需求变更）；render 中 statusSnapshot 覆盖层的 byId 全量展开（src/client.mjs:4444）——原型链方案会改变 lineageActiveIds 的枚举语义，本轮不动、记残余风险。

## 收敛方案

1. core 新增纯函数 `buildWorkspaceIndex(workspaceItems)`：一次遍历工作区清单构建 `Map<sessionId, {title, key}>`（保持既有「先到先得」语义）；buildEntries/buildRecent 每帧建索引一次，逐会话 O(1) 查表；cwd 回退路径语义不变（未列入清单的会话按 cwd 匹配，工作区数少、代价可忽略）。
2. `currentIdOf` 加按快照引用的 WeakMap 记忆化（快照引用在两次推送间稳定，宿主侧缓存保证；null 结果同样入表，以 undefined 判未算）。render 的 currentId 在 statusSnapshot 覆盖层之前先算一次并复用（覆盖层不改 retainedBy，currentId 恒同）。
3. buildEntries 的 `isArchived` 改每帧一张备忘 Map：首个 id 走父链算出终态后整链入表，后续命中 O(1)；lineageActiveIds 的 isExcluded 复用同一闭包即命中备忘。
4. `lineageActiveIds` 的 `Object.entries(byId)` 改 `for...in` 枚举（免 4700 项数组分配；语义为自有可枚举键，与 entries 一致）。
5. `syncJobsWatches` 增按列表快照引用的短路：引用未变即订阅差集未变，直接返回；render 传入覆盖前的原始快照（ids 不受覆盖层影响）。
6. perf-ab 断言口径演进（T-183 内完成）：--check 指标从「折叠占比比值」换轨为「折叠绝对采样数比值」——占比比值分母随其他性能改动漂移（本 task 缩小非折叠盘即抬高折叠占比，实测正交对照 96→93 采样被误判 0.747>0.7），绝对采样数在同采样间隔同窗长下可比、对分母漂移免疫；缺省阈值 1.2 为守恒口径的噪声余量（正交 ≈1.0，捕捉折叠工作量增长 >20% 的回归；T-181 式减半表现为 ≈0.5 同样 PASS）。占比比值与总 CPU 比值降为参考项随报告输出；生产验收线（≤ 修复前 55%）仍以活实例 A/B 为准。
7. 无分叉点: 东家批准的方案范围即第一档缓存化（第二档属需求变更另议）；各修法均为行为保持的等价变换，无第二认真候选。

## 测试计划

- scripts/check.mjs：新增 `buildWorkspaceIndex` 单测（先到先得、cwd 回退、非法形状容错）；`currentIdOf` 记忆化行为断言（同快照引用返回同值、不同快照独立）；既有全部断言保持通过（行为保持性由既有 164 项单测承载）。
- e2e 全量：呈现语义不变的回归面（card-content、session-lifecycle、compact-density 等 22 specs 全绿）。
- 量化验证：活实例同窗实测对照（基线=2026-11-10 上午四窗：CPU 69–83% 单核、名册家族占比 53–54% 非空闲），修复版重测预期家族占比与总 CPU 显著下降；`pnpm perf:ab` 随跑作折叠机制守恒对照。
- 测试影响：PRD/SOLUTION 无变化，无 AC 锚点变更。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：等价变换后全部既有断言与呈现回归通过 | `scripts/check.mjs::buildWorkspaceIndex`；e2e card-content/session-lifecycle 全绿 |
| 异常 | 适用：非法快照/工作区形状、备忘 Map 与覆盖层快照的边界 | `scripts/check.mjs::buildWorkspaceIndex` 容错断言；既有 liveSessionFace/currentId 容错测试保持 |
| 边界配置 | 适用：三档密度、jobs 服务缺席、列表 pending 等既有分支不变 | `e2e/specs/density-resource.mjs::densityResource`、`e2e/specs/background-jobs.mjs::backgroundJobs` |
| 副作用 | 适用：缓存生命周期不跨快照代际、无泄漏（WeakMap 键随快照回收） | `scripts/perf-ab.mjs::measureProfiledEventPeriod` 复跑对照；代码审查覆盖缓存失效路径 |
| 性能 | 适用：活跃期单核占用显著下降（验收对照=2026-11-10 上午基线四窗） | `scripts/perf-ab.mjs::measureProfiledEventPeriod`（B 侧剖析热点分布对照）；活实例同窗实测终态记录（修复前 69–83% → 修复后实测值） |

## 自查清单

- 边界：快照对象为非记录/空对象时 currentIdOf 与索引构建的既有容错保持；workspaceItems 含重复会话 id 时先到先得语义不变。
- 异常路径：备忘 Map 不跨渲染帧存活（buildEntries 局部闭包），快照代际更替无陈旧缓存；syncJobsWatches 快照引用短路在服务代际更替（installServiceSubscriptions 重建）后正确重建订阅。
- 回归影响：
  - buildEntries/buildRecent/lineageActiveIds/currentIdOf 的输出对任意输入保持逐字段一致（既有单测为等价性证据）。
  - 呈现与排序保持不变；fmtRecentTime 分钟桶缓存使相对分级文案在桶内滞后至多 60 秒、桶界自愈（分钟级分级的既有呈现口径内），登记为已接受残余。
  - 残余：buildEntries/buildRecent 内部的 currentIdOf 收到覆盖层新快照（WeakMap 恒 miss），各留一次 O(名册) 重扫/帧；彻底消除须把 currentId 纳入入参，与位置参数收敛（TODO 既有登记）同窗处理。
  - perf:ab 断言口径已演进为折叠绝对采样数比值（见收敛方案 5）——本 task 后折叠绝对采样数应守恒，占比比值随分母漂移不再作断言依据。

## 终态与证据

- 实现: 工作区索引 buildWorkspaceIndex（buildEntries/buildRecent 每帧一次、逐会话 O(1) 查表，workspaceInfoForSession 保留 cwd 回退）；currentIdOf 按快照引用 WeakMap 记忆化 + render 覆盖层前单点计算；buildEntries 的 isArchived 每帧备忘整链入表；lineageActiveIds for-in 免分配；syncJobsWatches 快照引用短路差集重建（基线重置不依赖订阅成功）；fmtRecentTime 分钟桶有界缓存；perf-ab --check 口径演进为折叠绝对采样数比值（阈值 1.2）。
- 测试: scripts/check.mjs 全绿（新增工作区索引七断言与 currentIdOf 记忆化语义断言，含同引用期内冻结的行为钉住）；pnpm verify 全量 22 specs 全绿（含移动端热静默 rAF 门禁 PASS，C-082 对照）；隔离 A/B（base=b12bf15）：事件期总 CPU 比值 0.788、折叠绝对采样 96→93 守恒（正交性证明）；活实例 4 会话并发复测：workspaceInfoForSession 从首位热点（7587 样本）降至消失、currentIdOf 5380→2225/280、fmtAbsoluteDateTime 退出前八，CPU 43.9–81%（对照基线 69–83%，构成改善且随负载波动）。
- SOLUTION 对照: 纯内部计算路径优化，呈现与排序保持不变（map 不变短路，C-082 口径）；PRD/SOLUTION 未改写，无 AC 锚点变更。
- commit: 251cfc7
- review:
  - 目的理解: 活实例重负载实测（4 运行会话、4700 会话名册）定位出与折叠正交的名册渲染家族（非空闲采样 53-54%），本 task 以行为保持的等价变换消除逐帧重复劳动，验收口径为活实例同窗对照（基线=2026-11-10 上午四窗 69–83%）。
  - 问题与修复: 首轮双轴 8 条（Spec 5 + Standards 3）全部处置——perf-ab --check 阈值语义错配（占比口径换轨后缺省 0.7 会让正交 bundle 必 FAIL）已重校为 1.2 并改写头注；task 补记口径演进并改正「占比比值不受影响」的失实断言；覆盖层 currentId 残余如实登记（buildEntries/buildRecent 内部各留一次 O(名册) 重扫/帧）；installServiceSubscriptions 补订阅差集基线重置；for-in 注释补原型链说明；fmt 桶滞后登记为已接受残余。复审确认处置一一对应、blocking 清零，三处一行级残留（编号重复、占比行标签、基线重置在 try 内）已当场修复。
  - 复审结论: 双轴两轮（首审 8 条 + 复审确认）全部收敛，无 blocking；核心等价变换（工作区索引首命中语义、isArchived 备忘四情形、currentIdOf 记忆化边界）逐条核验成立。
- 残余风险与测试缺口:
  - buildEntries/lineageActiveIds 的 O(名册) 枚举为全量清点设计的固有成本，活跃期剩余占用以实测为准；进一步收敛须走可见窗口订阅（需求变更，须先改 PRD）。
  - buildEntries/buildRecent 内部 currentIdOf 收覆盖层快照（WeakMap 恒 miss），各留一次 O(名册) 重扫/帧；与位置参数收敛同窗处理（TODO 既有登记）。
  - fmtRecentTime 分钟桶缓存使相对分级文案桶内滞后至多 60 秒（分钟级分级呈现口径内），桶界自愈。
  - perf-ab 隐藏期比值为单样本高方差（实测 0.31/0.64/2.02 跨度），仅作参考不作断言依据。
- 活实例效果（2026-11-10 午后实测，4 运行会话负载）：workspaceInfoForSession 从首位热点（7587 样本）降至消失；currentIdOf 5380→2225/280；fmtAbsoluteDateTime 退出前八；总 CPU 活跃窗 82.7% → 81/43.9%（负载方差内，构成改善为结构证据）；名册家族占比 53–54% → 24–48%。
