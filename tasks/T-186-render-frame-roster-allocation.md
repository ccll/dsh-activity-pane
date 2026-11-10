---
doc-type: task
mutation: lifecycle
id: T-186
---

# T-186 渲染帧名册级分配清零

状态: active
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

- 关闭时填写: 实现证据、测试证据、SOLUTION 对照、commit、review 三标签（active 期间本节留待关闭提交填记）。
