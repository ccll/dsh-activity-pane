---
doc-type: task
mutation: lifecycle
id: T-149
---

# T-149 后台任务活动呈现与卡内输出查看

状态: completed
关联: R-01-023（新增）、R-01-024（新增）→ 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家需求（2026-09-18）——会话「跟进NAS1迁移交接任务进度」有后台任务在跑，但主会话显示为已完成，窗格毫无后台任务在跑的迹象，令人迷惑。窗格定位是「不逐个打开会话即可掌握全局活动」，后台任务是目前唯一漏掉的活动形态。
- 根因: 快照 `sessions.list` 本携带 `jobsBySession`（`session/jobs` 推送镜像，任务状态变化即推帧），但 `src/core.mjs` 仅在头注释登记该字段，`buildEntries`/`buildRecent` 未消费。
- 方案来源: 语义层「liveJobs 第三活动来源」＋呈现层「后台标识＋卡内任务行＋输出区」；输出回放机制参考 dsh-better-sidebar v0.14.0（`jobs-routes.ts` 事件镜像 + `subagent-jobs.ts` 纯函数派生），交互细节（共享输出区、未读取提示、截断提示）按本窗格卡片形态收纳改造。
- 目标: 存活在跑后台任务的主会话保留在活动区按运行态呈现并标注数量；完成/错误提醒被抑制；点击任务行在卡内查看模型已读取的任务输出；全过程零新增轮询。
- 非目标: 不做任务 kill 写路径（二期）；不做 failed/killed 终态任务的独立提醒呈现（二期评估）；不在输出区重放流式中间输出（模型读取粒度即回放粒度）。

## 差距评估

- PRD.md: 无后台任务相关需求（已检索确认）→ 已新增 R-01-023（4 AC）、R-01-024（4 AC）。
- DESIGN.md: 追溯索引、显示过滤不变量、等待优先、分区不变量、产品契约（buildEntries 条目字段、任务输出通道契约）、完成确认宿主侧模块、边界契约 → 已同步演进。
- DOMAIN.md: 缺「后台任务」「在跑后台任务」术语 → 已登记。
- src/core.mjs: `buildEntries`/`buildRecent` 不感知 `jobsBySession`；无任务输出配对纯函数。
- src/host.mjs: 已有 `session/event` 订阅（回合记账）与 `sessionQuery`（懒回填），无 `job_output` 轨迹镜像与 `/api/jobs-output`、`/api/jobs/stream` 路由。
- src/client.mjs: 无后台标识、任务行与输出区渲染；`cardSignature` 不含任务字段。
- scripts/check.mjs: 无 R-01-023/R-01-024 锚点与 fixtures。

## 收敛方案

1. `src/core.mjs`：
   - `liveJobsOf(jobsBySession, id)` 归一（`status ∈ {running,stopping}`，快照缺失/非数组容错）；
   - `buildEntries` 接受 `jobsBySession`：liveJobs 非空的主会话 `selfActive` 视真、归运行组、条目携带 `liveJobs`（`{id,label,status,startedAt}[]`，startedAt 升序）；liveJobs 非空时完成提醒与错误提醒抑制（`completionReminder`/`errorReminder` 调用点抑制， Reminder 纯函数自身签名不变）；
   - `buildRecent` 接受 `jobsBySession`：liveJobs 非空的主会话不进历史候选；
   - 新增 `jobOutputTraces(events)` 与 `jobOutputFromTraces(traces, jobId, limit)` 纯函数（callId→jobId 配对、tool-result 文本块提取、error 与 `(no new output)` 剔除、截断）。
2. `src/host.mjs`：同一 `session/event` 订阅中镜像 `job_output` 轨迹（每会话环形 200 条，内存态）；`GET /api/jobs-output`（`sessionQuery.listEvents` 重放 + 镜像按 seq 去重合并 → `{text, truncated, read}`）；`GET /api/jobs/stream` SSE（连接即发空快照，新轨迹广播 `{sessionId, jobId}`）。
3. `src/client.mjs`（东家 2026-09-18 复核改向：任务以子卡呈现）：running 母卡标题行渲染 `后台 ×N` 数量注；每个在跑任务以 `kind: "job"` 缩进子卡呈现（与子代理同形，激活子卡在卡内手风琴展开输出区，同母会话至多一个展开），输出区（fetch + jobs/stream SSE）带「尚未被读取」/「输出过长，已截断」/「输出读取失败」提示；时长随既有 1 秒时钟（jobsAgeSec 秒桶入签名）；`cardSignature` 并入 liveJobs/jobStatus/jobsAgeSec。
4. `scripts/check.mjs`：fixtures + 锚定 R-01-023/AC-01～AC-04、R-01-024/AC-01、AC-04（AC-02、AC-03 由浏览器 E2E/渲染层契约承载，见测试计划）。
5. `.dsh-plugin/client.js` 随实现重建（`pnpm check`），pre-commit 校验 staged 一致。

