---
doc-type: task
mutation: lifecycle
id: T-154
---

# T-154 删除后台任务输出查看（R-01-024），job 子卡激活改为跳转归属会话

状态: active
关联: R-01-024（删除）、R-01-023/AC-07（措辞收敛）、R-01-005/AC-03（新增）
风险等级: standard

## 背景与目标

- 背景: 后台任务子卡的卡内输出展开（点击回放归属会话模型已读取的任务输出）在绝大多数使用场景下展开后无有效内容（模型未读取或读取内容对人无展示价值），东家确认（2026-09-22）删除该功能：去掉输出获取（宿主镜像与回放通道）与点击展开交互。
- 目标: PRD 删除 R-01-024；SOLUTION、代码（宿主镜像/路由、core 纯函数、客户端展开与回读）与测试同次级联收敛；job 子卡激活行为经东家选择改为跳转归属主会话（R-01-005/AC-03）。

## 差距评估

- 现状：R-01-024 承载输出查看全链——宿主侧 `job_output` 镜像环形缓冲、`GET /api/jobs-output` 回放、`GET /api/jobs/stream` SSE 通知、core 纯函数 `jobOutputTraces`/`jobOutputFromTraces`、客户端 `toggleJobExpanded`/`renderJobOutput` 与 jobs SSE 订阅；job 子卡激活被 R-01-024/AC-01 定义为卡内展开而非会话跳转。
- 删除后：job 子卡激活需新归属——东家选定「点击跳转到归属会话」，归入 R-01-005（跳转到会话）新增 AC-03；R-01-023/AC-07 中「不改变子卡的激活与输出展开交互」措辞随之收敛。

## 收敛方案

1. PRD：删除 R-01-024 全条目；R-01-023/AC-07 去掉「与输出展开交互」措辞；R-01-005 新增 AC-03（激活后台任务子卡切换到归属主会话）。
2. SOLUTION：删除 R-01-024 追溯行、后台任务输出通道契约、完成确认宿主侧的镜像职责与内部结构、活动状态模型与窗格渲染器职责中的 R-01-024 引用；任务子卡契约中「激活即展开输出区」改为激活跳转归属会话。
3. 代码：
   - src/host.mjs：删除 job_output 镜像（环形缓冲、callId 配对、`/jobs/stream` 广播）、`/jobs-output` 与 `/jobs/stream` 路由及相关 import。
   - src/core.mjs：删除 `JOB_OUTPUT_MAX_CHARS`、`jobOutputTraces`、`jobOutputFromTraces` 及辅助函数。
   - src/client.mjs：删除 jobs SSE 订阅、`toggleJobExpanded`、`renderJobOutput`、`.dap-jobout` 样式与卡上 jobId 脏标记逻辑；激活回调经 `navigation.mjs` 新纯函数 `activationTarget` 把 job 复合 id 解析为归属会话 id 后走通用跳转链。
4. 测试：scripts/check.mjs 删除 R-01-024 单测与 bundle 契约项（HTTP/SSE 计数 3→2）、job 子卡条目断言改锚 R-01-023、新增 `activationTarget` 单测锚定 R-01-005/AC-03；e2e background-jobs.mjs 删除输出展开断言、tooltip 断言改锚 R-01-023/AC-05；mock-llm 的 e2e:job 剧本不动（引擎侧真实后台任务生命周期与本需求无关）。

## 测试计划

- `pnpm verify:fast`（AgentMap lint + 测试影响检查 + core 单测与 bundle 契约）。
- `pnpm verify`（含全量浏览器 E2E，重点 background-jobs spec）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-024/AC-01～AC-04 | 删除需求 | E2E/UNIT | remove | 需求删除：check.mjs R-01-024 单测与 bundle 契约移除；e2e background-jobs 输出展开断言移除 |
| R-01-023/AC-07 | 措辞收敛（去掉「与输出展开交互」），可判定语义不变 | none | 措辞澄清，不改变 AC 可判定内容；卡面底色区分语义与既有 E2E 不变 |
| R-01-005/AC-03 | 新增 AC | UNIT | add | check.mjs 新增 `activationTarget` 单测断言（job 复合 id → 归属会话 id、非 job 原样）；浏览器人工验收记录于本 task |
| SOLUTION | 删除后台任务输出通道契约、完成确认宿主侧镜像职责/内部结构与 R-01-024 追溯行；任务卡激活语义改为跳转归属会话（R-01-005/AC-03） | UNIT | update | `python3 tools/agentmap_lint.py --report`：requirements=27、solution-covered=27、test-anchored=170 全通过（R-01-024 追溯行与输出通道契约已移除） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：job 子卡呈现与激活跳转归属会话正常、其余卡片交互不变 | `scripts/check.mjs#R-01-005/AC-03`、`src/navigation.mjs::activationTarget`、`e2e/specs/background-jobs.mjs#R-01-023/AC-01` |
| 异常 | 适用：job 子卡归属缺失（jobOwner 为空）时激活返回空目标、不发起跳转，不误用复合 id 调 sessions.open | `scripts/check.mjs#job 子卡归属缺失时返回空目标`、`src/navigation.mjs::activationTarget` |
| 边界配置 | 适用：删除路由后宿主 `/api/*` 其余路由（acks/busy/ack）不受影响；bundle 调用面收敛为 fetch=2、EventSource=2 | `scripts/check.mjs#SSE 订阅仅 acks 与 busy 两条通道`、`scripts/check.mjs#HTTP 请求仅确认写回与 busy 懒回填两处`、`package.json::verify` |
| 副作用 | 适用：卸载清理、SSE 连接集合、渲染签名不含已删除机制 | `scripts/check.mjs#卸载移除注入样式`、`package.json::verify` |

## 终态与证据

- 实现: （待填）
- 测试: （待填）
- SOLUTION 对照: （待填）
- commit: （待填）
- review: （待填）
