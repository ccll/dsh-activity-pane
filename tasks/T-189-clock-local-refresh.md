---
doc-type: task
mutation: lifecycle
id: T-189
---

# T-189 1Hz 时钟局部刷新通道——时钟帧绕过全量派生只补叶子文本

状态: completed
类型: 性能优化
风险等级: major
风险面: 无（渲染管线内部：呈现承诺、对外契约均不变，不触及契约、资金、数据迁移、对外接口、鉴权）
关联需求: 无新承诺——达标类性能收敛（map 不变短路，C-082 口径）；R-01-009/AC-03 逐秒推进呈现、R-01-020 累计时长显示、R-01-023 job 子卡时长推进语义不变
决策依据: 东家批准（2026-11-10）性能深查第三刀方案——「1Hz 时钟局部刷新通道」；HANDOFF 修复建议③的备选形态（T-181 落地了可见性门控，局部化未做）。T-186 后时钟帧剩余成本为每秒全量派生（buildEntries/buildRecent 各一次 O(名册) 谓词扫描 + buildEntries meta Map 名册级分配）+ 双层签名 stringify，而随钟变化的只有叶子文本。

## 背景与目标

有运行中卡片时，`syncLiveness` 的 1s 时钟（src/client.mjs:4072 `setInterval(() => queueSync(), CLOCK_MS)`，立项时点行号经 T-190 审计更正 E4 修正——原引 4005 为 T-186 前旧基线）每秒触发一轮完整渲染管线：全量派生（含 O(名册) 谓词扫描与 meta Map 构建）+ cardSignature 双层 JSON.stringify + DOM diff——而随钟变化的只有少数叶子文本/样式（标题行累计时长、进度百分比与条宽、统计行时长、job 子卡秒桶时长）。这些字段全部可由上一已提交帧的条目对象与 `Date.now()` 重算，复用表已持有卡片 DOM 引用。

目标：1s 时钟 tick 改走局部刷新通道——绕过派生与签名，对上一帧运行类条目直接补写随钟叶子文本；呈现承诺（逐秒跳动）不变。60s recent 时钟保持全量管线（分钟级频率，成本可忽略，且其字段——等待年龄、最近时间——不纳入本通道）。

## 差距评估

- PRD：无变化（逐秒推进的呈现承诺不变；达标类收敛不增设机制类承诺，C-082）。
- SOLUTION：无变化（渲染管线内部机制；定时器纪律、渲染签名语义、可见性门控均不受影响）。
- 代码：syncLiveness 时钟回调、render 提交路径登记上一帧条目、新增叶子补写函数。
- 关键约束（正确性论证核心，评审重点）：
  - 时钟帧**不写 lastSig**：签名仍以上一轮全量渲染的提交值为准，下一事件帧全量校正兜底——任何数据变化路径都经 queueSync 触发全量渲染，时钟帧跳过派生不会吞掉真实变化。
  - 随钟字段清单必须完备：凡随 `Date.now()` 每秒变化的可见字段都要在补写清单内；分钟级字段（awaitAge/最近时间）留给 60s 时钟；清单以实现勘定为准并在注释登记依据。
  - 条目时效：补写只遍历上一已提交帧登记的条目；条目对应的卡片若已被 prune（复用表移除）则跳过——补写永不创建/移动/删除节点。
  - progress 重算依赖锚点状态机与速率：`progressAnchorById`（帧间记账）与条目上的速率字段在上一帧已就绪，重算为纯函数调用。

## 收敛方案

1. render 提交路径登记 `lastCommittedEntries`（active+recent 全量条目对象引用，含 kind/锚点/速率等补写所需字段）——随 lastSig 提交同点更新（renderOk 分支）。
2. 新增 `tickClockFrames()`：对 lastCommittedEntries 中随钟条目（running/subagent 运行态/job 子卡）重算 elapsedMs/progress/totalBusyMs 相关文本，经复用表 rec.el 定位后守卫式补写叶子文本（textContent/style.width 写入前比对，与 renderCardInto 同守卫风格）；卡片已 prune 则跳过；不触碰派生、签名、DOM 结构。
3. `syncLiveness` 的 1s 时钟回调改调 `tickClockFrames()`（不再 queueSync）；60s 时钟与可见性门控（pageHidden 停摆、回前台 resumeRenderPipeline 补全量）保持不变。
4. 谨慎项核验（实现时逐项确认并注释）：进度条 CSS width 过渡在局部补写下的动画连续性（与既有 0.45s transition 语义一致）；job 子卡秒桶文案的重算入口；awaitAge 等分钟级字段不进本通道。
5. 无分叉点: 东家批准的方案范围即上述通道（决策依据行）；「时钟帧不写 lastSig + 全事件路径必经 queueSync」的兜底结构使局部化无第二认真候选。

