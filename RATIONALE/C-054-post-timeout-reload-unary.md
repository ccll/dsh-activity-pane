---
doc-type: rationale
mutation: append-only
id: C-054
owner: agent
---

# C-054 post-timeout reload 同样使用完整 unary 窗口

日期: 2026-08-28

#### 上下文
C-052 给第二个 SessionManager 12s 的假设不成立：顺序执行本地完整套件一次 10/10、183.589s、0 恢复，但随后两轮分别出现 2/10 失败（297.907s、4 恢复）与 1/10 失败（463.537s、4 恢复）。多个成功 spec 总耗时约 40～54s，说明第二代也可能需要超过 12s；12s 再次犯了低于 DSH 30s unary timeout 的层级错配。

#### 决策
- 首代与唯一一次 post-timeout reload 均等待 32s；不再给第二代设置不同的短窗口。
- GitHub Verify job timeout 从 20 分钟提高到 30 分钟，只覆盖顺序执行与最坏有界恢复预算，不增加重试次数。
- 继续由 suite 日志记录恢复次数；若完整 32s × 2 后仍失败，按 C-052 进入最多一次 fresh environment recovery。

#### 被否方案及原因
- 保留第二代 12s：实测仍误杀慢但可能完成的 unary 请求。
- 第二代无限等待：上游无自愈时会挂死门禁。
- 恢复为并行执行抵消墙钟：C-053 已证明并发是失败放大器，不能用不稳定换速度。

#### 影响面
R-01-002、R-01-008、R-02-002 / E2E 验证基建、验证门禁
