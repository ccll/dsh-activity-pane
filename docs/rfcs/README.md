# RFC 索引

一份 RFC 记录一个决定，不承诺时间表。状态取值只有四种：Draft、Accepted、Rejected、Replaced。

| RFC | 标题 | 状态 |
|---|---|---|
| [0001](0001-replace-agentmap-with-solidcraft-workflow.md) | 以 SolidCraft 工作流取代 AgentMap | Accepted |
| [0002](0002-pr-only-main-gating.md) | main 改为 PR 门禁 | Accepted |

## 写法

- 文件名 `NNNN-slug.md`，四位递增，不复用；编号即本层的决定顺序。
- 必须含 `状态:`、`日期:`、`决策者:`，然后是 `## 上下文`、`## 决策`、`## 被否方案及原因`、`## 影响面`。
- 被取代的 RFC 不改写原文：在新 RFC 里写 `取代: NNNN`，并把旧条目状态改为 Replaced。
- 纯过程性决定（钩子命名、脚本实现、提交格式细节）不立 RFC，写在 `CONTRIBUTING.md` 的规则行或提交正文里。

## 与早期决策档案的关系

AgentMap 时代的 103 条决策（原 `RATIONALE/C-nnn`）保留原编号迁入 `docs/decisions/`，作为只追加的历史档案，不并入本目录。本目录只收录新层生效之后的决定。

跨层引用规则：本层 RFC 可以写 `取代: C-nnn` 指明它推翻的早期结论；`docs/decisions/` 里的条目永不回头修改。
