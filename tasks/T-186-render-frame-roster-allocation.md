---
doc-type: task
mutation: lifecycle
id: T-186
---

# T-186 渲染帧名册级分配清零

状态: completed
类型: 性能优化
风险等级: major
风险面: 无（纯内部计算路径优化：呈现结果、订阅面与对外契约均不变，不触及契约、资金、数据迁移、对外接口、鉴权）
关联需求: 无新承诺——达标类性能收敛（map 不变短路，C-082 口径）；R-01-001 排序呈现、R-01-010 历史区、R-01-023 jobs 消费语义的既有承诺不变
决策依据: 东家批准（2026-11-10）性能双路深查结论与第一刀方案——「渲染帧名册级分配清零」，验收口径为 perf-ab A/B 对照与活实例同窗实测（基线=2026-11-10 午后：CPU 约 50% 单核、GC 约 12%、折叠 0%）

## 背景与目标

三刀性能线（T-181/T-183/T-185）落地后，双路只读深查（2026-11-10）定位剩余主体成本为「每个已提交渲染帧对全名册（实测 4784 会话目录）的无条件分配与物化」：

每个已提交渲染帧的固定成本由四项构成：

- statusSnapshot 覆盖层每帧 `{ ...byId }` 加 `{ ...snapshot }` 全量克隆（src/client.mjs:4544-4553），并每帧换快照引用使 currentIdOf 的 WeakMap 记忆化恒 miss（T-183 登记残余的根因）。
- busyById 遍历重建 waitingStarts Map 逐帧发生（src/client.mjs:4568-4571）。
- buildRecent 为显示前 10 条把全部历史候选物化成完整条目对象再全量排序（src/core.mjs:2603-2648 逐候选 push 完整对象，src/client.mjs:4771 仅取前缀）。
- buildEntries 与 buildRecent 每帧各重建一份 workspaceIndex（src/core.mjs:1729、2598）。

另有排序平局裁决一处：`ids.indexOf(a) - ids.indexOf(b)` 每对比较两次 O(名册) 线性查找（src/core.mjs:1802），同刻时间戳聚集时退化。

目标：以行为保持的等价变换消除上述逐帧分配；渲染 CPU 与 GC 占比显著下降，量化由 scripts/perf-ab.mjs A/B 与活实例同窗实测承载。

## 差距评估

- PRD：无变化（不改变任何可观察呈现与承诺；达标类收敛不增设机制类承诺，C-082）。
- SOLUTION：无变化（内部计算路径；渲染签名语义、档位跳写、定时器纪律均不受影响）。
- 代码：上述四处病灶 + currentIdOf 覆盖层恒 miss 残余（T-183 自查清单登记项）。
- 契约核对：currentId 入参化后 buildEntries/buildRecent 的 currentId 取值语义与现路径一致——覆盖层不改 retainedBy，覆盖前后 currentId 同值（T-183 已证，src/client.mjs:4576-4581 注释即此结论）。

## 收敛方案

1. 覆盖层引用短路：render 记录上一帧 statusSnapshot 引用，引用未变时复用原快照对象不换壳；waitingStarts 的重建按 busy 内容版本记账（busyById 为原地 clear+set 变更，Map 引用恒不变，不得以 Map 引用作 memo 键），版本未变即复用上帧 Map。收益同时消掉 currentIdOf 帧内恒 miss。
2. buildRecent 两段式：先对候选做轻量过滤与排序键收集（仅读行字段与既 memo 值，不做工作区/标题/模型物化），排序取前 recentVisibleCount 前缀后仅对入选者物化完整条目；total/hasMore 用计数维护；排序语义（activityAt 降序、平局按 id 字典序）逐字段等价。
3. buildWorkspaceIndex 按引用 memo：workspaceItems 引用未变即复用上次索引（WeakMap 承载），buildEntries/buildRecent 共用。
4. buildEntries/buildRecent 位置参数（8/9 个）收敛为 options 对象，currentId 纳入入参：
   - 消除两函数内部 currentIdOf 的 O(名册) 扫描，与 TODO「buildEntries/buildRecent 位置参数收敛」既有登记同窗完成。
   - 调用点迁移：src/client.mjs 2 处、scripts/check.mjs 断言调用机械迁移，输出逐字段等价由既有测试承载。
5. buildEntries 排序平局裁决预建 id→index Map（src/core.mjs:1802），消除同刻聚集下的二次方退化。
6. 无分叉点: 东家批准的方案范围即上述等价变换（决策依据行）；各修法行为保持、无第二认真候选；options 收敛为既有 TODO 登记方向的执行而非新决策。

## 测试计划

