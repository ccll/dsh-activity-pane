---
doc-type: task
mutation: lifecycle
id: T-153
---

# T-153 AgentMap map 文件迁移：DESIGN.md→SOLUTION.md、DECISIONS.md→RATIONALE.md

状态: active
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

## 测试计划

- `python3 tools/agentmap_lint.py --self-test` 与 `python3 tools/agentmap_lint.py --report`。
- `.githooks/pre-commit`；`.githooks/pre-push` 重门禁对 outgoing commits 重放。
- 本次变更不触及 `src/`、`e2e/` 与任何运行时行为，无 AC 增删改。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| PRD | 需求条目字段「关联设计」改名「关联方案」，纯术语对齐，无 AC 增删改 | UNIT | update | `python3 tools/agentmap_lint.py --report`：28 需求「关联方案」与 SOLUTION 追溯索引一一对应且整体通过 |
| DESIGN | map 文件改名 `DESIGN.md`→`SOLUTION.md`、`DECISIONS.md`→`RATIONALE.md`，活文档引用对齐；终态 task 旧名引用按 C-081 保留 | UNIT | update | `python3 tools/agentmap_lint.py --self-test` 通过、`--report` solution-covered=28 全覆盖 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：map 命名与活文档引用全部对齐 canonical，lint 自检与全量报告通过 | `tools/agentmap_lint.py::agentmap lint self-test passed` |
| 异常 | 适用：append-only 与断链防护由 lint 机械执行，旧名引用仅存于终态 task 与决策历史（经 C-081 机械可映射） | `tools/agentmap_lint.py::append-only content was modified or removed` |
| 边界配置 | 适用：决策条目正文逐字不变，仅文件头与 frontmatter 更名，append-only 前缀校验保持通过 | `tools/agentmap_lint.py::def decision_entries` |
| 副作用 | 适用：不触及 src/、e2e/ 与运行时行为，AC 与测试锚点集合不变 | `tools/test_impact_lint.py::Test impact report: acceptance-criteria=` |

## 终态与证据

（关闭时填写）
