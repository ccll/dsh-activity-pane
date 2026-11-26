---
name: dap-jobs
description: 改后台任务订阅、任务子卡或「后台 ×N」徽标时读
---

# dap-jobs

本技能管后台任务 roster 的订阅、派生判定与三种呈现面。

- 订阅：客户端注入 `jobs` 服务，按会话 roster 订阅 `watchRows`/`state.rows`。
- 0.2.0 起列表快照不再带 `jobsBySession`，不要再读旧字段。
- 判定单点在 `src/core.mjs`：`liveJobsOf`、`jobsPaneSignature`、`jobKindLabel`、`jobsChipState`；呈现层不再算。
- 徽标是母卡标题行的「后台 ×N」（`.dap-jobs-chip`），弱化色调，不抢标题。
- 档位：默认中间档不渲染任务子卡，只留数量注；完整档渲染 `.dap-card[data-kind="job"]` 子卡。
- 子卡与子代理卡同形（层级连接线、两行），底色要能区分；点击子卡不触发操作。
- 门控：回合结束后在跑任务不得把卡抬成运行态；完成提醒照常按等待态呈现。
- 闪烁语义只覆盖「回合已结束但仍有在跑任务」；自身回合运行中、阻塞等待、历史卡都不闪。
- 在跑任务期间低档位不因时长逐秒重绘窗格。
- e2e：`e2e/specs/background-jobs.mjs` 用 `e2e:job` 剧本真实起后台任务。
- 0.2.2 的 `job_output` 首读可能尚无输出，mock 剧本已补 tick 行（`e2e/mock-llm.mjs`）。
- 订阅随卡可见性 prune 与卸载释放，不留监听。
