---
doc-type: task
mutation: lifecycle
id: T-195
---

# T-195 后台任务只作标注——会话活动归属回归回合状态

状态: active
类型: 需求变更
风险等级: major
风险面: 对外行为（卡片运行/等待归属、完成提醒成立性、徽标计数口径）
关联需求: R-01-023/AC-01、AC-02、AC-03、AC-04、AC-11（改写）；R-01-025/AC-08（措辞澄清）
决策依据: 东家 2026-11-17 选定方案三（标注化）——在跑后台任务只作卡片标注，不改变会话的活动归属与呈现类别；并裁定①回合已结束且已确认（移入历史）后卡片落最近历史并保留「后台 ×N」标注，②活动区等待态卡片数量注保留闪烁、最近历史卡静止。方案依据：宿主 `JobView` 无「任务是否被等待」字段、`JobEvent.settled.awaited` 仅在结算时可得，客户端从时长/命令文本/输出读取推断均不可靠（长任务等待超时、命令文本不稳定、服务也会被读输出），故以回合状态为唯一活动判据。

## 背景与目标

- 背景: R-01-023 原口径把「存在在跑后台任务」当作会话的第三种活动来源——回合已结束的会话被保留在活动区按运行态呈现、完成/错误提醒被抑制。长期使用暴露两类会话被混为一谈：等待任务结果再继续的会话（应保持活动中），与只启动常驻服务、后续按需调用的会话（应标为已完成，因为此刻轮到你查看并决定下一步）。
- 根因: `buildEntries` 的 `selfActive` 与 `kind` 都把 `hasLive` 并入（原 `src/core.mjs:1849`、`:1948`），`hasLive` 只看 `JobView.status ∈ {running, stopping}`，不问会话是否在等该任务；提醒抑制（原 `:1845-1847`）与运行组排序（原 `:1862`）、最近历史排除（原 `:2751`）同源。
- 目标: 活动归属只由回合状态（running / 阻塞等待 / 委托周期 / 未确认完成或错误提醒）决定；在跑后台任务只承载标题行「后台 ×N」标注与任务子卡；回合已结束的会话按等待态呈现（完成提醒成立），确认后落最近历史并保留标注。
- 非目标: 不引入「任务是否被等待」的宿主新字段或模型侧声明机制；不改任务子卡内容、档位门控与交互；不改徽标总量语义（总数仍为活动区条目数）。

## 差距评估

- PRD: R-01-023 的 AC-01/AC-02/AC-03/AC-04 按旧口径写死了「运行态呈现」「提醒抑制」「计入运行中分子」；AC-11 的闪烁条件绑定「运行呈现仅由在跑后台任务支撑」；R-01-025/AC-08 的括注指向已不存在的会话形态。
- SOLUTION: 显示过滤、在跑后台任务活性、等待优先、分区不变量、活动卡片集合契约、buildRecent 契约、档位资源纪律与窗格渲染器 jobs-only 门控均按旧口径描述。
- DOMAIN: 「在跑后台任务」词条声明其存在使会话保持活动呈现并抑制提醒。
- 代码: `src/core.mjs` `buildEntries`（selfActive/kind/排序/提醒）、`buildRecent`（排除在跑任务会话）、`jobsChipState`（按 kind running 判闪烁）、`runningClockWanted`；`src/client.mjs` 等待态与最近历史卡骨架无数量注、渲染分支未写数量注与门控属性。
- 测试: `scripts/check.mjs` R-01-023 单元锚点与 `e2e/specs/background-jobs.mjs` 的 AC-02 抑制断言按旧口径写；buildRecent 等价用例未含在跑任务候选。

## 收敛方案

- 方案研判: 关闭（CONVENTIONS 本地参数）；方案选择与两处结构性裁定经东家拍板，见「决策依据」。
1. PRD 需求陈述: 改为「标注承载、不改写完成状态」。
2. PRD AC: AC-01 标注扩展到活动区与最近历史卡；AC-02 改为任务不参与活动归属与呈现类别；AC-03 改为任务结束移除标注、归属与提醒判定不变；AC-04 改为只计按运行态呈现（回合运行或委托周期）的会话；AC-05～AC-10 不变。
3. PRD AC-11: 闪烁条件改为「活动区等待态且非阻塞等待」，最近历史卡静止；末行脉冲归 R-01-002/AC-08（不再宣称数量注是唯一运动元素）。
4. PRD R-01-025/AC-08: 删除已失效的「仅由在跑任务支撑运行呈现」括注。
5. SOLUTION: 显示过滤去掉在跑任务作为显示理由；在跑任务 bullet 改为「不是活动来源、只作标注」；等待优先去掉提醒抑制；分区不变量与 buildRecent 契约改为不改入选、保留标注；契约补最近历史条目的 liveJobs 与「子卡仅活动区母卡产出」；档位资源纪律与渲染器门控按等待态改写。
6. DOMAIN: 「在跑后台任务」词条改为只标注不改归属；层级不变量注记子卡仅活动区母卡产出。
7. `src/core.mjs`: `buildEntries` 的 `selfActive`/`done`/`err`/`kind`/`isRunningEntry` 去掉 `hasLive`；`buildRecent` 去掉排除并携带 `liveJobs`；`jobsChipState` 闪烁条件改为等待态且非阻塞等待；`runningClockWanted` 简化为按 kind 判定；同步 JSDoc。
8. `src/client.mjs`: 等待态与最近历史卡骨架补数量注节点；三类卡片统一经 `applyJobsChip` 写数量注与卡根 `data-jobs-blink`；缺节点时就地补建（C-043 热装惯例）；删除已无意义的进度行冻结谓词。
9. 测试: `scripts/check.mjs` 重写 R-01-023 锚点与 bundle 契约；`e2e/specs/background-jobs.mjs` 的 AC-02 断言翻转为「完成提醒呈现且 kind=awaiting」，新增确认后历史卡标注断言，保留 AC-11 三态往返。

