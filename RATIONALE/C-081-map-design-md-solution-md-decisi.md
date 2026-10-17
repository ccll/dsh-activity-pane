---
doc-type: rationale
mutation: append-only
id: C-081
owner: agent
---

# C-081 map 文件迁移：DESIGN.md→SOLUTION.md、DECISIONS.md→RATIONALE.md

日期: 2026-09-22

#### 上下文
AgentMap canonical 框架升级将方案层与决策层 map 文件更名为 `SOLUTION.md` / `RATIONALE.md`；本仓库原以 `DESIGN.md` / `DECISIONS.md` 命名，bootstrap 检测到 legacy 命名即停止、不写入任何文件。
#### 决策
经东家确认（2026-09-22）以 `--migrate-legacy-maps` 执行迁移：两个 map 文件改名，PRD/AGENTS/CONVENTIONS 与 tools 中的引用及术语同步对齐；终态 task 与历史决策正文中的旧文件名引用作为审计历史保留，经本条决策可机械映射到新名。
#### 被否方案及原因
- 保持旧命名：与 canonical 框架脱钩，bootstrap 无法继续升级，lint 无法跟进后续框架校验规则。
- 全量改写终态 task 中的旧名引用：违反 terminal task 不可修改纪律，且无信息增量。
#### 影响面
文档坐标系（CONVENTIONS 过程层；PRD 需求无变化）
