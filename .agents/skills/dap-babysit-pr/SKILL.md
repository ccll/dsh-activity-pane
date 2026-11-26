---
name: dap-babysit-pr
description: PR 已推送、要盯 CI 与评审意见、或需要 rebase 时读：推送之后的循环
---

# dap-babysit-pr

本技能管推送之后到合并之前的循环：看门禁、回评审、同步主干。

- 先看门禁：`gh pr checks --watch`；红就先读日志，不要先重跑碰运气。
- 本地复跑同一条权威门禁：`node tools/xtask.mjs ci`，比 CI 早一步暴露问题。
- CI 定义在 `.github/workflows/ci.yml`；PR 上的运行由 `approved-for-ci` 标签放行。
- e2e 失败先看 e2e 目录的 fail-*.png：整页白屏按环境资源耗尽处理，断言失败才改判据，见 `dap-e2e`。
- 评审意见逐条回复并解决；未解决的评审线程是合并门禁，不是建议。
- 推送成败以 git 自身退出码为准；用管道会掩码退出码，SIGPIPE（141）即传输中断。
- 改完追加新提交并推送；不 force-push，保留评审线程与 CI 历史。
- 确需改写历史时先确认分支上没有别人的提交，并在 PR 正文说明。
- 与主干同步：`git fetch origin` 后 `git rebase origin/main`，再跑一次权威门禁。
- 不要自己加或绕开门禁标签；标签由属主给。
- 全绿前保持 draft（此时 CI 只有快检，约 1 分钟）；`gh pr ready` 会触发全量 e2e（约 7.5 分钟），等它绿再请属主合并。
- 72 小时无动静的上游 PR 走 `dap-takeover`；收口标准见 `dap-full-stop`。