## 测试计划

- e2e：mobile-thermal rAF 阈值守恒（C-082）；idle-quiescence 空闲静默；card-content 时间线呈现回归；新增或强化「无事件期逐秒推进」断言（长流式回合落定后的运行卡时长文本推进可用既有 longstream 几何承载——实现时勘定落点，报告单列）。
- unit：随钟重算若抽出纯函数（elapsed/progress 重算入口）则入 scripts/check.mjs；不可干净抽取则由 e2e 承载并说明。
- 全量 `pnpm verify` + `pnpm perf:ab --check`（折叠采样守恒；若轻负载窗 fail-closed 则按 T-186/T-188 口径以总 CPU 对照收口并如实登记）。
- 测试影响：PRD/SOLUTION 无变化（map 不变短路），无 AC 锚点变更。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：逐秒推进呈现不变、全量校正兜底结构无回归 | `e2e/specs/card-content.mjs::cardContent`、`e2e/specs/session-lifecycle.mjs::sessionLifecycle` |
| 异常 | 适用：条目被 prune 后补写跳过、时钟帧不吞数据变化 | `scripts/check.mjs::buildEntries`（锚点与速率字段重算入口）；e2e 事件帧全量校正 |
| 边界配置 | 适用：三档密度、折叠态、页面隐藏停摆与回前台补齐 | `e2e/specs/density-resource.mjs::densityResource`、`e2e/specs/mobile-resume.mjs::mobileResume` |
| 副作用 | 适用：rAF 纪律不破坏（补写无布局读）、动画过渡连续 | `e2e/specs/mobile-thermal.mjs::mobileThermal`、`e2e/specs/idle-quiescence.mjs::idleQuiescence` |
| 性能 | 适用：有运行卡无事件期的每秒全量派生消除 | `scripts/perf-ab.mjs::measureProfiledEventPeriod` 守恒对照；时钟帧成本构成终态记录 |

## 自查清单

- 边界：无运行卡（时钟本就停）、多运行卡、job 子卡与主卡同帧推进、条目在补写前被 prune。
- 异常路径：时钟帧与事件帧交错的顺序（时钟帧只写叶子不碰结构，事件帧全量校正）；回前台 resumeRenderPipeline 补一轮全量后 lastCommittedEntries 重建。
- 回归影响：呈现承诺逐字段不变；签名提交值语义不变；60s 时钟与可见性门控行为不变。

## 终态与证据

