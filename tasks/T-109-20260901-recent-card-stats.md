---
doc-type: task
mutation: lifecycle
id: T-109
---

# T-109 最近历史卡保留回合统计

状态: completed
关联: R-01-013/AC-12 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 会话结束从活动区迁入最近历史区后，历史卡当前只保留消息预览与活动时间；运行卡最后一行的 tok/s、缓存命中率、输入/输出 token 与回合耗时随运行骨架消失。
- 目标: 最近历史卡在助手预览与活动时间之间增加倒数第二行，冻结显示最近一个已结束回合的可用统计；左侧沿用运行卡顺序 `tok/s · 缓存 · 输入 · 输出`，耗时固定在该行最右侧。
- 非目标: 不新增状态轮询或私有持久化；不改变运行卡、等待卡、历史排序、消息预览与活动时间；缺失字段不伪造，统计全空时隐藏该行。
- 需求闸口: 东家已确认按上述位置、字段顺序与现有 native 数据来源演进 PRD/DESIGN。

## 差距评估

- `src/client.mjs::cardChildren("recent")` 只有工作区/模型、标题、用户预览、助手预览与时间行，没有 `.dap-token-stats`。
- `renderTokenStats` 已能渲染运行卡双段统计，但只在 `entry.kind === "running"` 分支调用；历史条目没有 token/速率/耗时字段。
- `src/core.mjs::cardSignature` 已纳入 tokenStats 相关字段，可复用现有签名去重；`usageSummary`、`runtimeStats`、`lastTurnDuration` 已具备统计口径与最近回合耗时派生。
- 运行统计来自 `sessions.list` 条目的 `projectionValues.tokenUsage/sessionStats`；停止订阅后仍保留 `sessionDetailsById` 快照与最后已知投影统计，冷会话可经既有 native history 补足回合边界。
- `PRD.md` 的最近卡需求尚未承诺统计行；`DESIGN.md` 的最近卡结构、产品契约与运行时加载描述尚未覆盖该字段。

## 收敛方案

1. 更新 `PRD.md` 的 `R-01-013`，新增 `AC-12`：最近卡在助手预览后、活动时间前显示最近已结束回合的统计行，字段顺序与缺失值行为明确。
2. 更新 `DESIGN.md` 的最近卡核心结构、统计数据来源、产品契约、历史卡渲染与加载语义；更新 `DOMAIN.md` 的术语/跨模块不变量，使 map 与实现一致。
3. 在 `src/client.mjs` 复用现有 `.dap-token-stats` 双段骨架与 `renderTokenStats`：recent 卡增加隐藏的统计行，运行期间保留最后已知投影统计，历史卡优先复用该值并在页面刷新时回退 `projectionValues`；耗时从保留快照或 native history 派生最近完整回合，只有缺少快照回合边界时才为当前可见历史卡加入既有 history 冷读。
4. 在 `scripts/check.mjs` 增加 R-01-013/AC-12 的 bundle/结构契约；在 `e2e/specs/session-lifecycle.mjs` 断言会话确认进入历史后统计行可见、耗时存在且统计行紧邻活动时间行之前。
5. 更新 `scripts/acceptance.mjs` 与 README 的历史卡验收/功能描述，重建 `.dsh-plugin/client.js`，运行 focused 与完整验证。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-013/AC-12 | 新增最近历史卡回合统计行承诺 | UNIT/E2E/MANUAL | add | `scripts/check.mjs#R-01-013/AC-12`、`e2e/specs/session-lifecycle.mjs#R-01-013/AC-12`、`scripts/acceptance.mjs#R-01-013/AC-12` |
| R-01-009/AC-05、AC-12 | 运行/等待卡统计与耗时口径保持不变 | UNIT/E2E | regression | 既有 `usageSummary`、运行卡统计布局及三类等待耗时断言继续通过 |
| R-01-013/AC-01～AC-11 | 最近卡既有信息层级、预览、时间与弱化样式保持不变 | UNIT/E2E | regression | 既有历史卡结构/时间/预览与迁移动画测试继续通过 |
| R-01-014 | 历史卡统计字段按需加载并在数据到达后就地填充 | UNIT/E2E | regression | 既有 detail load plan、历史分页与加载状态测试继续通过 |
| DESIGN | 最近卡统计字段、来源与渲染落点变化 | UNIT/E2E | update | `DESIGN.md` 最近卡核心结构/产品契约/加载语义与对应 bundle/E2E 证据同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：会话确认迁入历史后，统计行显示 tok/s、可用缓存/输入/输出字段，耗时在右侧且位于活动时间上一行 | `scripts/check.mjs#R-01-013/AC-12`、`e2e/specs/session-lifecycle.mjs#R-01-013/AC-12`、`scripts/acceptance.mjs#R-01-013/AC-12`、`src/client.mjs::renderTokenStats` |
| 异常 | 适用：缺 projection、缺回合起止或非法桶时不伪造字段；统计全空隐藏，不残留空行 | `scripts/check.mjs#R-01-009/AC-05`、`scripts/check.mjs#R-01-013/AC-12`、`src/client.mjs::renderTokenStats` |
| 边界配置 | 适用：无缓存读桶时隐藏缓存命中率，零命中显示 0%，窄卡下左侧省略而耗时保持可见，冷历史数据后到就地填充 | `scripts/check.mjs#R-01-009/AC-05`、`e2e/specs/session-lifecycle.mjs#R-01-013/AC-12`、`src/client.mjs::.dap-token-main` |
| 副作用 | 适用：不新增轮询/路由/私有持久化，不改变历史排序、预览、时间、运行卡与等待卡布局 | `scripts/check.mjs#R-02-001/AC-01`、既有 history/等待 E2E、`src/client.mjs::loadNativeDetails` |
| 恢复 | 适用：页面刷新后历史卡可从 list projection 与 native history 恢复可用统计 | `e2e/specs/session-lifecycle.mjs#R-01-013/AC-12`、`src/client.mjs::lastTurnDuration` |

