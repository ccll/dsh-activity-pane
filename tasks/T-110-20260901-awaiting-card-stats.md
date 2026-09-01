---
doc-type: task
mutation: lifecycle
id: T-110
---

# T-110 等待卡保留回合统计

状态: completed
关联: R-01-009/AC-13 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 活动会话从 running 进入完成提醒、阻塞等待或错误提醒时，运行卡骨架被替换；当前只保留等待类型同行的回合耗时，原运行统计行中的 tok/s、缓存命中率、输入/输出 token 消失。
- 目标: 三类等待行动卡继续显示进入等待前最后已知的 tok/s、缓存命中率、计费输入 token 与输出 token；字段沿用运行卡顺序，等待期间冻结，既有等待耗时仍置于等待类型胶囊同行最右侧。
- 非目标: 不显示运行进度或条纹，不把等待时间计入回合统计，不新增轮询、路由或私有持久化；统计缺失时不伪造，全部缺失时隐藏统计行；不改变等待类型、正文、确认按钮、时间线、历史排序与最近卡统计。
- 需求闸口: 东家本次请求明确要求活动会话进入等待状态后保留原运行卡 tok/s 等统计；按 done、blocked、error 三类等待覆盖。

## 差距评估

- `src/client.mjs::cardChildren("awaiting")` 没有 `.dap-token-stats` 骨架，`renderCardInto` 只在 running/recent 分支调用 `renderTokenStats`。
- running 分支已把最后一次 `statsFromProjection` 写入 `sessionDetailsById.lastRuntimeStats`；awaiting 分支没有从该保留值或当前列表 `projectionValues` 回填统计字段。
- `renderTokenStats` 已具备字段顺序、缺失字段隐藏与窄卡省略语义；awaiting 已有独立 `.dap-await-head .dap-token-time`，不能重复显示耗时。
- 现有 `lastRuntimeStats` 生命周期与冷刷新列表投影回退可复用；不需要扩展 host ack 或引入新的状态源。

## 收敛方案

1. 更新 `PRD.md` 的 `R-01-009`，新增 `AC-13`，明确三类等待卡冻结保留四个统计字段、字段缺失与刷新回退语义。
2. 更新 `DESIGN.md` 与 `DOMAIN.md`：活动条目承载等待统计字段；等待卡在时间线后保留无耗时的 `.dap-token-stats` 行，耗时仍由 `.dap-await-head` 单独承载；优先使用停止前 `lastRuntimeStats`，刷新回退列表投影。
3. 在 `src/client.mjs` 为 awaiting 骨架增加统计行；awaiting 渲染复用 `renderTokenStats` 但不重复写耗时；从 retained runtime stats 覆盖列表投影字段，保持三类等待与历史卡边界。
4. 更新 `scripts/check.mjs` 的 bundle/结构契约；在 `session-lifecycle.mjs`、`auto-update.mjs`、`error-reminder.mjs` 分别覆盖完成、阻塞、错误等待卡的统计字段与刷新恢复。
5. 更新中英文 README 与 `scripts/acceptance.mjs`，重建 `.dsh-plugin/client.js`，运行快速、focused 与完整验证，并核验 `http://127.0.0.1:3080/`。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-13 | 新增等待卡冻结保留统计承诺 | UNIT/E2E/MANUAL | add | `scripts/check.mjs#R-01-009/AC-13`、三类等待 E2E、`scripts/acceptance.mjs#R-01-009/AC-13` |
| R-01-009/AC-12 | 等待卡固定回合耗时位置与冻结语义保持不变 | UNIT/E2E | regression | 既有 `.dap-await-head .dap-token-time` 三类等待断言继续通过 |
| R-01-002 | 三类等待类型、正文、按钮与脉冲保持不变 | E2E | regression | `auto-update.mjs`、`error-reminder.mjs` 既有等待结构与脉冲断言继续通过 |
| R-01-013/AC-12 | 最近卡统计字段与位置保持不变 | E2E | regression | `session-lifecycle.mjs` 既有历史卡倒数第二行与刷新恢复断言继续通过 |
| R-02-001、R-02-004 | 不新增轮询或订阅，继续复用 native 列表投影与既有运行订阅 | UNIT/E2E | regression | bundle 契约、现有订阅生命周期与控制台错误断言继续通过 |
| DESIGN | 等待卡统计位置、来源与冻结语义变化 | UNIT/E2E | update | `scripts/check.mjs#R-01-009/AC-13` 与三类等待 E2E 覆盖设计落点 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：done、blocked、error 等待卡均显示 tok/s、可用缓存/输入/输出字段，等待期间内容冻结 | `scripts/check.mjs#R-01-009/AC-13`、`package.json::check`、`e2e/specs/session-lifecycle.mjs::R-01-009/AC-13`、`e2e/specs/auto-update.mjs::R-01-009/AC-13`、`e2e/specs/error-reminder.mjs::R-01-009/AC-13` |
| 异常 | 适用：投影缺失或单字段缺失时不伪造，统计全空时隐藏行；等待耗时仍不重复/不增长 | `scripts/check.mjs#R-01-009/AC-13`、`package.json::check`、`e2e/specs/error-reminder.mjs::R-01-009/AC-13` |
| 边界配置 | 适用：等待卡仍无进度条/条纹；已有耗时保留在等待胶囊同行右侧，窄卡左侧统计允许省略 | `scripts/check.mjs#R-01-009/AC-13`、`package.json::check`、`e2e/specs/session-lifecycle.mjs::R-01-009/AC-13`、`e2e/specs/auto-update.mjs::R-01-009/AC-13` |
| 副作用 | 适用：等待类型胶囊、正文、确认按钮、时间线、最近卡位置与统计口径不变 | `e2e/specs/auto-update.mjs::R-01-009/AC-13`、`e2e/specs/error-reminder.mjs::R-01-002/AC-10`、`e2e/specs/session-lifecycle.mjs::R-01-013/AC-12`、`scripts/check.mjs#R-01-009/AC-13`、`package.json::check` |
| 恢复 | 适用：页面刷新后等待卡从当前列表投影恢复统计字段与既有固定耗时 | `e2e/specs/session-lifecycle.mjs::R-01-009/AC-13`、`e2e/specs/auto-update.mjs::R-01-009/AC-13`、`e2e/specs/error-reminder.mjs::R-01-009/AC-13` |

