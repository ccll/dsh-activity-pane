---
doc-type: task
mutation: lifecycle
id: T-080
---

# T-080 等待三类语义统一：金色阻塞胶囊、错误提醒红面与「类型胶囊 + 正文」末行结构

状态: active
关联: R-01-001/AC-05、R-01-002/AC-01～AC-13、R-01-010/AC-06 → 活动状态模型、窗格渲染器、完成确认宿主侧
风险等级: standard

## 背景与目标

一次真实故障暴露语义缺口：会话内部模型调用持续 429（重试耗尽）而停止，宿主侧把 error 回合的 `turn/end` 与正常回合同样登记 `lastTurnEnd`，活动卡因此显示绿色「已完成」——出错被误报为成功。东家借机对全部等待状态做统一调整（C-043）：等待行动分为三类——阻塞等待（金色）、完成提醒（绿色）、错误提醒（红色）；末行统一为「类型胶囊 + 正文」结构，胶囊与正文同频同相闪烁；错误提醒的数据依赖宿主侧登记 `turn/end` 的 `data.reason`（持久、刷新可恢复），经既有 acks 通道下发。

## 差距评估

- `src/host.mjs`：`session/event` 的 `turn/end` 登记只取顶层 `time` 写 `lastTurnEnd`，不读 `data.reason`；acks 表/快照/SSE 结构为 `{ lastTurnEnd, ackedAt }`，无回合结束原因字段。
- `src/core.mjs`：`completionReminder`/显示过滤/`awaitBadgeTone` 只有两态（blocked/done）；无错误提醒判定；末行文本只有 noteText 单段，无胶囊类别概念。
- `src/client.mjs`：末行为「note + 行尾徽标（blocked 显示）+ 按钮（done 显示）」单行结构；块级徽标在行尾而非首行胶囊；无红色卡面色值；闪烁选择器只覆盖 `.dap-note, .dap-badge`（blocked）与 `.dap-note`（done）。
- `scripts/check.mjs`：R-01-002 锚点断言固定双类行为（琥珀 tone、done 无徽标等）。
- map 层已先行演进（东家确认）：PRD R-01-001/AC-05、R-01-002 全条（AC-01～AC-13）；DESIGN 等待三类呈现、错误提醒判定、ack 通道结构、宿主侧登记；DOMAIN 阻塞等待/完成提醒/错误提醒词条；DECISIONS C-043。

## 收敛方案

- `src/host.mjs`：
  - ackRecord schema 扩充：`{ lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }`（`lastTurnEndKind` 字符串或 null、`lastTurnEndError` 字符串或 null）。
  - turn/end 登记：`typeof event.data?.reason?.kind === 'string'` 时登记为 `lastTurnEndKind`，否则 `'unknown'`；`kind === 'error'` 时取 `reason.error?.message`（字符串、截断至 `ERROR_NOTE_MAX`）登记 `lastTurnEndError`，非 error 回合清空；其余逻辑（time/ack 保留/broadcast）不变。
  - 快照与 POST /ack 的读写保持兼容：读旧记录时缺失字段按 null 处理。
- `src/core.mjs`：
  - 新增 `errorReminder(row, completion, isSub)` 纯函数：主会话 && `completion.lastTurnEndKind === 'error'` 成立（不消费 ackedAt；lastTurnEndError 非空时随文）。
  - `buildEntries`：`done = completionReminder(...)` 之外增加 `err = errorReminder(...)`；展示/等待优先：pending(blocked) > error > done；`doneWait` 判定扩展——`waitClass` 取 `'error'`（err && !running && !delegating）优先于 `'done'`；error 条目 `noteText` 取 `lastTurnEndError`（不可得回落固定文案）。
  - `awaitBadgeTone`：优先级 错误 > 阻塞 > 完成——存在 `waitClass==='error'` 主会话返回 `'error'`，否则存在 blocked 返回 `'blocked'`，全 done 返回 `'done'`。
  - 字面量/常量：`ERROR_NOTE_MAX`（宿主截断长度，与宽度上界匹配）；错误回落文案常量。
- `src/client.mjs`：
  - awaiting 卡骨架：末行改为「首行胶囊行 + 正文区」结构——胶囊行含 `dap-capsule`（圆底类型图标 span + 胶囊文字 span），正文区保留 `.dap-note`（多行 pre-line）；「移入历史」按钮仍在正文行内（done 专属）。
  - 图标：胶囊圆底图标——blocked 沿用 PENDING_ICON_KINDS（approval/plan-review/question），done 新增 check 圆形图标，error 新增感叹号圆形图标；胶囊文字沿用 pendingText /「已完成」/「错误」。
  - `data-wait` 三值驱动 CSS：`'error'` 红色卡面（描边/光晕/状态点/底色，与时间线错误红 `#f06a72` 同源）、`'blocked'` 金色卡面（自琥珀调亮调纯）、`'done'` 绿色不变；闪烁选择器扩为 `:is(.dap-capsule, .dap-note)`（三类同闪，按钮不闪）；相位重启逻辑沿用在 data-wait 变化时同步重启胶囊与正文。
  - `syncCards` 的 badge 逻辑改造为胶囊逻辑：胶囊文字/图标按 waitClass 与 pendingKind 派生；done 胶囊文字「已完成」、error 胶囊文字「错误」。
- 测试先行：先改写 check.mjs 锚点为新契约失败态，再实现转绿。

## 测试计划

- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验证：深色/浅色主题下三类等待卡（完成、提问、错误）的胶囊与正文同步闪烁、金色/红色卡面、「移入历史」按钮仅完成卡；429 真实场景或手工构造 error 回合验证红色错误提醒（含刷新后恢复）。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三类 waitClass 派生、胶囊文字/图标、noteText（动作说明/Q 行列表/ROUND_DONE_NOTE/错误信息）、徽标 tone 优先级 | `scripts/check.mjs#R-01-002/AC-01`、`scripts/check.mjs#R-01-002/AC-02`、`scripts/check.mjs#R-01-002/AC-09`、`scripts/check.mjs#R-01-002/AC-13`、`src/core.mjs::errorReminder`、`src/core.mjs::buildEntries`、`src/core.mjs::awaitBadgeTone`、`src/host.mjs::apply` |
| 异常 | 适用：reason 缺失/非法 kind 归一 unknown、error 无 message 回落、错误信息截断、旧 acks 记录无新字段兼容 | `scripts/check.mjs#R-01-002/AC-13`、`src/core.mjs::truncateErrorNote`、`src/core.mjs::ERROR_NOTE_FALLBACK`、`src/core.mjs::entryErrorNote`、`src/host.mjs::apply` |
| 边界配置 | 适用：error 与 done 优先级（lastTurnEndKind 单值）、错误卡无按钮、后代抑制错误提醒、新回合覆盖解除、刷新恢复 | `scripts/check.mjs#R-01-002/AC-13`、`scripts/check.mjs#R-01-002/AC-12`、`src/core.mjs::completionReminder`、`src/client.mjs::migrateAwaitingFoot` |
| 副作用 | 适用：完成提醒绿卡与按钮不闪不变；Q 行列表/pre-line 不变；时间线错误红独立于卡片红；不可恢复错误不再误报绿色完成 | `scripts/check.mjs#R-01-002/AC-08`、`scripts/check.mjs#R-01-002/AC-10`、`scripts/check.mjs#R-01-002/AC-06`、`scripts/acceptance.mjs#R-01-002/AC-13`、`src/client.mjs::renderCardInto`、`src/core.mjs::awaitNoteText` |

## 终态与证据

待关闭时填写。
