---
doc-type: task
mutation: lifecycle
id: T-088
---

# T-088 错误提醒跨边界 E2E

状态: active
关联: C-043、C-045 → E2E 验证基建、错误提醒
风险等级: standard

## 背景与目标

错误提醒已有 host 状态折叠、client 派生与单元契约，但缺少从真实 mock LLM 故障经过 DSH Agent 回合结束、Host 登记、SSE 投影到浏览器卡片的跨边界执行证据。补一条隔离 E2E，证明不可恢复模型错误能形成错误提醒并在刷新后恢复。

## 差距评估

- `e2e/mock-llm.mjs` 仅能制造 fast、slow 与 ask 成功/阻塞剧本，不能确定性触发 Agent error turn/end。
- 当前 E2E 没有断言错误卡的「错误」胶囊、错误正文、无确认按钮与刷新恢复。
- 单元测试不能证明 mock provider、Host completion registry、客户端控制流和 DOM 呈现之间的跨进程连接。
- 首次 E2E 复现显示 Host `/acks` 快照已含 `lastTurnEndKind: "error"` 与错误正文，但 `applyAcksState()` 只保留 `lastTurnEnd/ackedAt`，客户端因此把同一记录误判为完成提醒；这是错误分支在真实运行时不可达的直接根因。

## 收敛方案

- mock LLM 增加 `e2e:error`，返回带稳定错误 message/code 的非重试型 HTTP 400。
- `applyAcksState()` 完整保留 Host 快照的 `lastTurnEndKind/lastTurnEndError`，确认写回的乐观更新也保留同一记录的其他字段。
- 新增独立 `error-reminder.mjs`，从浏览器发送 error 剧本消息并观察错误提醒。
- 断言错误正文跨边界可见、错误卡不提供「移入历史」、打开会话不解除、刷新后恢复。
- 不给普通 E2E 失败增加恢复路径。

## 测试计划

- `pnpm verify:fast` 验证 mock 剧本与 spec 注册契约。
- 单独运行 `node e2e/run.mjs error-reminder.mjs`。
- 完整 `pnpm verify` 验证新增 spec 与既有 10 个 spec 顺序共存。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：HTTP 400 模型故障形成错误提醒并显示稳定错误正文 | `e2e/specs/error-reminder.mjs::errorReminder` |
| 异常 | 适用：若 turn/end、Host 登记、SSE 或 DOM 任一边界断开，等待错误提醒超时失败 | `e2e/specs/error-reminder.mjs::until` |
| 边界配置 | 适用：仅最后一条带 `e2e:` 的用户消息选择 error 剧本；tool result 仍优先 fast 收口 | `e2e/mock-llm.mjs::pickScenario` |
| 副作用 | 适用：错误卡无「移入历史」按钮，打开与刷新不解除提醒 | `e2e/specs/error-reminder.mjs::errorReminder` |
| 恢复 | 适用：新浏览器连接从 Host 状态恢复尚未被新回合覆盖的错误提醒 | `e2e/specs/error-reminder.mjs::openApp` |
| 可观测性 | 适用：scenarioLog 证明请求实际命中 error 剧本 | `e2e/mock-llm.mjs::scenarioLog` |

## 终态与证据

- 实现: 待填写
- 测试: 待填写
- DESIGN 对照: 待填写
- commit: 待填写
- review:
  - 审核方: 待填写
  - 目的理解: 待填写
  - 执行方式: 待填写
  - 问题与修复: 待填写
  - 复审结论: 待填写
