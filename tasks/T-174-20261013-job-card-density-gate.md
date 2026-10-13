---
doc-type: task
mutation: lifecycle
id: T-174
---

# T-174 后台任务子卡档位门控与资源纪律

状态: active
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

（active 期间编辑，终态后补全）