- scripts/check.mjs：
  - 覆盖层同引用短路断言（statusSnapshot 引用不变时渲染不产生新快照对象、currentIdOf 帧内命中、busy 版本变更时正确重建）。
  - buildRecent 两段式与全量物化在多形态输入（平局聚集、归档、完成/错误提醒、liveJobs、空名册、非法形状）下逐字段等价断言。
  - workspaceIndex memo 命中与失效断言。
  - options 迁移后全部既有断言保持通过（等价性证据）。
- perf 守恒：`pnpm perf:ab`（--check 折叠绝对采样数阈值 1.2）PASS；隔离 A/B 记录事件期总 CPU 比值。
- e2e 全量：`pnpm verify` 24 specs 全绿（含 mobile-thermal rAF 阈值守恒，C-082 对照；计数经 T-187 审计更正——T-185 新增增量等价 spec 后总数为 24）。
- 测试影响：见下方测试影响表（SOLUTION 表述同步随关闭提交落地；PRD 无变化，无 AC 锚点变更）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层表述同步：历史分页运行时的前缀分工随 buildRecent limit 入参实现更新（机制文字，无承诺变化） | UNIT/E2E | update | 行为逐字段等价由 scripts/check.mjs 1439 断言与全量 24 specs 承载 |
| R-01-010/AC-08、AC-09 | 不变 | E2E+unit | 保留 | 历史区时间序排序与分页语义不变（对抗夹具 + recent-infinite-scroll） |
| R-01-001/AC-07 | 不变 | unit | 保留 | 活动卡片集合排序输出逐字段一致（平局索引语义等价断言） |
| R-01-023/AC-01、AC-04 | 不变 | unit | 保留 | jobs 消费面与徽标口径不受 options 迁移影响（background-jobs 断言保持） |
| R-01-025/AC-08 | 不变 | E2E | 保留 | 档位资源纪律与移动端热静默 rAF 门禁守恒（density-resource、mobile-thermal PASS） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：等价变换后全部既有断言与呈现回归通过 | `e2e/specs/card-content.mjs::cardContent`、`e2e/specs/session-lifecycle.mjs::sessionLifecycle` 全绿；`scripts/check.mjs::buildRecent` 既有断言保持，新增两段式等价断言随实现提交登记 |
| 异常 | 适用：非法快照/工作区形状、statusSnapshot 为 null 或非 Map、busyById 缺席 | `scripts/check.mjs::buildRecent`（容错断言，既有容错用例保持） |
| 边界配置 | 适用：三档密度、recentVisibleCount 各档、历史分页手动追加 | `e2e/specs/density-resource.mjs::densityResource`、`e2e/specs/recent-infinite-scroll.mjs::recentInfiniteScroll` |
| 副作用 | 适用：memo 不跨代际泄漏（WeakMap 键随快照/工作区清单回收） | `scripts/perf-ab.mjs::measureProfiledEventPeriod` 复跑对照；代码审查覆盖缓存失效路径 |
| 性能 | 适用：渲染 CPU 与分配下降 | `scripts/perf-ab.mjs::measureProfiledEventPeriod`（A/B 总 CPU 比值 + 折叠采样守恒）；活实例同窗实测终态记录 |

## 自查清单

- 边界：空名册、全部活动（历史候选为空）、statusSnapshot 为 null/非 Map、turnEnds 全缺、workspaceItems 非数组。
- 异常路径：覆盖层 memo 在 statusSnapshot 代际更替后正确重建；buildRecent 两段式在任何候选集合变化下与全量路径一致；平局 Map 在 ids 变化帧重建。
- 回归影响：buildEntries/buildRecent 输出对任意输入逐字段一致（既有单测为等价性证据）；呈现与排序不变；currentId 入参化后覆盖层前后取值同值（T-183 结论承载）。

## 终态与证据

