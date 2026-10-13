---
doc-type: task
mutation: lifecycle
id: T-174
---

# T-174 后台任务子卡档位门控与资源纪律

状态: completed
关联: R-01-023、R-01-025
风险等级: standard

## 背景与目标

东家立项（2026-10-13）：会话启动的后台任务子卡片在实际使用中过于显眼，要求在紧凑与中等显示档位中不呈现，只在最详细（完整）档位显示，且低档位下不占用后台资源（不为子卡维持逐秒渲染时钟）。属于 UI/UX 改进（呈现规则变更），走全链：PRD/SOLUTION 演进已经东家确认（「继续」认可推荐方案：隐藏+停时钟+停止秒桶签名注入，任务视图订阅保留以维持数量注与完成提醒抑制语义）。

现状与期望差距：任务子卡三档全渲染——紧凑档保留行 1（`.dap-job-content` 由 CSS 隐藏）、中间/完整档保留两行；且任务在跑期间 `jobsAgeSec` 秒桶每帧注入使渲染签名每秒变化、触发全列表重绘，仅后台任务在跑时 1 秒渲染时钟也因 job 条目而常驻。期望：子卡仅在完整档构建；低档位既无子卡 DOM 也无由其驱动的逐秒重绘。

## 差距评估

- PRD：R-01-023 无低档位呈现规则（缺 AC-10）；R-01-025 资源纪律未覆盖任务子卡时钟（缺 AC-08）。
- SOLUTION：「活动卡片集合」契约与任务子卡两行呈现 bullet 描述三档呈现，需改为仅完整档；窗格渲染器职责与 R-01-023/R-01-025 追溯行需补门控与资源语义。
- 代码：src/client.mjs 渲染主循环未按档位剔除 `kind:"job"` 条目；紧凑档 CSS 的 `.dap-job-content` 隐藏规则在门控后成为死规则。
- 测试：e2e/specs/background-jobs.mjs 82-95 断言「紧凑档 `.dap-job-content` display none」的旧行为将失效，需重写；低档位无逐秒重绘缺断言。

## 收敛方案

1. PRD：R-01-023 增 AC-10（中间/紧凑不呈现后台任务子卡；存在性仍以母会话数量标注承载；切回完整档随档位重渲染恢复）；R-01-025 增 AC-08（中间/紧凑且无运行中会话/子代理时不因在跑后台任务时长推进持续重绘窗格；任务视图订阅照常、数量标注照常；切回完整档恢复子卡时长逐秒推进）。
2. SOLUTION：同步「活动卡片集合」契约 bullet、任务子卡两行呈现 bullet、窗格渲染器职责、R-01-023/R-01-025 追溯索引行。
3. src/client.mjs：渲染主循环在 `buildEntries` 之后单点过滤——呈现档位非完整档时剔除 `kind:"job"` 条目（注释锚定 AC）；下游徽标计数、`liveJobs` 数量注、完成提醒抑制、活动区保留语义均由母会话条目承载不受影响；`syncJobsWatches` 任务订阅保留。移除紧凑档 CSS 中 `.dap-job-content` 死规则；修正任务子卡结构注释。
4. src/core.mjs 增 `runningClockWanted(entries, runLikeIds)` 纯函数，时钟需求判定收口（spec 轴审核 c)1 修正：原 client.mjs inline 判定计入全部 kind `running` 条目，而仅由在跑后台任务支撑运行呈现的母会话条目 kind 也是 `running`，逐秒时钟实际未停）：kind `job` 与运行中子代理驱动时钟；kind `running` 中开放回合会话（`selfRunning` 真）与委托周期母会话（`selfRunning` 假且 `liveJobs` 空）驱动，仅由在跑后台任务支撑运行呈现的母会话（`selfRunning` 假且 `liveJobs` 非空）不驱动。client.mjs `syncLiveness` 入参改用该判定。
5. e2e/specs/background-jobs.mjs 重写：默认中间档断言无子卡且「后台 ×1」在场；切完整档保留既有子卡断言；中间/紧凑档门控断言；紧凑/中间档「静默闸（1.3s 无变更确立前置）+基线后 0.9s」观测断言零逐秒重绘（合计 ≥2.2s）；切回完整档子卡恢复且时长轮询至变化；R-01-023/AC-08 纯展示点击测试移至完整档执行。

## 测试计划