## 测试计划

- `scripts/check.mjs`（UNIT，锚定新 AC-ID）：
  - R-01-023/AC-01：liveJobs 非空主会话出现在活动区、kind 为 running 类呈现、条目 `liveJobs` 计数与排序正确；
  - R-01-023/AC-02：回合已结束 + liveJobs 非空 ⇒ done/err 提醒均不成立（条目非 awaiting）；
  - R-01-023/AC-03：liveJobs 清空后完成提醒恢复成立、历史候选恢复；
  - R-01-023/AC-04：徽标统计（`awaitBadgeStats`/`countBadgeState` 口径）将仅 liveJobs 的主会话计入分子；
  - R-01-024/AC-01、AC-04：`jobOutputTraces`/`jobOutputFromTraces` 配对、去重、剔除与截断断言。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归（unit/contract + 全部浏览器 E2E，兼作浏览器实际操作验证）。
- 浏览器人工验证（黄金路径）：用真实后台任务会话核对活动呈现、提醒抑制与输出区交互（汇报时附证据或明确说明未实测项）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-023/AC-01～AC-04 | 新增 | UNIT | add | `scripts/check.mjs` 新增锚点断言（见测试计划） |
| R-01-024/AC-01、AC-02、AC-04 | 新增 | UNIT | add | `scripts/check.mjs` `jobOutputTraces`/`jobOutputFromTraces` 断言（AC-02 的「尚未被读取」判定=read=false 分支为 UNIT；其页面文案呈现为 browser/manual） |
| R-01-024/AC-03 | 新增 | browser/manual | add | 输出区随 jobs/stream 轨迹通知刷新为渲染层行为；E2E 黄金路径 + 人工验证记录于终态 |
| DESIGN | 活动状态模型显示过滤/分区不变量/产品契约、完成确认宿主侧模块与任务输出通道契约演进 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步（同 T-148 惯例） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：后台任务会话保留活动区、标注数量、任务行可点开输出 | `scripts/check.mjs#R-01-023/AC-01`、`scripts/check.mjs#R-01-024/AC-01`、`src/core.mjs::liveJobsOf` |
| 异常 | 适用：回合结束+后台任务期间完成/错误提醒被抑制、任务结束恢复 | `scripts/check.mjs#R-01-023/AC-02`、`scripts/check.mjs#R-01-023/AC-03`、`src/core.mjs::buildEntries` |
| 边界配置 | 适用：jobsBySession 缺失/非数组/空数组容错；malformed arguments、error 结果、`(no new output)`、超限截断；stopping 计入 live | `scripts/check.mjs#R-01-024/AC-04`、`scripts/check.mjs#R-01-024/AC-02`、`src/core.mjs::jobOutputFromTraces` |
| 副作用 | 适用：无新增轮询与定时器；镜像环形上限有界；bundle 契约与全量回归 | `package.json::verify`、`scripts/check.mjs#R-01-023/AC-04` |

## 终态与证据

