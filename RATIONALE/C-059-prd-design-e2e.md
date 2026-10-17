---
doc-type: rationale
mutation: append-only
id: C-059
owner: agent
---

# C-059 PRD/DESIGN 变化触发测试影响复审，而非自动生成 E2E

日期: 2026-08-28

#### 上下文
现有 strict 测试锚定只比较 PRD AC-ID 与登记测试文件中的文本锚点集合：新增或删除 AC 能暴露缺失/残留锚点，但 AC 正文在 ID 不变时可以不改测试而继续通过；自动 Node 检查、浏览器 E2E 与人工验收也被同一计数合并。直接从 EARS 文本生成 selector、fixture、timeout 或断言无法可靠判断验证层与可观察边界，删除 AC 时也不能安全判断共享测试代码是否仍有价值。

#### 决策
- 保留 canonical AgentMap 锚点闭合规则，另加项目级 staged diff 测试影响门禁：AC 新增或正文修改必须同次触碰相应自动测试或人工验收证据，或在 active task 中结构化说明无需改测试的理由；AC 删除继续禁止残留锚点。
- DESIGN 变化必须由 active task 的「测试影响」记录说明受影响需求、验证层、动作与证据；检查器只验证记录和文件联动，不猜测自然语言语义是否等价。
- 自动、E2E 与人工证据按登记路径分别报告；不以 E2E 百分比作为目标，继续按跨进程、跨客户端、状态生命周期、宿主 DOM 与恢复等风险接缝选择 E2E。
- 门禁只发现遗漏和验证执行性，不自动创建、改写或删除测试代码；测试充分性继续由 task 验证矩阵与独立 review 裁决。
- pre-commit 对生成 client bundle 增加 staged source→staged artifact 一致性检查，避免工作树重建结果替代实际提交对象。

#### 被否方案及原因
- 根据 AC 自动生成或更新 Playwright 测试：无法可靠派生稳定 fixture、公共 selector 与等待条件，容易制造与实现同构的脆弱测试。
- 为每个 AC 强制浏览器 E2E：重复纯函数单测并放大套件成本与时序噪声，违背 C-046 的风险接缝优先策略。
- 为 AC 正文记录 hash 并只校验 hash：只能迫使机械更新 checksum，不能证明断言被重新审视。
- 修改 canonical `agentmap_lint.py` 承载项目特例：会破坏 AgentMap runtime contract，并把项目验证层选择泄漏到全局协议。

#### 影响面
R-01-005、R-01-008、R-01-009、R-01-014、R-01-018 / E2E 验证基建、验证门禁