- unit（scripts/check.mjs）：core 数据层既有断言全绿（`kind:"job"` 子条目产出逻辑不动）；新增 `runningClockWanted` 判定断言——job-only 母卡（`selfRunning` 假且 `liveJobs` 非空）不驱动、job 子条目/开放回合会话/委托周期母卡/运行中子代理驱动、空列表不驱动（锚 R-01-025/AC-08）。
- E2E（e2e/specs/background-jobs.mjs）：锚定 R-01-023/AC-01、AC-02、AC-05、AC-08、AC-09、AC-10 与 R-01-025/AC-08、R-01-003/AC-04（层级连接线）；R-01-023/AC-04、AC-07 的锚点在 scripts/check.mjs 契约层（徽标计数、卡面底色），本 spec 不重复承诺（spec 轴审核 a)1 修正）。
- MANUAL：无需（E2E 覆盖真实浏览器黄金路径与边界档位切换）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：任务子卡档位门控与资源纪律（产品契约、窗格渲染器内部结构、需求追溯索引） | UNIT/E2E | update | `e2e/specs/background-jobs.mjs` 重写为门控断言；`scripts/check.mjs` core 数据层不变全绿 |
| R-01-023/AC-01 | 不变 | E2E | 保留 | 数量注与保留活动区语义不变 |
| R-01-023/AC-02、AC-03 | 不变 | E2E+unit | 保留 | 提醒抑制由 liveJobs 承载，与档位无关 |
| R-01-023/AC-04 | 不变 | UNIT | 保留 | 徽标计数只计主会话（check.mjs 契约层，E2E 不重复断言） |
| R-01-023/AC-05、AC-06 | 不变 | E2E+unit | 保留 | 两行结构不变（完整档内） |
| R-01-023/AC-07 | 不变 | UNIT | 保留 | 底色区分不变（check.mjs bundle 契约层） |
| R-01-023/AC-08 | 不变 | E2E | 保留（移至完整档执行） | 纯展示语义不变，但子卡仅完整档存在 |
| R-01-023/AC-10 | 新增 | E2E | 新增断言 | background-jobs.mjs 中/紧凑档无子卡+完整档恢复 |
| R-01-025/AC-08 | 新增 | E2E+unit | 新增断言 | unit：runningClockWanted 判定六态；E2E：紧凑/中间档静默闸观测零逐秒重绘+切回恢复推进 |
| R-01-025/AC-01..AC-07 | 不变 | E2E | 保留 | 既有档位纪律不受影响 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：完整档任务子卡照常呈现与逐秒推进；中间/紧凑档不构建子卡、仅母卡数量注承载；切回完整档随档位重渲染恢复 | `e2e/specs/background-jobs.mjs#R-01-023/AC-10`、`e2e/specs/background-jobs.mjs#R-01-023/AC-05`、`src/client.mjs::任务子卡档位门控` |
| 异常 | 适用：回合收口后在跑任务期间完成提醒抑制不随档位变化；任务全部结束后提醒恢复与历史归属回归既有规则 | `e2e/specs/background-jobs.mjs#R-01-023/AC-02`、`scripts/check.mjs#R-01-023/AC-02`、`src/core.mjs::completionReminder` |
| 边界配置 | 适用：三档循环切换往返（完整↔紧凑↔中间）；「刷新持久化恢复」与「低档位门控」由两 spec 各证一半——compact-density.mjs 证持久化、background-jobs.mjs 证门控，两者并存的合取场景无单点断言（残余缺口，记入终态残余风险） | `e2e/specs/compact-density.mjs#R-01-021/AC-06`、`e2e/specs/background-jobs.mjs#R-01-023/AC-10`、`src/client.mjs::nextDensity` |
| 副作用 | 适用：徽标计数、任务视图订阅、母会话 liveJobs 语义（活动区保留/数量注）不受门控影响；core 数据层与徽标断言全绿 | `e2e/specs/background-jobs.mjs#R-01-023/AC-01`、`scripts/check.mjs#R-01-023/AC-04`、`src/core.mjs::awaitBadgeStats` |
| 性能 | 适用：低档位在跑任务期间不为任务时长维持逐秒重绘（观测窗内列表零 DOM 变更），时钟需求判定收口 core 纯函数；切回完整档恢复逐秒推进 | `e2e/specs/background-jobs.mjs#R-01-025/AC-08`、`src/core.mjs::runningClockWanted`、`src/client.mjs::syncLiveness` |

## 终态与证据

- 实现: 后台任务子卡档位门控与时长时钟停摆（R-01-023/AC-10、R-01-025/AC-08）。
  - 提交 816515e（实现）：src/core.mjs 新增 `runningClockWanted(entries, runLikeIds)` 时钟需求判定纯函数（job → 驱动；running → 自身回合运行或非仅 liveJobs 支撑运行呈现；runLike 子代理命中 → 驱动；委托周期母会话保留驱动语义）；src/client.mjs 渲染主循环在中间/紧凑档单点过滤 job 子条目（门控注释锚双 AC）、时钟调用收口 `syncLiveness(runLikeIds, runningClockWanted(active, runLikeIds))`、移除紧凑档 `.dap-job-content` 死规则并同步 job 卡结构注释；e2e/specs/background-jobs.mjs 重写为门控与零逐秒重绘断言；scripts/check.mjs 增 runningClockWanted 六态断言并更新 bundle 契约断言（clientSource 单文件断言收口调用形态，子代理字面量改查 bundle 段）；PRD R-01-025/AC-08 措辞精确化与 SOLUTION 四处落点同提交。