- 实现: 五项等价变换全部落地——buildWorkspaceIndex 按引用 memo（WeakMap，非数组不入 memo，src/core.mjs:1454）；createStatusOverlayMemo 覆盖层（基快照×statusSnapshot 双引用短路，client render 不换壳，T-183「currentIdOf 覆盖层恒 miss」残余根因消除，src/core.mjs:1503）与 createWaitingStartsMemo 按 busy 内容版本记账（busyById 三处变更点递增 busyVersion：applyBusyState/applyBusyBackfill/cleanup，src/client.mjs:1932/1950/5266）；buildEntries/buildRecent 收敛单 options 入参 + currentId 入参化（调用点 84 处全迁移：client 2 + check 78 + bench 4，函数内 O(名册) 重扫消除）；buildRecent 两段式（第一阶段全谓词过滤只收轻量键、排序取时间序前缀后仅对入选者物化，limit 口径非负有限数字，total 附过滤后候选总数）；平局索引 Map 一次性完整构建替代 ids.indexOf 二次方线扫（src/core.mjs:1892-1906）。
- 测试: scripts/check.mjs 断言 1402→1439（新增 memo/两段式等价/对抗夹具/limit 非法形态/覆盖层重建分支断言，既有全数保持）；`pnpm verify` 全量 24 specs 全绿（0c17bc1 与 94f710b 上各一轮全绿；其间四轮环境时序抖动 FAIL 经同提交复跑对照排除回归、失败 spec 单跑全绿，与 TODO 既有 boot 竞态家族签名一致）；mobile-thermal rAF 阈值守恒 PASS（57 ≤ 80，C-082 门禁对照）；perf-ab 隔离 A/B 事件期总 CPU 中位数 B/A=0.820（A=3.510/3.350/3.500、B=2.870/3.210/2.830 核·s），`--check` 第一轮 PASS（折叠绝对采样比值 0.000 ≤ 1.2，A=46/B=0）后三轮因 A 侧折叠采样 <20 fail-closed 判 NaN（轻负载窗形态，B 总 CPU 0.982 不劣于 A，非回归）；活实例同窗实测（决策依据行登记项，基线 CPU 约 50%、GC 约 12%）留待东家排期的重负载窗口。
- SOLUTION 对照: 内部计算路径等价变换，呈现/排序/分页语义逐字段不变（map 不变达标类，C-082 口径）；PRD/DOMAIN 未改写；SOLUTION.md:260 前缀分工表述随 9787ad8 同步（本 task 测试影响表 SOLUTION update 行承载）。
- commit: 0c17bc1（实现主体）、1dc11e3（评审修复：F1 排序前切片回归+对抗夹具+重复断言清理+idOrder 惰性化）、94f710b（N1 平局索引一次性完整建表+残留断言收口）、9787ad8（SOLUTION 表述同步）
- review:
  - 目的理解: 达标类性能收敛（map 不变短路，C-082）——消除每渲染帧对全名册（实测 4784 会话目录）的固定分配与物化：覆盖层全量克隆（currentIdOf WeakMap 恒 miss 根因）、waitingStarts 逐帧重建、buildRecent 全量物化+全量排序、双 workspaceIndex、平局裁决 indexOf 二次方；红线为 buildEntries/buildRecent 输出逐字段等价、历史区时间序排序与分页语义不变、订阅面与对外契约不变。
  - 问题与修复: 双轴首审 7 条（Spec 3 含 blocking 1 + Standards 4 含观察 1）全部处置——F1 blocking（两段式排序前切片，limit 前缀取名册序而非时间序；夹具 ids 恰合时间序且断言同实现自比致全绿漏网）→ 1dc11e3 排序前移 + 对抗夹具三重断言（手工期望非自比 + 全量互证 + 名册序≠时间序与平局字典序双维度）；F2/Standards-1 重复断言删除（复审发现残留 2 行随 94f710b 收口）；Standards-4 idOrder 逐帧无条件构建 → 惰性化（复审确认语义一致）→ 复审 N1 退化路径（每平局 O(N) 重扫）→ 94f710b 一次性完整构建恢复 O(N+P)；Standards-3 宿主 statusSnapshot 引用语义前提经实现方在宿主 lib 层核验（HostObservable reconcile 内容等价保留旧引用）登记为接受型外部前提；Standards 测试缺口两条（基快照变更分支、limit 非法形态回落全量）已补断言；F3 SOLUTION 表述漂移 → 9787ad8 同步。
  - 复审结论: 双轴两轮闭环（首审 1 blocking + 5 non-blocking → 修复 1dc11e3 → 复审 blocking 清零，N1 随 94f710b 收口）；Spec/Standards 双轴确认 F1 修复真实、对抗夹具足以封堵同型回归；累计审计（T-187）跨改动确认无互扰。
- 残余风险与测试缺口:
  - 覆盖层/清单 memo 依赖宿主「引用稳定且不可变」既有约定（与 currentIdOf/syncJobsWatches 同一信任模型；宿主将来原地变更即静默陈旧——现行无此生产者，接受型残余，T-187 审计同判）。
  - e2e 历史区未覆盖「名册序≠时间序」跨序名册场景（对抗夹具已在单测层封堵该形态）。
  - 活实例同窗实测（CPU/GC 双指标对照基线 50%/12%）留待东家排期的重负载窗口；perf-ab 轻负载窗折叠采样 <20 的 fail-closed 形态已登记。