## 测试计划

- 先更新 PRD/DESIGN/DOMAIN 与测试证据，使当前历史卡缺少统计行的实现按预期失败。
- 实现后运行 `pnpm verify:fast`，再运行 focused `session-lifecycle` E2E。
- 重建 `.dsh-plugin/client.js` 并验证现有 `http://127.0.0.1:3080/` 刷新后的页面。
- 调用 `code-review` skill 做 Standards/Spec 双轴独立审核，finding 清零后关闭 task。
- 最终运行 `pnpm verify`，记录精确结果后将 task 改为 completed。

## 终态与证据

状态: completed

- 实现: `src/core.mjs` 增加 `statsFromProjection` 统一列表投影统计口径；`src/client.mjs` 为最近卡增加隐藏的 `.dap-token-stats` 骨架，在助手预览后渲染可用 tok/s、缓存命中率、输入/输出 token 与固定回合耗时；运行期间保留最后已知投影统计，冷刷新回退 projection/history；`.dsh-plugin/client.js` 已同步重建。
- 测试: 先行 `node scripts/check.mjs` 按预期因缺少 `statsFromProjection` export 失败；实现后 `pnpm verify:fast` 通过，`pnpm test:e2e session-lifecycle` 通过（迁移、字段、倒数第二行与刷新恢复），最终 `pnpm verify` 通过（13 个 E2E spec 全部通过）；现有 `http://127.0.0.1:3080/` 刷新后 HTTP 200、窗格挂载 1 个（当前运行时无最近卡 fixture），commit hook 的 bundle check 与 `git diff --check` 通过。
- DESIGN 对照: `PRD.md` 新增 `R-01-013/AC-12`；`DESIGN.md` 更新最近卡结构、native projection/history 来源、统计行位置/隐藏规则与加载回退；`DOMAIN.md` 登记“最近回合统计”及其跨模块不变量；README、人工验收和 E2E 同步。
- commit: 2616d06
- review:
  - 审核方: Standards reviewer `11be289b-c001-48cf-b83f-ec5277a387fc`；Spec reviewer `2494d7c3-9717-4a4b-b960-658033a85498`。
  - 目的理解: 在不改变运行卡、等待卡、历史排序、消息预览和活动时间语义的前提下，让会话结束进入最近历史后继续保留最后已结束回合的可用统计；关联 `R-01-013/AC-12`、`R-01-009/AC-05`、`R-01-009/AC-12` 与 `T-109`。
  - 执行方式: `code-review` skill；固定基线 `a3b74525c434222b14134b2c979408078c6f9d73`，审核范围 `git diff a3b7452...2616d06`，含提交 `2616d06`；Standards/Spec 双轴并行审核。
  - 问题与修复: Standards 无 documented-standard hard violation；提出 `const stats` 命名与统计字段合并的轻微 baseline judgment calls，均不影响语义且无需修复。Spec 未发现缺失/越界/错误实现；指出逐字段缺失与全空组合的覆盖可继续增强，但不是已证实缺陷。
  - 复审结论: Standards 与 Spec reviewer 均确认本次实现符合仓库规范与 `R-01-013/AC-12`，无阻断 finding，任务目标与追溯证据闭合。