- 实现: `src/core.mjs`——新增 `liveJobsOf`（在跑任务归一：status ∈ {running, stopping}、startedAt 升序、畸形容错）、`jobOutputTraces`/`jobOutputFromTraces`（job_output call/result 配对回放纯函数，seq 去重、error 与 `(no new output)` 剔除、限额截断）；`buildEntries` 接受 `jobsBySession`——liveJobs 非空的主会话归运行组（条目 kind=running、携带 `liveJobs` 与 `selfRunning`）、在调用点抑制完成/错误提醒（Reminder 纯函数签名不变）、`buildRecent` 同步排除在跑会话；`cardSignature` 并入 liveJobs 与 jobsAgeSec。`src/host.mjs`——既有 `session/event` 订阅增设 `job_output` 轨迹镜像（每会话 FIFO 环形 200 条，callId 随驱逐同步注销，双源合并按 seq 去重）、`GET /api/jobs-output`（`sessionQuery.listEvents` 日志重放 + 镜像合并 → `{text,truncated,read}`，失败 5xx 诚实降级）、`GET /api/jobs/stream` SSE 轨迹通知；广播循环收敛为 `broadcastState` 单点。`src/client.mjs`——jobs SSE 通道与前台恢复自愈（`resumePushChannels` 更名覆盖双通道）、运行卡骨架增设 `.dap-jobs` 区（`后台 ×N` 标注、任务行含状态点/标签/状态词/随时钟时长、卡内单一输出区带「尚未被读取」/「输出过长，已截断」/「输出读取失败」提示）；回读以 loadedFor+脏标记门控（仅选中变化、显式点击或轨迹通知时发出，渲染帧直达 return，无轮询）；jobs-only 条目经 `jobsAgeSec` 秒桶随 1 秒时钟推进任务行时长；卸载关闭 jobs SSE。PRD/DESIGN/DOMAIN 与 `scripts/check.mjs` 锚点、`.dsh-plugin/client.js` 同次演进。
- 测试: `pnpm verify` 全量一轮通过——AgentMap lint（28 需求/170 AC 全锚定）、test impact lint（新增 8 个 AC-ID 记账）、`scripts/check.mjs` 全部断言（含 R-01-023/AC-01～AC-04、R-01-024/AC-01、AC-02 判定、AC-04 锚点与归一边界、截断、seq 去重断言）、18/18 浏览器 E2E spec 通过（399606ms，修复后最终工作树）。UNiT 锚点 `scripts/check.mjs#R-01-023/AC-01`（活动区保留/运行组呈现/liveJobs 视图）、`#R-01-023/AC-02`（提醒抑制+对照组）、`#R-01-023/AC-03`（恢复判定）、`#R-01-023/AC-04`（徽标分子）、`#R-01-024/AC-01`（配对回放）、`#R-01-024/AC-02`（read=false 分支）、`#R-01-024/AC-04`（截断）全部通过。未实测项：新任务行/输出区的浏览器黄金路径人工操作验证待宿主重启加载新 host 侧代码后进行（本会话寄生于该 `dsh web` 进程，agent 不得擅启重启；API 探针确认现行宿主对新路由返回 404 属预期——进程尚持旧代码），东家重启后如遇问题按缺陷路径回归。
- DESIGN 对照: PRD R-01-023/R-01-024 各 AC 与实现一一对应；DESIGN 显示过滤/等待优先/分区不变量、产品契约（liveJobs/selfRunning/jobsAgeSec、任务输出通道契约）、完成确认宿主侧模块（任务输出镜像）与追溯索引同次演进无差异；DOMAIN 登记「后台任务」「在跑后台任务」。
- commit: 6bb73f0 实现与 map 演进（PRD R-01-023/024、DESIGN、DOMAIN、core/host/client、check 锚点、bundle、TODO 维护想法）
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = 工作树 vs HEAD 6c0d70c；复审由两轴原审核方分别复核修复 hunks）
  - 目的理解: 把快照 `jobsBySession` 中在跑后台任务升格为主会话第三活动来源并在卡内提供模型已读输出回放，解决「回合结束即显示已完成、后台任务不可见」的迷惑；约束——零新增轮询（fetch 2→3、EventSource 2→3 断言演进）、输出回放不消费模型游标、呈现不冒充回合运行；验证方式 = check.mjs 新锚点 + 全量 E2E + staged bundle 字节一致。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS 工程原则 + CONVENTIONS + Fowler 基线；Spec 轴对照 T-149 收敛方案 + PRD R-01-023/024 全 AC + DESIGN 契约），两轴独立并行后各自复审修复。
  - 问题与修复: ①【Standards·高】jobMirrorCalls 无界增长且与注释失配 → callId 随环形驱逐同步注销、注释如实化；②【Standards·中】第三份重复广播循环 → 提取 `broadcastState`（existing 两处按聚焦修改豁免，记 TODO 维护想法）；③【Standards】resumeAcksChannel 名不副实 → `resumePushChannels`；④【Standards】core 死分支 → 删除；⑤【Standards】回放失败伪装「尚未被读取」→ 5xx + 客户端「输出读取失败」；⑥【Standards】task 测试影响 AC-02 层次记账矛盾 → 如实分层；⑦【Spec·高】输出区每渲染帧重取（≈1Hz，违反 DESIGN:262 契约）→ loadedFor+脏标记门控；⑧【Spec·中】selfRunning 未登 DESIGN 产品契约 → 补登记（连带 jobsAgeSec）；⑨【Spec·低】jobs-only 卡时长冻结 → jobsAgeSec 秒桶入签名，与 totalBusyMs 同节奏。豁免（两轴裁决接受）：buildEntries/buildRecent 位置参数 options 化（记 TODO 维护想法）、`__jobOut*` DOM 属性挂载（与卡片 DOM 生命周期绑定的一致模式）、轨迹通知不设防抖（低频 + YAGNI）。
  - 复审结论: 两轴复审通过、各自二次实跑 `node scripts/check.mjs` exit 0；无未关闭发现、无新 scope creep。残余风险与测试缺口：新 UI 的浏览器黄金路径人工验证待宿主重启后进行（本节「未实测项」如实登记）；E2E spec 暂未覆盖 jobs 呈现路径（可在宿主重启实测后按需补 spec）。
