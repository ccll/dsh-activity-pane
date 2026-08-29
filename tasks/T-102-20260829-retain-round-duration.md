---
doc-type: task
mutation: lifecycle
id: T-102
---

# T-102 等待状态保留上一轮耗时

状态: active
关联: R-01-009/AC-12 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 活动卡从运行中进入完成提醒、阻塞等待或错误提醒后，运行卡原有的右下角耗时随运行骨架移除而消失，用户无法在等待状态判断上一轮花费的时间。
- 目标: 三类等待行动卡均保留最近一个已结束回合的耗时；耗时取完整回合的起止时刻差值，进入等待后冻结，不随等待时间增长，并与等待类型胶囊处于同一行、固定在该行最右侧。
- 非目标: 不让等待卡继续显示运行进度或运行条纹；不把等待时间误算为回合耗时；无完整起止时刻时不伪造耗时；不改变最近历史卡的展示。
- 需求闸口: 东家本次请求明确要求「已完成以及各种等待状态」保留运行期间右下角耗时，按现有三类 `waitClass` 覆盖 done、blocked、error。

## 差距评估

- `src/client.mjs` 只在 `entry.kind === "running"` 分支写入 `.dap-token-time`，`cardChildren("awaiting")` 没有 `.dap-token-stats` 骨架。
- `src/core.mjs` 已有 `lastTurnEndFromEvents` 与 `lastTurnEndFromTimings`，但没有从同一回合的 start/end 提取固定时长的纯函数。
- 等待卡已经保留 `sessionDetailsById` 的最新快照并按需读取 native history，可复用 `turnTimings` 与 history 作为时长来源，不扩展 Host 完成登记字段。
- `PRD.md` 当前只承诺运行卡显示本回合已运行时长；`DESIGN.md`、`DOMAIN.md`、README 与人工验收尚未描述等待卡保留上一轮耗时。

## 收敛方案

1. 在 `src/core.mjs` 增加按最近结束时刻选择的 `lastTurnDurationFromTimings`、`lastTurnDurationFromEvents` 与跨来源 `lastTurnDuration`，只接受有限且非负的 `endTime - startTime`。
2. 在 `src/client.mjs` 对等待条目按快照/history 引用 memo 最近回合耗时；运行条目继续使用实时 `Date.now() - anchor.anchor`，等待条目只写入冻结的 `elapsedMs`。
3. 为 awaiting 骨架增加等待类型胶囊同行的耗时节点，抽取兼容旧骨架的写入逻辑，使 running 保留完整统计、awaiting 将耗时固定在该行最右侧；不把耗时放入正文行末尾。
4. 更新 `PRD.md` 新增 R-01-009/AC-12，更新 `DESIGN.md`、`DOMAIN.md`、README 中的当前契约，并追加 C-066 记录 native 时长来源选择。
5. 测试先行更新 `scripts/check.mjs` 的纯函数/生成 bundle 断言，以及生命周期、阻塞、错误 E2E 的等待卡可观察行为断言。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-12 | 新增等待卡固定上一轮耗时承诺 | UNIT/E2E/MANUAL | add | core 断言来源选择与非法输入；完成/错误等待卡断言 `.dap-token-time` 保持，阻塞首回合断言无完整上一轮时不造假 |
| R-01-009/AC-05、AC-06 | 运行卡实时耗时与进度保持不变 | UNIT/E2E | regression | 既有 runtime stats、进度布局与运行卡 browser 场景继续通过 |
| R-01-002 | 完成/阻塞/错误等待卡结构与提醒语义保持不变 | UNIT/E2E | regression | awaiting 骨架只在胶囊同行增加右置耗时，不改变胶囊、正文、按钮与脉冲 |
| R-01-016 | 等待卡时间线仍保留 | E2E | regression | 既有生命周期与 auto-update 等待卡时间线断言继续通过 |
| DESIGN | 等待卡耗时同行右置与 native 回合边界来源 | UNIT/E2E | update | `scripts/check.mjs#R-01-009/AC-12`、三类等待卡 browser 断言覆盖设计落点 |
| 恢复 | 页面刷新后的等待卡仍能从 native 数据恢复耗时 | E2E | add | error reminder 刷新断言同时检查固定耗时 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：存在完整上一轮时完成/错误等待卡显示固定耗时，等待卡位置与类型胶囊同行最右侧 | `package.json::check`、`package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-12`、`e2e/specs/error-reminder.mjs#R-01-009/AC-12` |
| 异常 | 适用：缺失起点、缺失终点、负时长与非法 history 不显示虚假耗时；阻塞首回合没有上一轮时为空 | `package.json::check`、`scripts/check.mjs#R-01-009/AC-12`、`package.json::test:e2e`、`e2e/specs/auto-update.mjs#R-01-009/AC-12` |
| 边界配置 | 适用：运行卡仍实时增长，等待卡冻结；零时长合法显示 `0s` | `package.json::check`、`scripts/check.mjs#R-01-009/AC-12`、`package.json::test:e2e`、`e2e/specs/session-lifecycle.mjs#R-01-009/AC-12` |
| 副作用 | 适用：等待卡不显示进度条、统计左列或确认按钮语义不变，最近历史卡不新增耗时 | `package.json::check`、`scripts/check.mjs#R-01-009/AC-12`、`package.json::test:e2e`、`e2e/specs/auto-update.mjs#R-01-009/AC-12` |
| 恢复 | 适用：刷新/重连后的错误提醒仍显示相同耗时 | `package.json::test:e2e`、`e2e/specs/error-reminder.mjs#R-01-009/AC-12` |

## 测试计划

- 先更新纯函数与 bundle 契约断言，运行 `node scripts/check.mjs` 确认旧实现按预期失败。
- 实现后运行 `pnpm verify:fast`，再运行受影响的 focused E2E。
- 重建 `.dsh-plugin/client.js` 并验证现有 `http://127.0.0.1:3080/` 刷新后的页面。
- 调用 `code-review` skill 做 Standards/Spec 双轴独立审核，修复并复审全部 finding。
- 最终运行 `pnpm verify`，记录精确结果后关闭 task。

## 终态与证据

待实现。
