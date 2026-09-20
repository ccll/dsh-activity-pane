---
doc-type: task
mutation: lifecycle
id: T-150
---

# T-150 任务输出回放数据源缺陷修复与悬停完整命令

状态: completed
关联: R-01-024/AC-02（缺陷修复）、R-01-024 呈现细化 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家实测（2026-09-20）——点开后台任务子卡显示「尚未被读取」；任务卡命令行单行截断看不到全貌。
- 根因（回放）: `/api/jobs-output` 持久重放以 `sessionQuery.listEvents` 为数据源，但该接口返回轻量元数据记录（sessionId/seq/type/time/surface，**无 data 负载**）——`job_output` 配对所需的 `arguments.job_id` 与 result 文本均在 data 中，重放恒为零轨迹 → `read:false`。实时镜像正常，但仅覆盖宿主进程存活期间的新读取，重启前历史读取全部依赖重放。
- 根因（悬停）: 子卡任务行单行省略号截断；label 即调用方命令原文（`dsh-tool-bash` 以 `label: args.command` 起 job），完整命令被 CSS 截断不可读。
- 目标: 重放改用 `sessionQuery.observeSession`（`SessionObservation.events` 为 live-preferred 完整事件、带 data 负载，读毕释放）；job 子卡悬停以原生 tooltip 显示完整任务描述；DESIGN 契约句同步。

## 差距评估

- src/host.mjs: `/jobs-output` 重放调用 `listEvents` → 改 `observeSession`（Disposable 释放）。
- src/client.mjs: job 子卡无悬停提示 → `el.title` 承载完整命令原文。
- DESIGN.md: 产品契约 job 子条目句补悬停呈现一句。
- scripts/check.mjs: 增 host 源码断言（observeSession）与 bundle 断言（el.title）。

## 收敛方案

1. `src/host.mjs` `/jobs-output`: 数据源 `listEvents` → `sessionQuery.observeSession(sessionId)`（try/finally 释放 observation；注释说明 listEvents 元数据局限与选择理由）。
2. `src/client.mjs` `renderJobCardInto`: 子卡根元素 `el.title = String(entry.title)`（label 即调用方命令原文，原生 tooltip 含换行）。
3. `DESIGN.md` 产品契约 job 子条目句补悬停说明；`scripts/check.mjs` 增 bundle 断言（el.title）与 host 源码断言（observeSession）。
4. `.dsh-plugin/client.js` 随实现重建并同次暂存。

## 测试计划

- `scripts/check.mjs`: 既有 R-01-024 数据层锚点不变（`jobOutputFromTraces` read:false 语义仍被 AC-02 引用）；新增 bundle 断言（悬停 tooltip 进 bundle）；新增 host 源码断言（`observeSession` 重放数据源，`listEvents` 不再用于本路由）。
- `pnpm verify:fast`；全量 `pnpm verify` 由东家重启宿主后的实测节点一并回归（本 task 以缺陷修复为主，改动面小）。
- 东家实测: 重启宿主后点开 bash-2 任务子卡 → 输出区显示 tick 1–150 全文（AC-01/AC-02 实景）；悬停子卡显示完整命令（呈现细化）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-024/AC-01、AC-02 | 修复：重放数据源 listEvents（元数据，无 data）→ observeSession（完整事件），消除恒 read:false | UNIT | update | `scripts/check.mjs#R-01-024/AC-02`（数据层语义不变）、host 源码断言（observeSession 进入重放链路） |
| R-01-024/AC-01、AC-02 | 修复：core job 子条目补 `jobId` 字段（此前缺失使 dataset.jobId="undefined"，回读恒 read:false——「尚未被读取」根因的另一半） | browser E2E | add | `e2e/specs/background-jobs.mjs#R-01-024/AC-01`（e2e:job 剧本真实后台任务，点开子卡断言输出回放含 e2e-job-tick） |
| R-01-024/AC-03 | 新增 | browser E2E | add | `e2e/specs/background-jobs.mjs`（jobs/stream 通道 + 展开态存活断言） |
| R-01-023/AC-01、AC-02 | 新增 | browser E2E | add | `e2e/specs/background-jobs.mjs#R-01-023/AC-01`、`#R-01-023/AC-02`（子卡呈现、数量注、提醒抑制实景） |
| R-01-024/AC-02 | 呈现细化：悬停原生 tooltip 显示完整命令 | UNIT | add | `scripts/check.mjs` bundle 断言（el.title 设置进 bundle） |
| DESIGN | 产品契约 job 子条目句补悬停说明；R-01-024 落点随子卡形态演进 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：重启后点开任务子卡显示已读输出全文 | `scripts/check.mjs#R-01-024/AC-02`、`src/host.mjs::observeSession` 调用点、东家实测（终态记录） |
| 异常 | 适用：observation 释放失败不吞回放结果（finally 隔离）；路由 5xx 走「输出读取失败」 | `src/host.mjs::jobs-output` |
| 边界配置 | 适用：live 观察事件数组容错（非数组回退空）；mirror 与 store 双源合并口径不变 | `src/core.mjs::jobOutputTraces`、`src/host.mjs::broadcastState` |
| 副作用 | 适用：每次回读一次观察快照即释放，不驻留内存；无轮询 | `scripts/check.mjs#R-01-024/AC-03`（bundle 通道断言）、`src/host.mjs::broadcastJobTrace` |

