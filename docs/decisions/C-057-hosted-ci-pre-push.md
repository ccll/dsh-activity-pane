---
doc-type: rationale
mutation: append-only
id: C-057
owner: agent
---

# C-057 暂停自动 hosted CI，以本地 pre-push 为权威门禁

日期: 2026-08-28

#### 上下文
GitHub hosted 连续四次未形成有效远端裁决：前两次暴露 workflow 配置缺陷，后两次在 coherent rc.7 的 sessions 首拉上分别 8/10 与 0/10 失败。相同顺序兼容策略在本地完整门禁连续 10/10 且无 fresh recovery；继续让 main push 与 tag 自动运行只会制造约 8～13 分钟的已知失败、占用 Actions 配额，并掩盖真正的产品回归。根缺陷位于 upstream DSH `SessionManager` 的一次性初始拉取与失败后 pending 状态，不应由本插件继续扩大恢复补偿。

#### 决策
- 废弃 C-050 的 main push 与 `v*` tag 自动触发，以及 C-056 将 Node 24 对齐作为下一次自动 hosted 实验的安排。
- `.github/workflows/ci.yml` 仅保留 `workflow_dispatch`，用于显式诊断 upstream 修复或新 runtime；不作为日常提交门禁。
- `.githooks/pre-push` 执行的本地 `pnpm verify` 成为提交与推送的当前权威门禁；Release 以本地完整门禁通过的 commit 为依据，仍不自动创建。
- upstream sessions 首拉恢复可用并经过手工 hosted 诊断后，另立决策评估是否恢复 main/tag 自动 CI。

#### 被否方案及原因
- 保持自动 CI 并接受红灯：持续已知红灯会让真实回归失去信号价值。
- 增加 hosted E2E 重试或 timeout：现有 0/10 与 753.617s 结果证明扩大补偿只增加成本，不能修复一次性 manager pull。
- 删除 workflow：暂停是临时状态；保留手工入口可在 upstream/runtime 更新时用同一环境复验，无需重建配置。

#### 影响面
R-02-002 / 验证门禁、GitHub CI、Release 流程
