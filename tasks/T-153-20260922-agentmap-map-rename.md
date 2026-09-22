---
doc-type: task
mutation: lifecycle
id: T-153
---

# T-153 AgentMap map 文件迁移：DESIGN.md→SOLUTION.md、DECISIONS.md→RATIONALE.md

状态: completed
关联: C-081 → 文档坐标系（过程层维护；PRD 需求不变）
风险等级: standard

## 背景与目标

- 背景: AgentMap canonical 框架升级将设计层与决策层 map 文件更名为 `SOLUTION.md` / `RATIONALE.md`；bootstrap 在本仓库检测到旧式命名并停止（不写入任何文件）。东家确认（2026-09-22）后以 `--migrate-legacy-maps` 重跑完成迁移，决策依据见 C-081。
- 目标: map 文件命名、活文档引用与术语对齐 canonical，agentmap lint 与提交/推送门禁全绿。

## 差距评估

- 迁移前：两个 map 文件为旧名；PRD 需求条目字段为「关联设计」；`AGENTS.md`、`CONVENTIONS.md`、`tools/agentmap_lint.py`、`tools/agentmap_validate_commit_msg.py` 为旧版 canonical。
- 终态 task 与历史决策正文中的旧文件名引用按 C-081 作为审计历史保留，不改写。

## 收敛方案

1. bootstrap 迁移：`DESIGN.md`→`SOLUTION.md`、`DECISIONS.md`→`RATIONALE.md`；PRD 需求条目字段「关联设计」→「关联方案」；更新 canonical `AGENTS.md`、`CONVENTIONS.md`（新增 task 引用 commit-msg 规则）与两个 tools 脚本。
2. `TODO.md` 维护想法条目中的旧名引用对齐为 `SOLUTION.md`。
3. RATIONALE 末尾追加 C-081 记录迁移决策；既有决策条目正文保持逐字不变（append-only 前缀校验依据）。
4. 修复迁移引出的门禁缺陷（双轴审核发现）：`tools/test_impact_lint.py` 硬编码 `DESIGN.md` 导致改名后方案层变化静默绕过 C-059 测试影响门禁——门禁条件改为 SOLUTION.md 或旧名 DESIGN.md 均触发，行键接受 `SOLUTION` 或 `DESIGN`，并补 SOLUTION.md 路径自测。
5. 活文档残留旧术语对齐：`SOLUTION.md` 实现就绪检查行改用「重大方案选择已收敛」并指向 RATIONALE.md；SOLUTION 测试影响门禁句、CONVENTIONS 三处 PRD/DESIGN 表述同步对齐（AGENTS.md 全局同步纪律）。

## 测试计划

- `python3 tools/agentmap_lint.py --self-test` 与 `python3 tools/agentmap_lint.py --report`。
- `python3 tools/test_impact_lint.py --self-test && python3 tools/test_impact_lint.py --report`（含新增 SOLUTION.md 门禁路径自测）。
- `.githooks/pre-commit`；`.githooks/pre-push` 重门禁对 outgoing commits 重放。
- 本次变更不触及 `src/`、`e2e/` 与任何运行时行为，无 AC 增删改。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| PRD | 需求条目字段「关联设计」改名「关联方案」，纯术语对齐，无 AC 增删改 | UNIT | update | `python3 tools/agentmap_lint.py --report`：28 需求「关联方案」与 SOLUTION 追溯索引一一对应且整体通过 |
| DESIGN | map 文件改名 `DESIGN.md`→`SOLUTION.md`、`DECISIONS.md`→`RATIONALE.md`，活文档引用对齐；终态 task 旧名引用按 C-081 保留 | UNIT | update | `python3 tools/agentmap_lint.py --self-test` 通过、`--report` solution-covered=28 全覆盖 |
| DESIGN | test_impact_lint 门禁修复：SOLUTION.md 变化重新触发测试影响检查，legacy DESIGN.md 兼容保留，self-test 增 SOLUTION 路径用例 | UNIT | update | `python3 tools/test_impact_lint.py --self-test` 通过（含新增 SOLUTION.md 触发与豁免断言） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：map 命名与活文档引用全部对齐 canonical，lint 自检与全量报告通过 | `tools/agentmap_lint.py::agentmap lint self-test passed` |
| 异常 | 适用：append-only 与断链防护由 lint 机械执行，旧名引用仅存于终态 task 与决策历史（经 C-081 机械可映射） | `tools/agentmap_lint.py::append-only content was modified or removed` |
| 边界配置 | 适用：决策条目正文逐字不变，仅文件头与 frontmatter 更名，append-only 前缀校验保持通过 | `tools/agentmap_lint.py::def decision_entries` |
| 副作用 | 适用：不触及 src/、e2e/ 与运行时行为，AC 与测试锚点集合不变 | `tools/test_impact_lint.py::Test impact report: acceptance-criteria=` |