## 测试计划

- 先更新 map、纯函数/bundle 契约与三类等待 E2E，运行 `node scripts/check.mjs` 与 focused E2E 确认旧实现按预期失败。
- 实现后运行 `pnpm verify:fast`，再运行 `pnpm test:e2e`。
- 重建 `.dsh-plugin/client.js`，刷新并核验现有 `http://127.0.0.1:3080/`。
- 调用 `code-review` skill 做 Standards/Spec 双轴独立审核，修复并复审全部 finding。
- 最终运行 `pnpm verify`，记录精确结果后关闭 task。

## 终态与证据

状态: completed

- 实现: `src/client.mjs` 为 awaiting 卡增加位于时间线之后的 `.dap-token-stats` 骨架，复用 `renderTokenStats` 并关闭重复耗时；`src/core.mjs` 增加 `mergeRuntimeStats`，运行中统计按字段保留有效 last-known 值，等待卡优先复用 retained、刷新回退 projection；`.dsh-plugin/client.js` 已同步重建。基础工作单元为 `af7bc77`，字段级回退修复为 `f23b7bc`。
- 测试: 先行 `node scripts/check.mjs` 按预期因缺少 awaiting 统计骨架断言失败；实现后 `pnpm verify:fast` 通过，focused `pnpm exec node e2e/run.mjs session-lifecycle auto-update error-reminder` 通过（完成/阻塞/错误等待、冻结、刷新恢复），最终 `pnpm verify` 通过（13 个 E2E spec 全部通过）；现有 `http://127.0.0.1:3080/` 刷新后 HTTP 200、窗格挂载 1 个；`git diff --check` 与提交 hook bundle check 通过。
- DESIGN 对照: `PRD.md` 新增 `R-01-009/AC-13`；`DESIGN.md` 更新等待卡结构、统计来源/冻结/刷新回退与耗时位置；`DOMAIN.md` 登记等待卡统计不变量；README、人工验收、bundle 契约与三类等待 E2E 同步。
- commit: f23b7bc
- review:
  - 审核方: Standards reviewer `d8f883eb-f9ce-4c59-ba2e-3567b8292862`；Spec reviewer `8d4191b5-e667-4632-8319-b8337c3305e7`。
  - 目的理解: 在不改变等待类型、固定回合耗时、时间线、确认行为、最近卡与订阅边界的前提下，使 done、blocked、error 等待卡保留进入等待前最后已知的 tok/s、缓存命中率、输入/输出 token；等待期间冻结，刷新回退当前列表投影，缺失字段不伪造。
  - 执行方式: `code-review` skill；固定基线 `1999a449537d81cbf7c27d8543b4a4bb9fd02eea`，审核范围 `git diff 1999a44...HEAD`，含提交 `af7bc77`、`f23b7bc`；Standards/Spec 双轴并行审核，发现后由同一 reviewer 复审。
  - 问题与修复: 首轮 Spec reviewer 指出运行中缺失 projection 会无条件覆盖 `lastRuntimeStats`；`f23b7bc` 增加 `mergeRuntimeStats` 与缺失/零值单元断言修复。首轮 Standards 无 hard violation，指出 awaiting 统计骨架存在 baseline `Duplicated Code` 判断性 smell；未新增且不阻断，未为其扩大范围重构。
  - 复审结论: Spec reviewer 确认缺失投影回退、零值、等待冻结、刷新回退与三类等待均符合 `R-01-009/AC-12`、`R-01-009/AC-13`；Standards reviewer 确认无 documented-standard hard violation、无新增 baseline smell；双轴通过，无阻断 finding。
