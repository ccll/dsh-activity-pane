---
doc-type: rationale
mutation: append-only
id: C-080
owner: agent
---

# C-080 更正 C-079 影响面：CI runtime pin 的受影响面为「E2E 验证基建」，R-02-003 引用系误写

日期: 2026-09-16

#### 上下文
C-079 的「影响面」写为 `R-02-003 · 验证门禁`，双轴代码审核（T-142）指出两处失真：PRD 的 R-02-003 实为「渲染稳定与资源释放」，与 CI runtime pin 无关；「验证门禁」也不是 DESIGN 子系统规范名——本决策的实际设计落点是「E2E 验证基建」子系统（e2e 启动器与 CI 门禁基建），PRD 全文本就无验证门禁类需求（该领域属 CONVENTIONS 过程层）。DECISIONS 只追加不可修改，更正以新条目承载。

#### 决策
C-079 的「影响面」更正为 `E2E 验证基建`——本决策影响的唯一子系统为「E2E 验证基建」（e2e 启动器与 CI 门禁基建，CONVENTIONS 验证门禁与 .github/workflows/ci.yml 的 runtime pin 落点），不涉及任何 PRD 需求与 DESIGN 追溯索引变更。

#### 被否方案及原因
- 直接修改 C-079 原文：违反 DECISIONS「只追加、写入后不可修改」纪律。
- 把「验证门禁」登记为新 DESIGN 子系统：验证门禁是过程规范（CONVENTIONS 承载），不构成设计层子系统，登记即制造虚假结构。

#### 影响面
E2E 验证基建（更正 C-079 的 R-02-003 误引；无 PRD 需求变化）