- 实现: 随钟字段完备性勘定在先（1Hz 补写清单——.dap-total-time 标题行累计时长经 setTotalTimeText 共享写入点、.dap-token-time 统计行时长、.dap-pct/.dap-fill 进度经 progressOf/progressHalfLifeSec、.dap-job-elapsed job 子卡时长经 setJobElapsedText 共享写入点；分钟级 .dap-await-age/.dap-note 归 60s 时钟；token/速率列、jobs 数量注、时间线、aria-label、data-* 逐项核验无时钟分量；awaiting/recent 的 totalBusyMs 纳入重算为必要完备性补充——blocked 冻结期两项随 now 严格抵消、openWaitStart 未配对瞬态随秒增长与旧管线同行为）；renderOk 提交分支随 lastSig 同点登记 lastCommittedEntries（失败帧保留上一成功帧、窗格重挂载与卸载清空，src/client.mjs:5204）；新增 tickClockFrames/tickEntryClock（disposed/pageHidden 自门控、逐条目异常隔离、复用表定位 prune 即跳过、不建/移/删节点、不读布局，src/client.mjs:4124-4218）；1s 时钟回调改调 tickClockFrames（60s 时钟、可见性门控、resumeRenderPipeline 不变）；共享写入点收敛 setTotalTimeText/setJobElapsedText/isJobsOnlyEntry；时钟帧不写 lastSig 红线由 check.mjs 机械断言钉住（`lastSig = sig;` 全源唯一 + 时钟帧切片禁区四字符串 + 切片锚点有效性前置断言，scripts/check.mjs:4653-4667）。
- 测试: scripts/check.mjs 断言 1461→1465（1s 时钟契约断言改造 + 红线断言组 + bundle 新符号入列；既有全数保持）；e2e 两处勘定驱动强化——background-jobs.mjs 新增 jobs-only 无事件窗断言组（零元素节点增删、时长推进 ≥2 次/2.4s 窗、变更只落运行卡族时长叶子；+46 行纯新增，锚定 R-01-025/AC-08 与 R-01-023/AC-05）、busy-backfill-race.mjs 场景 2 走字断言由固定 sleep+严格递增改 until 轮询 ≤3s（双轴独立裁决为真实时序边缘校准非测试弱化：fmtElapsedMs 秒桶 Math.round 与 1Hz tick 承载翻转的双重 flake 边缘，语义保留「持续在场+严格递增」）；`pnpm verify` 全量 24 specs 多轮全绿（实现轮两轮各炸出上述两处断言自身口径问题，校准后复跑全绿）；mobile-thermal rAF 阈值守恒 PASS（57-58 ≤ 80，C-082 对照）；perf-ab --check 三轮 fail-closed NaN（折叠采样 A=0/B=0 轻负载窗形态，T-186/T-188 已登记同款，本 task 折叠管线零改动），按换绑口径以事件期总 CPU 对照收口：B/A = 0.975/0.884/1.045（中位数 ≤1.0 无回归信号）；机械 PASS 与活实例同窗实测沿用待排期口径。
- SOLUTION 对照: map 不变达标类（C-082）——呈现承诺逐字段不变（R-01-009/AC-03、R-01-020/AC-01/AC-06、R-01-023/AC-05、R-01-025/AC-08），PRD/SOLUTION/DOMAIN 未改写（双轴评审与 T-190 累计审计双重核验）。
- commit: 7b3f726（实现主体）、2e7c554（评审 quality 收尾：共享写入点抽取×2 + 红线断言加固 + 失败帧偏差注释登记）
- review:
  - 目的理解: 达标类性能收敛（map 不变短路，C-082）——有运行卡时 1s 时钟每秒触发全量派生管线（buildEntries/buildRecent 各一次 O(名册) 谓词扫描 + meta Map 名册级分配 + cardSignature 双层 stringify + DOM diff）而随钟变化只有叶子文本；改局部刷新通道绕过派生与签名；红线为时钟帧不写 lastSig、全事件路径必经 queueSync 全量校正兜底、呈现承诺逐字段不变。
  - 问题与修复: 双轴首审 0 blocking（Spec 1 low + 3 info；Standards 4 judgement call）——红线切片脆性（两轴独立命中：锚点失配静默恒真 + 切片尾部混入 jobs 注释区致未来误报）→ 2e7c554 补 start!==-1&&end>start 前置断言 + 上界收紧至 syncJobsWatches；job 时长写入三件套两处平行维护 → setJobElapsedText 共享抽取（与 setTotalTimeText 同型）；jobsOnly 判定式逐字重复（含 selfRunning !== true 取反语义）→ isJobsOnlyEntry 谓词单点承载；失败帧 token/速率列瞬时回退面 → JSDoc 登记（时长列不受影响仍单调趋真）。scope creep 裁决：background-jobs +46 行纯新增属测试计划「新增/强化无事件窗断言」的落点；busy-backfill-race 轮询化经两轴独立裁决为去 flake。quality 收尾 2e7c554 由协调者逐项核验落地；0 blocking 无复审循环要求。
  - 复审结论: 双轴通过——Spec 轴收敛方案 1–5 全落地、字段完备性对照 renderCardInto 与 cardChildren 骨架逐叶子核对无遗漏、prune/renderOk=false 偏差方向单调趋真论证成立；Standards 轴 lastCommittedEntries 生命周期无泄漏无陈旧窗口、e2e 新断言有牙齿（通道移除即失败）、map 四文档零触碰；T-190 累计审计跨改动确认三线叠加自洽（时钟帧数据源隔离、queueSync 必达、锚点签名隔离、密度门控一致）。
- 残余风险与测试缺口:
  - N1 委托周期 settle 翻转延迟：grace 过期后的呈现翻转由下一事件帧或 60s 时钟承载（旧行为 ≤1s；静默窗口内延迟至下一事件帧，历史区在场 ≤60s）——呈现时机非数据正确性，锚点记账不受影响（T-190 审计 N1，无专项 e2e）。
  - N2 回填退避重试稀疏化：无事件帧时 30s 重试延至 30s+下一事件帧——R-02-004 不轮询承诺不损（T-190 审计 N2，无专项断言）。
  - 无事件窗 e2e 断言依赖窗内真静默（意外事件帧会假阳触发，注释已声明）；running 卡非 job 形态的无事件窗推进无直接断言；lastCommittedEntries 重挂载/卸载清空仅代码路径无测试锚点。
  - perf-ab --check 机械 PASS 与活实例同窗实测留待重负载窗口（三线共用口径，待东家安排）。