- 测试: 快速门禁与全量门禁逐项通过。
  - `pnpm verify:fast` 全绿（agentmap lint 28 需求/181 AC 全锚定、测试影响记账 +R-01-023/AC-10 +R-01-025/AC-08、check.mjs 161 断言）。
  - `pnpm verify` 全量 21 spec 通过（两轮：复审收敛前后各一轮，均全绿）；e2e/specs/background-jobs.mjs 隔离连跑两次 PASS（~20s）。
  - 观测结构：静默闸（连续静默 ≥1.3s 达成前置，吸收回合收口竞态）+ 基线后 0.9s 零新增（合计 ≥2.2s ≥ 2 时钟周期），紧凑/中间两档各自独立收取；恢复断言轮询「非空且异于首读」防空转假通过。
- SOLUTION 对照: SOLUTION 与实现一致。
  - 产品契约「job 子条目为完整档专属呈现」子 bullet、渲染纪律「任务子卡不构建与时长时钟门控」子 bullet（含 `活动状态模型#runningClockWanted(entries, runLikeIds)` 伪锚）、任务子卡呈现 bullet 与两条需求追溯行均与实现对照无差异。
  - 需求追溯索引含 R-01-023 行（主责 活动状态模型）与 R-01-025 行（主责 窗格渲染器），主责子系统反向承接成立。
  - 测试锚点：`scripts/check.mjs#R-01-025/AC-08`（六态判定）、`scripts/check.mjs#R-01-023/AC-04`、`#R-01-023/AC-07`（契约层）；`e2e/specs/background-jobs.mjs#R-01-023/AC-01`、`#R-01-023/AC-02`、`#R-01-023/AC-05`、`#R-01-023/AC-08`、`#R-01-023/AC-09`、`#R-01-023/AC-10`、`#R-01-025/AC-08`、`#R-01-003/AC-04`。
- commit: 816515e
- review:
  - 审核方: code-review skill 双轴并行独立子代理（Standards agent 179c2fe8、Spec agent 6d28fdff），基线 54b311d
  - 目的理解: 本变更目的为中间/紧凑档「只看概要」时不呈现后台任务子卡、不为其占用后台资源（重绘与逐秒时钟），仅完整档承载子卡呈现；子卡存在性由母会话数量注承载。
    - 约束：裁剪以档位为唯一输入；任务视图订阅、徽标计数、完成提醒抑制与活动区保留语义不受门控影响；委托周期母会话时钟语义不回退（client.mjs 运行卡时钟注释既有红线）。
    - 预期行为：低档位 job 子条目在渲染主循环被剔除、随钟时长不注入渲染签名、无自身回合运行中会话与运行中子代理时不维持逐秒时钟；切回完整档随档位签名重渲染恢复子卡与时长推进。
  - 执行方式: code-review skill 双轴并行评审。
    - Standards 轴对照 AGENTS/CONVENTIONS 写作与过程规范；Spec 轴对照 T-174 与 PRD R-01-023、R-01-025，SOLUTION 落点与实现。
    - 两轮：首轮发现逐条处置 → 同审核方复审闭环；复审覆盖工作树与实现提交 816515e。
  - 问题与修复: 首轮六项发现逐条修复并经同一审核方复审闭环（明细如下）。
    - （Spec）「不为在跑后台任务维持逐秒渲染时钟」与实现偏差：clockWanted 计入 kind==="running"，仅 liveJobs 支撑运行呈现的母卡仍驱动时钟 → 收口 core 纯函数 runningClockWanted + 六态 unit 断言 + PRD/SOLUTION 措辞精确化（EARS 可判定：逐秒周期性工作由 unit 判定，持续重绘窗格由 E2E 零 DOM 变更判定）。
    - （Spec）完整档恢复断言可空转假通过 → 轮询「非空且异于首读」。
    - （Spec）task 测试计划锚点过度承诺（AC-04/AC-07 实为 check.mjs 契约层）与验证矩阵边界配置行虚述合取 → 锚点列实、实述两 spec 各证一半。
    - （Standards）SOLUTION 契约 bullet 追加整句致超长单行 → 拆嵌套子 bullet（既有超长主体拆分已有 T-152 登记，不在本次扩面）。
    - （Standards）E2E observer 探针块逐字重复两段 → 提取 armJobClockObserver/observeQuietWindow helper。
    - （Standards）门控复核断言与 until 谓词重复、core 双否定可读性 → 断言并入前置 assert 文案、改清晰写法（语义等价）。
  - 复审结论: Standards 轴复审通过（轻微残留两处已修，新增面无发现）；Spec 轴复审通过、无阻塞发现（谓词语义、调用点、观测窗可信性与 PRD EARS 可判定性均核验确认）。
- 残余风险与测试缺口:
  - 低档位内母会话数量注 1→2 动态更新无直接断言（在场断言与数据层签名含 liveJobs 间接承载）。
  - 「刷新持久化恢复」与「低档位门控」并存的合取场景无单点断言（compact-density.mjs 与 background-jobs.mjs 各证一半）。
  - 观测窗恰逢探针任务收尾时可能误报（探针 ~60s 覆盖全 spec 时长，风险低）；静默闸超时失败附变更归因日志，误报可辨。
