---
doc-type: task
mutation: lifecycle
id: T-080
---

# T-080 等待三类语义统一：金色阻塞胶囊、错误提醒红面与「类型胶囊 + 正文」末行结构

状态: completed
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

- 实现: `src/host.mjs`——acks 记录扩展 `{ lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }`（四字段 `.nullable().optional()` 兼容升级前旧记录，storageDomain 打开时按记录 parse、必填键缺失会 invalid-record 使 domain 不可用）；turn/end 登记读取 `data.reason.kind`（缺失/非法归一 `unknown`）、error 回合以 `reason.error.message`（仅字符串契约）经 `truncateErrorNote` 截断登记、非 error 回合清空；POST /ack 写回保留新字段；全量快照/SSE 下发新字段。`src/core.mjs`——新增 `errorReminder`（主会话 && `lastTurnEndKind === 'error'` 成立、不消费 ack 游标、随新回合结束覆盖）、`entryErrorNote`（错误信息/回落 `ERROR_NOTE_FALLBACK`）、导出 `truncateErrorNote`（按码点截断、省略号不计上限）；`buildEntries` 派生 `waitClass='error'`（错误优先于完成）、`buildRecent` 排除错误提醒会话、`awaitBadgeTone` 按 错误>阻塞>完成 优先级取色；`ROUND_DONE_NOTE` 改「继续对话，或移入历史」（语义由「已完成」胶囊承载）。`src/client.mjs`——等待卡末行改「胶囊行（圆底类型图标+类型文字）+ 正文行」两段结构（`migrateAwaitingFoot` 负责旧版行尾徽标骨架热装就地迁移、confirm 按钮节点复用）；金色 `#f5c542`（深色底 `rgba(46,42,26,.97)` 与旧琥珀一眼可辨）、错误红 `#f06a72`（与时间线错误红同源）；胶囊与正文同频同相闪烁（data-wait 驱动器 + 跨类转换相位重启）、「移入历史」按钮不闪且仅完成卡提供；数量徽标三处镜像面 tone=error 红/tone=done 绿/默认金。
- 测试: 测试先行改红再转绿；`scripts/check.mjs` 新增 R-01-002/AC-13 锚点组（errorReminder 成立/ack 无关/子代理排除、buildEntries 错误条目 waitClass/noteText、错误信息回落、tone 错误>阻塞>完成优先级、awaitBadgeStats 计分子、buildRecent 排除、错误优先于完成、运行/委托周期抑制、新回合覆盖→完成提醒/已确认退出）与 truncateErrorNote 断言（不超限/恰上限/超限省略号/代理对/非字符串），并重写胶囊结构/三色卡面/闪烁选择器/相位重启的 bundle 契约锚点；`scripts/acceptance.mjs` 新增错误提醒人工条目并改写三类胶囊/三色/徽标条目；`pnpm build:client && pnpm check` 多轮全绿；`agentmap_lint passed`（22/22 需求、128/128 验收点锚定）；`git diff --check` 干净。GUI 目验（三类卡胶囊与正文同步闪烁、金色/红色卡面、按钮仅完成卡、刷新恢复、429 场景错误信息上卡）由东家现场验收。
- DESIGN 对照: DESIGN「等待三类呈现」段落（三色语义、胶囊+正文结构、ERROR_NOTE_FALLBACK 与 truncateErrorNote 契约、徽标优先级）、错误提醒判定（errorReminder）、ack 通道契约（{ lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }）、状态与生命周期图（错误提醒两支覆盖边）、核心数据（waitClass 三值、lastTurnEndKind 枚举含 unknown）与实现逐条对齐；PRD R-01-002/AC-01～AC-13 措辞与实现一致；DOMAIN 阻塞等待/完成提醒/错误提醒词条同步；DECISIONS 追加 C-043（append-only）。
- commit: e6bc2ce
- commit: d886462
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴 2e4af831、Spec 轴 4b2d9657）
  - 目的理解: 两轴 reviewer 均先读取 PRD R-01-002（演进后含 AC-13）、DECISIONS C-043、DESIGN 等待三类呈现契约与宿主侧描述、DOMAIN 词条与本任务文件，明确被审代码目的为「等待三类语义统一：金色阻塞胶囊、绿色完成提醒、红色错误提醒（新增宿主侧 turn/end reason 登记与 acks 通道扩展），末行统一胶囊+正文结构并同频闪烁」，预期行为与验证方式（check.mjs 锚点断言、acceptance 人工条目、bundle 契约）记录于各自报告。
  - 执行方式: `code-review` skill 双轴并行子代理审核，评审基线 4c60a53，范围 e6bc2ce + d886462 全量 diff（工作区修复后复审同基线复核）；复审由同一审核方分别进行。
  - 问题与修复: Standards 轴首轮 2 项硬违规（DESIGN 状态机图错误提醒覆盖边与实现不符——补「→完成提醒（未确认）」与「→无完成（已确认）」两条边；lastTurnEndKind 枚举缺 unknown——补齐并与模块条目一致）+ 判断项（host message 对象放宽收紧为仅字符串；countBadgeState/client 注释锈蚀同步；entryErrorNote 去冗余参数；task 尾换行）全部修复闭环，复审确认无残留硬违规，3 条轻微措辞建议处理：truncateErrorNote 去 max 参数并改述 JSDoc、其余记录在案。Spec 轴首轮 4 项（旧 acks 记录无新字段使 storageDomain 打开失败、登记永久挂起——ackRecord 四字段放宽 .nullable().optional() 实测旧形状 safeParse 通过；截断契约无锚点——truncateErrorNote 下沉 core 导出并补 5 条断言与 DESIGN 契约；[object Object] 正确性疑问——收紧字符串契约；截断按码点并明示省略号不计上限）全数闭环；范围蔓延项（migrateAwaitingFoot 热装兼容、aria-label 错误信息、浅色金色硬编码）复审确认接受为已知取舍；复审残留 1 条注释级（snapshot doc 注释缺新字段）已随手修复。
  - 复审结论: 双轴复审均通过：Standards 轴硬违规与判断项全部闭环、Spec 轴全部 finding 闭环（含升级破坏问题），无残留阻塞项；已知取舍均经审核方确认可接受，不构成回归。
