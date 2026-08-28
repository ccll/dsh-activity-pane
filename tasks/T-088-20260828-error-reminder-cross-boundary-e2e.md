---
doc-type: task
mutation: lifecycle
id: T-088
---

# T-088 错误提醒跨边界 E2E

状态: completed
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

- 实现: `applyAcksState()` 完整保留 Host SSE 快照的 `lastTurnEndKind/lastTurnEndError`，确认写回保留记录其余字段；mock LLM 新增非重试型 HTTP 400 error 剧本；`error-reminder.mjs` 覆盖 provider→Agent turn/end→Host storage→SSE→浏览器错误提醒、无确认按钮、打开不解除与刷新恢复；发布 bundle 同步。
- 测试: 首次 E2E 复现 Host 快照正确但客户端误显示完成提醒；修复后单 spec 15.235s、0 recovery 通过。最终 `pnpm verify` 11/11 spec 通过（210.532s，0 recovery），`pnpm verify:fast` 与 `git diff --check` 通过。
- DESIGN 对照: `DESIGN.md#E2E 验证基建` 已登记 T-088 与 error 剧本；错误提醒 Host/SSE/core/呈现契约原本即为目标态，修复后 `src/client.mjs` 与 `.dsh-plugin/client.js` 无差异。
- commit: ad1acbd 0c9f014 b16aecc eae633e 8be1d91（实现、审核修复、命令对齐、bundle 同步与验收分工）
- review:
  - 审核方: Standards reviewer `01529703-ddf8-4bd5-a90b-5a58dd06fd63`；Spec reviewer `a44a9e98-fcdf-40f1-a582-aa482debc36e`
  - 目的理解: 用真实 mock provider 故障证明错误提醒跨越 Agent/Host/SSE/浏览器边界，并修复 Host 已登记 error 但客户端投影丢字段导致误显示完成提醒的缺陷；断言只覆盖用户可观察契约。
  - 执行方式: `code-review` skill，固定基线 `15cf561...HEAD`，Standards/Spec 双轴并行审核；每轮修复后由同一审核方复审。
  - 问题与修复: 初审发现 DESIGN 未登记 error 剧本、标题可误满足「错误」断言、内部 DOM/data-tone 断言、AC 锚点过宽、bundle 未同步、acceptance 迁移账本与诊断路径分散；分别由 `0c9f014`、`eae633e`、`8be1d91` 收敛。T-086 矩阵漂移同轮修复。
  - 复审结论: Standards 与 Spec 最终均通过；source/artifact 一致，无 hard violation、无未决 judgement finding。