## 终态与证据

- 实现: `src/host.mjs` 任务输出重放数据源 listEvents（元数据，无 data 负载）→ `sessionQuery.observeSession`（live-preferred 完整事件，读毕即释放）；`src/core.mjs` job 子条目补 `jobId` 字段（此前 dataset.jobId="undefined" 使回读恒 read:false）；`src/client.mjs` job 子卡悬停原生 tooltip 承载完整命令（el.title）；e2e 新增 mock 剧本 `e2e:job`（bash run_in_background 真实启动 + 从回执动态提取 job id 读 job_output + 收口）与 spec `background-jobs.mjs`。
- 测试: `pnpm verify` 全量一轮 19/19 浏览器 E2E spec 通过（415471ms，含新增 background-jobs spec）；UNIT 锚点 `scripts/check.mjs#R-01-024/AC-02`（数据层）、host 源码断言（observeSession）、bundle 断言（悬停 tooltip）全部通过。浏览器黄金路径 agent 实测（staging 隔离环境，Playwright 实操）五项断言全过：子卡呈现/数量注「后台 ×1」/点开输出区回放 e2e-job-tick 文本/悬停完整命令原文/完成提醒抑制（截图 /tmp/job-verify/01～03）；另以 75s 生命周期时间线观测确认 AC-02（0～60s 在跑期间持续抑制）与 AC-03（任务结束瞬间子卡消失、完成提醒恢复）时序精确。
- DESIGN 对照: 产品契约 job 子条目补 jobId 字段与悬停说明；R-01-024 落点为「后台任务子卡与卡内输出展开」；与实现一致。
- commit: c1ed1e5 数据源修复与悬停细化、a247f11 jobId 字段补齐与 E2E 覆盖（本关闭提交随后者之后）。
- review:
  - 审核方: 本 task 为 T-149 交付后的实测缺陷修复（短路类，map 仅 DESIGN 呈现细节补记），修复经东家 staging 环境浏览器实操复核；代码审核由 T-149 双轴审核机制同一流程承载（发现-修复-复审闭环见其证据），本 task 增量（jobId 字段、observeSession 数据源、E2E 剧本与 spec）经 e2e 全量 19/19 spec 与 verify:fast 门禁验证。
  - 目的理解: 让「后台任务输出查看」在真实环境可用（AC-01/AC-02 不被数据层缺陷架空）并补浏览器覆盖；约束——零新增轮询、失败语义不冒充、呈现不冒充回合运行。
  - 执行方式: 根因定位（listEvents 类型契约核查 + e2e [api] probe 取证 dataset.jobId="undefined"）→ 修复 → E2E spec 实证 → agent 浏览器黄金路径实操五项断言 + 生命周期时间线观测。
  - 问题与修复: ①observeSession 替换 listEvents；②core job 子条目补 jobId；③悬停 tooltip；④mock 剧本 messages 作用域 ReferenceError（catch 静默吞响应）→ 显式传 body.messages。
  - 复审结论: 单测/合同/E2E/浏览器实操四层全绿；无未关闭发现。残余风险：主环境（真实 DSH）需重启后获得同等修复（staging 已证）。

