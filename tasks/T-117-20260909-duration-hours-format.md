---
doc-type: task
mutation: lifecycle
id: T-117
---

# T-117 活动卡耗时超一小时按时分秒显示

# T-117 活动卡耗时超一小时按时分秒显示

状态: completed
关联: R-01-009/AC-05 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: `fmtElapsedMs` 对达到或超过 1 小时的回合耗时仍以分钟为最大单位（如「123m4s」），活动卡右下角的长任务耗时可读性差。
- 目标: 回合耗时不足 1 分钟显示「Ns」、不足 1 小时显示「NmNs」、达到或超过 1 小时显示「NhNmNs」；运行卡、等待卡与最近卡共用同一格式。
- 非目标: 不改变耗时取值口径、等待期冻结与刷新恢复语义、统计行布局、进度条与回合进度算法。
- 需求闸口: 东家本次明确要求活动会话右下角耗时在超过 1 小时后显示时分秒。

## 差距评估

- `src/core.mjs::fmtElapsedMs` 只有秒与分秒两个分支，无小时分支；它是唯一时长渲染函数（`src/client.mjs` 统计行为唯一调用点），在此修复即根因层。
- `PRD.md` 的 `R-01-009/AC-05` 只约束耗时显示位置，未约束单位分级；需补充可判定格式契约。
- `scripts/check.mjs` 仅有 47s/3m13s 两组格式锚点；`e2e/specs/session-lifecycle.mjs` 的耗时正则只覆盖 mock 环境短时长，不受本次影响。
- DECISIONS 无时长格式相关决策或否决记录，无翻案风险。

## 收敛方案

1. 更新 `PRD.md` 的 `R-01-009/AC-05`，为已运行时长补充 Ns/NmNs/NhNmNs 三级格式契约。
2. `scripts/check.mjs` 先补小时级断言（锚定 R-01-009/AC-05），确认旧实现按预期失败。
3. `src/core.mjs::fmtElapsedMs` 增加小时分支；调用层与样式层不感知格式细节。
4. 重建 `.dsh-plugin/client.js`，运行快速与完整验证，完成独立 `code-review` 后关闭。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-009/AC-05 | 耗时格式新增小时级契约 | UNIT | modify | `scripts/check.mjs#R-01-009/AC-05` 新增时分秒断言 |
| R-01-009/AC-12 | 等待卡耗时沿用同一格式函数 | UNIT/E2E | regression | 既有 `scripts/check.mjs` 与三类等待 E2E 断言继续通过（mock 短时长不进入小时分支） |
| R-01-013/AC-12 | 最近卡固定耗时沿用同一格式函数 | E2E | regression | `session-lifecycle.mjs` 既有耗时断言继续通过 |
| DESIGN | 无变化：DESIGN 只引用 `fmtElapsedMs` 的显示位置，未钉格式 | — | none | DESIGN.md 未包含格式细节，行为变化由 R-01-009/AC-05 契约与单测承载 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：超过 1 小时的耗时显示「NhNmNs」 | `scripts/check.mjs#R-01-009/AC-05`、`package.json::check` |
| 异常 | 适用：NaN/Infinity/负时长仍归一为空 | `scripts/check.mjs#R-01-009/AC-03`、`package.json::check` |
| 边界配置 | 适用：整小时零段保留与舍入进位边界 | `scripts/check.mjs#R-01-009/AC-05`、`package.json::check` |
| 副作用 | 适用：等待卡/最近卡耗时渲染、进度算法、统计行布局不变 | `e2e/specs/session-lifecycle.mjs::R-01-013/AC-12`、`scripts/check.mjs#R-01-009/AC-05` |

## 测试计划

- 先补 `scripts/check.mjs` 小时级断言，运行 `node scripts/check.mjs` 确认旧实现失败。
- 实现 `fmtElapsedMs` 小时分支后运行 `pnpm verify:fast` 与 `pnpm verify`。
- 重建 `.dsh-plugin/client.js` 并随实现提交暂存。
- 调用 `code-review` skill 做独立审核，修复并复审全部 finding 后关闭 task。

## 终态与证据

状态: completed

- 实现: `src/core.mjs::fmtElapsedMs` 新增小时分支——不足 1 分钟「Ns」、不足 1 小时「NmNs」、达到或超过 1 小时「NhNmNs」（秒数经 `Math.round` 四舍五入）；该函数为唯一时长渲染函数，运行卡、等待卡与最近卡自动共用；`.dsh-plugin/client.js` 随 b6c0b78 重建。
- 测试: 先行断言确认旧实现 RED 后实现转 GREEN；`pnpm verify:fast` 通过；focused E2E（session-lifecycle、error-reminder、auto-update）3 个 spec 通过；`pnpm verify` 全量两轮——首轮 12/13（completion-sync 并行 worker 资源竞争下偶发找不到卡片，单独重跑通过证实为偶发竞态），复审修复后第二轮 13 个 spec 全部通过（201629ms）。
- DESIGN 对照: `PRD.md` 的 `R-01-009/AC-05` 更新为三级格式契约（Ns/NmNs/NhNmNs，秒数四舍五入）；DESIGN 无需变化（只引用 `fmtElapsedMs` 显示位置，未钉格式）；`scripts/check.mjs` 新增小时级与进位边界断言，三处 e2e spec 耗时正则同步为三级契约。
- commit: b6c0b78
- commit: c3ee8a8
- review:
  - 审核方: Standards reviewer `e8a1e970-c8d6-44f3-b53b-9b78bca8a7ec`；Spec reviewer `d65fcfd3-03d6-4953-bcac-03f5896cc424`。
  - 目的理解: 活动卡右下角回合耗时原以分钟为最大单位，数小时任务显示为数百分钟不可读；东家要求超过 1 小时后显示时分秒。约束：不改耗时取值口径、等待期冻结与刷新恢复语义、统计行布局与进度算法；PRD R-01-009/AC-05 为契约锚点，`fmtElapsedMs` 为根因层唯一修复点。
  - 执行方式: `code-review` skill；固定基线 `7fed5ea`，审核范围 `git diff 7fed5ea...HEAD`（提交 b6c0b78、c3ee8a8）；Standards/Spec 双轴并行独立审核后聚合。
  - 问题与修复: Spec 轴 3 项——验证矩阵声称的舍入进位边界缺断言、四处 e2e 耗时正则无法匹配小时段、AC-05 未声明舍入规则；Standards 轴与前两项重叠，无硬性违规。修复于 c3ee8a8：新增 `fmtElapsedMs(3_599_500)` 进位断言、e2e 正则改三级契约、AC-05 补「秒数四舍五入」。无 scope creep；同型正则 3 spec 内联为既有惯例的判断性备注，不阻断。
  - 复审结论: Spec 轴通过（3/3 finding 消除、无新问题）；Standards 轴通过；双轴最终通过，T-117 实现与追溯证据闭合。