## 终态与证据

- 实现: `DESIGN.md`→`SOLUTION.md`、`DECISIONS.md`→`RATIONALE.md` 改名（Git 识别为 99% 相似 rename）；PRD 28 条需求字段「关联设计」→「关联方案」；`AGENTS.md`、`CONVENTIONS.md`、`tools/agentmap_lint.py`、`tools/agentmap_validate_commit_msg.py` 升级到 canonical（CONVENTIONS 新增 task 引用 commit-msg 规则）；`TODO.md` 维护想法条目旧名引用对齐；RATIONALE 末尾追加 C-081（既有决策条目正文逐字不变，append-only 前缀校验保持通过）。双轴审核修复（11ab208）：`tools/test_impact_lint.py` 门禁条件改为 SOLUTION.md 或旧名 DESIGN.md 均触发、行键接受 `SOLUTION` 或 `DESIGN`，self-test 新增 SOLUTION.md 触发与豁免断言；SOLUTION.md 实现就绪行改用 canonical 条件名「重大方案选择已收敛」并指向 RATIONALE.md；SOLUTION.md:394 与 CONVENTIONS.md:34/44/48 共 5 处旧术语对齐。
- 测试: `python3 tools/agentmap_lint.py --self-test`、`--report`（requirements=28、solution-covered=28、test-anchored=173/173）通过；`python3 tools/test_impact_lint.py --self-test`（含新增 SOLUTION.md 门禁路径）与 `--report` 通过；`.githooks/pre-commit` 通过；`.githooks/pre-push` 对迁移提交 2f26e04 重放完整 `pnpm verify`（agentmap lint、test impact、`scripts/check.mjs` 全部断言、19 个浏览器 E2E spec）全部通过。
- SOLUTION 对照: 实现就绪检查行、测试影响门禁描述与 CONVENTIONS 验证门禁条目已与 SOLUTION.md/RATIONALE.md 命名一致；map 与现实无差异；终态 task 与历史决策正文中的旧文件名引用按 C-081 作为审计历史保留（经 C-081 机械可映射，属已记录偏差）。
- commit: 2f26e04aeac14a08fd0909bf16a8abbbf3041d7a
- review:
  - 审核方: code-review skill（Standards reviewer `52e854ee-2bb6-4a0a-bbaf-b30c86ddfe06`、Spec reviewer `259d958a-17a6-4a47-8959-dbb3cea74dcb`，双轴并行独立）
  - 目的理解: 在东家确认下执行 AgentMap canonical 框架要求的 map 文件迁移（DESIGN.md→SOLUTION.md、DECISIONS.md→RATIONALE.md），使 map 命名、活文档引用与术语对齐 canonical，且 agentmap lint 与提交/推送门禁全绿；约束为 append-only 决策条目正文逐字不变、终态 task 旧名引用按审计历史保留、不触及 src/ 与 e2e/ 运行时行为。
  - 执行方式: code-review skill 双轴评审；Standards 轴对照 AGENTS.md/CONVENTIONS.md + Fowler 气味基线，Spec 轴对照 tasks/T-153-20260922-agentmap-map-rename.md 与 RATIONALE C-081；评审基线 `git diff 2f26e04^...2f26e04`，复审范围 `git diff 2f26e04..11ab208`，两轴独立并行后聚合。
  - 问题与修复: ① SOLUTION.md 实现就绪检查行残留「重大设计选择已收敛/DECISIONS.md」→ 改 canonical 条件名并指向 RATIONALE.md；② SOLUTION.md 测试影响门禁描述与 CONVENTIONS.md 三处残留「PRD/DESIGN」旧术语 → 同次对齐 SOLUTION 措辞；③ `tools/test_impact_lint.py:195` 硬编码 DESIGN.md 致改名后方案层变化静默绕过 C-059 门禁 → 触发条件纳入 SOLUTION.md（保留 legacy DESIGN.md 兼容）、行键接受 `SOLUTION` 或 `DESIGN`，self-test 补 SOLUTION.md 触发+豁免双断言；④ C-081「机械映射」表述强于实际设施（lint 容忍 + 兼容触发，无独立映射设施）→ append-only 不可改写，复审接受为已记录偏差。①②③均经同一审核方复审确认消失。
  - 复审结论: 通过。残余风险与测试缺口：`tools/test_impact_lint.py` 门禁报错文案仍写「without a DESIGN row」未提 SOLUTION 行（纯文案，不阻塞，留待后续维护）；`tools/agentmap_lint.py` 内部 Duplicated Code/Repeated Switches 气味判断项未处置——该文件属 AgentMap 框架属主约定范围（CANONICAL_FILES_SHA256 不含它，但 canonical 契约要求与运行实例一致），留待经东家向上游推进；C-081 影响面未附 T-153（非强制）。
