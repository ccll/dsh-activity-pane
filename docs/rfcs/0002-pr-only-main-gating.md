# RFC-0002 main 改为 PR 门禁

状态: Accepted
日期: 2026-11-26
决策者: 项目属主
取代: C-050、C-060 中「不采用 PR 流程、不恢复 `pull_request` 触发」的结论

## 上下文

本仓库此前采用「直推 main + 本地 pre-push 作权威门禁 + main push 后 hosted CI 独立裁决」的形态。C-050 与 C-060 明确否决了 `pull_request` 触发，理由是项目不采用 PR 流程。

该前提在本次迁移中失效，原因有三：

- 仓库是公开的，已经收到站外 PR（`#3`、`#6`）；直推形态下，外部 PR 无法被门禁裁决，只能由属主在本地重跑后手工合并。
- 采纳 claim 协议后，多个 agent 并行改同一仓库成为常态；没有 PR 语义就没有冲突边界与接管窗口。
- 主干无保护，任何本地配置错误都能直接把未验证提交推到 main，而这正是 AgentMap 用单执行会话纪律去堵的风险。

结论：PR 门禁不是新增成本，而是把已有的本地门禁移到能被独立裁决的位置。

## 决策

- `main` 受 ruleset 保护：必需 PR、必需 `verify` status check、必需属主批准、线性历史、禁止 force-push。
- `.github/workflows/ci.yml` 增加 `pull_request: branches: [main]`，与 `workflow_dispatch`、main push 并存。
- 新增 `.github/workflows/pr-checks.yml`：标题与正文格式、认领提交存在、编号最小者胜、分支命名。
- agent 永不合并；属主以 `gh pr merge --squash --match-head-commit` 合并。
- 同一 issue 下编号最小的开放 PR 胜出；72 小时无推送可接管。
- 直推 main 由 `xtask policy --push` 与 ruleset 双重拒绝。

## 被否方案及原因

- 维持直推 main：外部 PR 与多 agent 并行都无法被门禁裁决，等于把裁决留在属主的本机上。
- 同时保留 push 与 pull_request 两套自动触发但只在一处门禁：同一提交会重复跑完整 e2e，成本翻倍且没有人看第二份报告。
- 保留 main push 触发但去掉 PR 触发：合并瞬间才首次裁决，坏提交已经进入 main，属于事后补救。

## 影响面

- `scripts/check.mjs` 的 CI 触发断言从「仅允许 workflow_dispatch 与 main push」改为「允许 workflow_dispatch、main push、main pull_request，不得加入 tag 或其它 push filter」。
- `docs/compatibility.md` 与 `CONTRIBUTING.md` 记录 PR 门禁与合并流程。
- 属主每次合并前需确认 `verify` 绿；`approved-for-ci` 与合并队列在本仓库规模下不引入。
- 取代关系：C-050、C-060 的其余结论（Node/pnpm/Playwright 锁定、完整历史 checkout、失败截图、不引入 retry）继续有效，仅 PR 触发一条被本 RFC 取代。
