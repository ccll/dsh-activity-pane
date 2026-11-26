---
doc-type: rationale
mutation: append-only
id: C-086
owner: agent
---

# C-086 长门禁推送以 SSH 应用层保活承载，成败以 git 退出码为准

日期: 2026-10-09

#### 上下文
T-159 关闭后推送 main 时，pre-push 全量 verify 约 440 秒，期间 github.com SSH 连接空闲被远端关闭，pack 传输以 SIGPIPE（git 退出码 141）失败；同一会话连续三次推送，前两次失败且 tail 管道掩盖 git 退出码造成误判绿。机器 `~/.ssh/config` 的 `Host *` 显式设 `ServerAliveInterval 0`（禁用保活），GitHub 连接在门禁期间全程裸等；东家确认同类失败在历史推送中多次出现，要求落地修复机制。

#### 决策
以 `~/.ssh/config` 在 `Host *` 之前新增 `Host github.com` 块（`ServerAliveInterval 30`、`ServerAliveCountMax 10`），GitHub 连接全程保活；推送成败以 git 自身退出码或 ls-remote 复核判定，不经管道掩码。CONVENTIONS 登记推送流程约定。

#### 被否方案及原因
- 以 --no-verify 绕过 pre-push 门禁：门禁是权威验证入口（C-060），绕过破坏验证纪律。
- 缩短门禁代替保活：完整浏览器 E2E 的裁决力不可让，门禁时长是产品需要而非缺陷。
- 以本仓库 core.sshCommand 承载保活：只覆盖单一 clone，其它 clone 与机器仍复发；机器级 ssh 配置一次覆盖全部 GitHub 连接。
- 只写操作提示不落配置：下次推送同样空闲超时，复发。

#### 影响面
CONVENTIONS（推送流程约定）；无 R 变更