## 测试计划

- unit（`scripts/check.mjs`）：
  - AC-01：无提醒时在跑任务会话不产生活动条目、进入最近历史且携带 liveJobs（startedAt 升序、仅 live）；有未确认完成提醒时条目携带 liveJobs 与任务子卡。
  - AC-02：在跑任务不把会话抬成运行态（kind awaiting、waitClass done），错误提醒对照组不受影响。
  - AC-03：任务全部结束后 `liveJobs` 清空、提醒与历史候选判定不变。
  - AC-04：`awaitBadgeStats` 把等待态计入 waiting、运行中分子不含在跑任务会话。
  - AC-11：闪烁四态（等待态闪、运行卡不闪、阻塞等待不闪、历史卡不闪）与任务全结束隐藏。
  - R-01-025/AC-08：等待态母卡不驱动逐秒时钟、job 子条目与委托周期母卡照常驱动。
- browser E2E（`e2e/specs/background-jobs.mjs`）：回合收口后完成提醒呈现、卡片 kind=awaiting、数量注仍在；等待态闪烁 + 圆点停闪，运行窗停闪 + 圆点复呼吸，再收口复闪；完整档子卡与时长推进、档位门控、低档静默不变。
- 编辑器循环 `pnpm verify:fast`，收尾 `pnpm verify` 全量（含全部浏览器 spec）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-023/AC-01 | 语义改写（标注扩展至最近历史卡，不再提升活动归属） | UNIT/E2E | update | `scripts/check.mjs` 历史条目 liveJobs 与活动条目断言 + bundle 契约（三类骨架与写入点）；`e2e/specs/background-jobs.mjs` 等待态与确认后历史卡数量注断言 |
| R-01-023/AC-02 | 语义改写（提醒不再被抑制、不抬成运行态） | UNIT/E2E | update | `scripts/check.mjs` kind/waitClass 断言；E2E 完成提醒呈现断言 |
| R-01-023/AC-03 | 语义改写（移除标注、归属与提醒不变） | UNIT/E2E | update | `scripts/check.mjs` settled 分支断言（liveJobs 清空、历史条目不携带任务视图）；E2E 确认后历史卡标注断言覆盖标注保留面 |
| R-01-023/AC-04 | 语义改写（运行中分子只计运行态，含委托周期） | UNIT | update | `scripts/check.mjs` `awaitBadgeStats` 期望改为 waiting=2/total=3，并补委托周期母卡计入运行中的用例 |
| R-01-023/AC-11 | 门控改写（等待态闪、历史卡静止） | UNIT/E2E | update | `scripts/check.mjs` jobsChipState 四态；E2E 三态往返保留 |
| R-01-025/AC-08 | 措辞澄清（删除失效括注） | UNIT/E2E | update | `scripts/check.mjs` runningClockWanted 等待态用例；E2E 低档静默窗保留 |
| SOLUTION | 方案层演进：显示过滤、活性 bullet、等待优先、分区不变量、契约与渲染器门控 | UNIT/E2E | update | 同次变化与实现/测试同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：回合已结束的在跑任务会话按等待态呈现、完成提醒成立、数量注标注 | `scripts/check.mjs#R-01-023/AC-02`、`e2e/specs/background-jobs.mjs#R-01-023/AC-02`、`src/core.mjs::buildEntries` |
| 异常 | 适用：任务视图缺失/畸形契约不变；阻塞等待期间不闪、历史卡不闪 | `scripts/check.mjs#R-01-023/AC-11`、`src/core.mjs::jobsChipState` |
| 边界配置 | 适用：已确认（移入历史）的会话带标注落入最近历史；任务全部结束后标注消失 | `scripts/check.mjs#R-01-023/AC-01`、`scripts/check.mjs#R-01-023/AC-03`、`src/core.mjs::buildRecent` |
| 副作用 | 适用：徽标计数口径变化不影响总数语义；低档静默与逐秒时钟门控不变 | `scripts/check.mjs#R-01-025/AC-08`、`e2e/specs/background-jobs.mjs#R-01-025/AC-08`、`src/client.mjs::applyJobsChip` |
| 回归影响 | 适用：完成提醒/错误提醒既有语义、卡片分区与历史分页、任务子卡呈现 | `e2e/specs/completion-sync.mjs#R-01-002/AC-05`、`e2e/specs/error-reminder.mjs#R-01-002/AC-13`、`e2e/specs/recent-infinite-scroll.mjs#R-01-010/AC-01`、`src/core.mjs::completionReminder` |

## 自查清单

- 边界：无提醒的在跑任务会话不得出现在活动区、也不得从两区消失（最近历史必须入选并携带 liveJobs）；已确认会话与未确认会话分别在历史区与等待态承载同一标注。
- 异常路径：任务视图缺失、非数组、畸形条目与任务 `label` 纯空白的行为不变；任务在会话空闲期间结束不得留下 `liveJobs` 残留。
- 回归影响：完成提醒/错误提醒的成立性只由 `completions` 决定；子代理与委托周期母卡的运行呈现与时钟门控不受影响；任务子卡仍只在完整档呈现。

## 终态与证据
