---
doc-type: task
mutation: lifecycle
id: T-125
---

# T-125 会话卡标题统一常规字重

状态: completed
关联: R-01-013/AC-09 / 窗格渲染器
风险等级: standard

## 背景与目标

东家 2026-09-11 反馈「会话卡片里的标题文字看起来是粗体，把它们改成正常字体」。T-022 后 `.dap-title` 基础字重 700 仅由 `[data-kind="recent"]` 覆盖为 400，活动卡与子代理卡标题仍加粗。目标：全部会话卡（活动卡、子代理卡、最近卡）标题统一常规字重。PRD 未规定活动卡标题字重，R-01-013/AC-09（最近卡常规字重）继续成立，PRD/DESIGN 无需演进（T-022 先例：样式细节属实现自由）。

## 差距评估

- `src/client.mjs` 的 `.dap-title` 基础 `font-weight: 700`，加 recent 覆盖 400；数据层（`src/core.mjs`）与 DOM 结构不变，纯呈现调整。
- `scripts/check.mjs` R-01-013/AC-09 bundle 契约断言「活动卡保持加粗 700」与 `scripts/acceptance.mjs` 人工验收步骤（与活动卡加粗区分）须同次同步，否则门禁失败。

## 收敛方案

- `.dap-title` 基础字重 700 → 400，删除已冗余的 `[data-kind="recent"] .dap-title` 覆盖规则。
- `scripts/check.mjs` 断言改为：基础规则字重 400 且不再存在 recent 覆盖。
- `scripts/acceptance.mjs` 验收步骤改为「活动卡与最近历史卡标题均为常规字重」。

## 测试计划

- `scripts/check.mjs`：更新 R-01-013/AC-09 bundle 契约断言。
- `scripts/acceptance.mjs`：更新 R-01-013/AC-09 人工验收步骤。
- `pnpm verify:fast`（AgentMap lint + 测试影响 + core 单测与 client bundle 契约）。
- 独立代码审核（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三类会话卡标题均为常规字重 | `scripts/check.mjs#R-01-013/AC-09`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：长标题截断与布局不受字重影响 | `scripts/check.mjs#R-01-013/AC-02`、`src/client.mjs::CSS` |
| 副作用 | 适用：不改动 DOM 结构与数据流；最近卡呈现不变（原本已 400） | `scripts/check.mjs#R-01-013/AC-10`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/client.mjs` 的 `.dap-title` 基础字重 700 → 400，删除冗余的 `[data-kind="recent"] .dap-title` 覆盖；活动卡、子代理卡、最近卡共用同一常规字重规则；`.dsh-plugin/client.js` 同步重建。
- 测试: `node scripts/check.mjs` 全部断言通过（R-01-013/AC-09 契约断言更新为基础 400 + 无 recent 覆盖）；`pnpm verify:fast` 全绿（AgentMap lint + 测试影响检查 + core 单测与 client bundle 契约）；实现提交 `9e5e31d` 的 pre-commit 全部门禁通过（含 staged client bundle 字节比较）。`scripts/acceptance.mjs` 验收步骤已改为「活动卡与最近历史卡的会话标题均为常规字重」，真实视觉结果仍需人工 GUI 验收。
- DESIGN 对照: 样式细节属实现自由（T-022 先例），DESIGN 无需演进；R-01-013 需求追溯索引既有行（窗格渲染器 / src/core.mjs、src/client.mjs）保持准确。
- commit: 9e5e31d
- review:
  - 审核方: Standards 子代理 `b1946901-e165-4d82-a81f-f493eb840d77`；Spec 子代理 `fd951b24-e4b5-44d6-9e34-b30c4c2ea2f4`。
  - 目的理解: 实现东家 2026-09-11 视觉反馈——三类会话卡标题统一常规字重；纯 CSS 呈现调整，不改 DOM 结构、数据流与其他卡片呈现；关联约束为 R-01-013/AC-09 继续成立、AgentMap 纪律与 strict 测试锚定。
  - 执行方式: `code-review` skill；固定基线 `HEAD`（提交前工作树变更，含未跟踪 task 文件），Standards/Spec 双轴并行审核；Standards 轴另对照 AGENTS.md、CONVENTIONS.md 与 Fowler 坏味基线，Spec 轴以 task T-125 与 PRD R-01-013/AC-09 为规格来源。
  - 问题与修复: 无 blocking 问题。Standards 一条 judgement call（check.mjs 负向断言按选择器子串耦合实现形状，属既有 bundle 契约断言模式）与 Spec 同一处的轻微提示（未来新增非字重的 recent 标题规则会被误拦）均记录不修；Spec 轴备注的关闭前跑齐 `pnpm verify:fast` 已在提交前满足。
  - 复审结论: Standards 通过；Spec 通过，无缺漏、无 scope creep、无错误实现，无遗留 finding，无需复审。
