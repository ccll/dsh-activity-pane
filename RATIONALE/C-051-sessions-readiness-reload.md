---
doc-type: rationale
mutation: append-only
id: C-051
owner: agent
---

# C-051 sessions readiness 使用单一完整等待代替短世代 reload

日期: 2026-08-28

#### 上下文
C-047 把已知 sessions 首推停滞的同环境恢复设计为最多五个页面连接世代、每代只等待 6s，再换全新环境。首次 GitHub hosted run 证明正常 spec 也可在 24～30s 才就绪，而 DSH bounded unary RPC 的默认 timeout 本就是 30s；6s reload 会反复中断尚可完成的 `sessions.list`。Hosted 结果为 8/10 spec 失败、468.179s、16 次换环境恢复，本地 pre-push 也曾单轮恢复 3 次，符合自诱导重试风暴而非普通断言回归。

#### 决策
- 废弃 C-047 的“同一服务先有限 reload”部分；每个隔离环境只建立一个页面连接世代，等待 32s（30s unary timeout + 渲染余量）。
- 32s 后仍 loading 或明确列表加载失败才归类为 `ERR_PANE_STALL`；runner 仍只允许一次全新 Chromium + dsh web 环境恢复。
- 暂不修订 C-049 的固定 2 worker：先隔离 readiness 变量并由 hosted run 裁决；若单一完整等待后仍失败，再以新证据调整并发。

#### 被否方案及原因
- 继续 5×6s reload：总预算看似相同，却没有任一 unary 请求获得完成其 30s timeout 的机会，并持续重建 SSE/HTTP 负载。
- 只提高 reload 次数：进一步放大资源风暴，不能修正超时层级错配。
- 立即降为 1 worker：可能掩盖 readiness 根因并显著拉长本地门禁；先做单变量修复。
- 无限等待：会把真实宿主停滞变成 CI hang；32s 与既有 transport timeout 有明确边界。

#### 影响面
R-01-002、R-01-008、R-02-002 / E2E 验证基建、验证门禁
