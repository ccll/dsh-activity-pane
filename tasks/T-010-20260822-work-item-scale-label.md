---
doc-type: task
mutation: lifecycle
id: T-010
---

# T-010 对齐工作项标题与正文尺度

状态: completed
关联: R-01-012 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家反馈活动卡工作项存在两个视觉/语义偏差：`grep` 在主会话网页显示为 `Grep`，活动卡却显示为 `Search`；活动卡工作项字体和行高小于主会话正文，复用的 SVG 也略大。

## 差距评估

- `TOOL_LABELS.grep` 当前错误映射为 `Search`。
- `.dap-trace-item` 当前为 10px/14px，原生工作项正文约为 14px/24px；SVG 当前按 14px 显示，视觉偏大。

## 收敛方案

- 将 grep 标题改为 `Grep`，其它标题映射保持不变。
- 将工作项行调整到接近主会话正文的 14px/24px 尺度。
- 将 trace SVG 缩小到 12px，并同步图标容器；不改变 timeline 数据、状态和 DOM 复用逻辑。

## 测试计划

- `scripts/check.mjs`：增加 `grep -> Grep` label 行为断言。
- `scripts/acceptance.mjs`：增加主会话正文字号/行高、Grep 标题和 SVG 尺度人工验收项。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：Grep 标题、正文尺度和图标尺寸对齐 | `scripts/check.mjs#R-01-012/AC-03`、`src/core.mjs::timelineToolItem`、`src/client.mjs::renderTrace` |
| 异常 | 适用：未知 tool 与缺失 host DOM 继续使用安全标题/图标 fallback | `scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::nativeWorkItemPresentation` |
| 边界配置 | 适用：其它工具标题映射和小卡宽度不回归 | `scripts/check.mjs#R-01-012/AC-03`、`src/core.mjs::conversationTimeline` |
| 副作用 | 适用：仅调整标题/字号/图标尺度，不改变 timeline 数据与订阅 | `scripts/check.mjs#R-02-003/AC-01`、`src/client.mjs::renderTrace` |
| 兼容性 | 适用：现有 SVG fallback、state、history/order 不变 | `scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::nativeWorkItemPresentation` |

## 终态与证据

- 实现: `src/core.mjs` 将 `grep` 标题改为 `Grep` 并保持 `glob` 的既有 `Search` 语义；`src/client.mjs` 将工作项调整为 14px/24px，原生 SVG 与容器调整为 12px，并同步圆点/竖线几何；`.dsh-plugin/client.js` 已生成。
- 测试: `node scripts/check.mjs` 通过；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过；`git diff --check` 通过；`curl -fsS -I http://127.0.0.1:3080/` 返回 HTTP 200。真实视觉尺度仍需按 `scripts/acceptance.mjs` 人工 GUI 验收，当前环境没有可用 Playwright/Puppeteer。
- DESIGN 对照: 仅调整已承诺工作项的 label 和呈现尺度，不改变 timeline order、state、history fallback、session.subscribe、callId 匹配或历史卡结构。
- commit: f8ae30d
- review:
  - 审核方: Standards 子代理 `01d376fe-209a-46a7-a24e-967d30a6430d`；Spec 子代理 `f4b62def-b8d0-47a7-8783-9be593f20226`。
  - 目的理解: 修正主网页与活动卡的 grep 标题差异，并使工作项字号、行高、SVG 尺度接近会话正文。
  - 执行方式: `code-review` skill；固定基线 `fefe407`，范围为 `git diff fefe407...HEAD` 的 T-010 工作单元；Standards/Spec 双轴复审。
  - 问题与修复: 初审发现误改 `glob` 为 `Glob`，已回退为既有 `Search` 并新增 glob 行为断言；grep、14px/24px、12px SVG 与轨道几何保持目标变更。
  - 复审结论: Standards 通过；Spec 通过；无阻断 Fowler smell。
