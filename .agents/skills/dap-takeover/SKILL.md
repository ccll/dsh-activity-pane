---
name: dap-takeover
description: 别人认领的 PR 超过 72 小时没有推送、需要从原分支接手时读
---

# dap-takeover

本技能管接管的边界：怎样接手别人的 PR、保留什么、不改什么。

- 触发条件：PR 在 72 小时内没有任何新推送；先在该 PR 留言说明将要接管。
- 同一 issue 下编号最小的开放 PR 胜出；接管不新开 PR，继续用原分支。
- 接手前先读原工作：`git log origin/main..HEAD` 与 PR 正文，不默默丢弃既有提交。
- 取分支：`git fetch origin` 后 checkout 原 claim/<issue>-<slug> 分支。
- 保留原作者署名：在 PR 正文追加接管说明（时间、接手人、接管的提交范围）。
- 接着做之前先复跑权威门禁：`node tools/xtask.mjs ci`。
- 原失败要么先修，要么在 PR 里写清保留原因，不装作不存在。
- 接管后仍是 agent 工作：永不合并，收口见 `dap-full-stop`。
- 属主已明确表态时以属主为准；72 小时只是可接管的门槛，不是义务。
- 原 PR 被关时说明原因，不静默替换成新 PR。
