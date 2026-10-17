---
doc-type: rationale
mutation: append-only
id: C-060
owner: agent
---

# C-060 恢复 main push hosted CI，保留本地 pre-push 与手工诊断

日期: 2026-08-28

#### 上下文
C-057 暂停自动 hosted CI 的直接原因是多次 hosted run 在 sessions readiness 上形成 8～13 分钟已知红灯；C-058 随后以 manager/list-store 实时探针证明根因不在 upstream 首拉，而是 client 空列表 pending→ready 被渲染签名短路，并已在产品最小层修复。修复后的手工 hosted 诊断已有 T-087 的绿色记录；当前 main `38913d1` 再次通过 GitHub Actions run `33177351704`：clean runner 12/12 E2E、job 2m36s、Verify 2m00s、零 reload/零 recovery。C-057 要求的“先手工 hosted 实测，再另立决策”已满足。

#### 决策
- 恢复 `main` push 自动触发 `.github/workflows/ci.yml`，作为本地 pre-push 通过后的 clean-runner 独立裁决；两者运行同一 `pnpm verify`，前者提供推送后环境独立性，后者继续提供推送前阻断。
- 保留 `workflow_dispatch` 诊断入口；不恢复 `pull_request`，因为项目不采用 PR 门禁。
  - 不恢复 `v*` tag 自动触发，Release 继续以已通过本地与 main hosted 门禁的 commit 由人工创建。
- 保持 Node/pnpm/Playwright 锁定、完整历史 checkout、缓存、30 分钟 timeout、失败截图与只读 contents 权限；不增加 retry、reload 或环境恢复。

#### 被否方案及原因
- 继续 workflow_dispatch-only：在根因修复且两次手工 hosted 绿色后，继续缺少 clean-runner 自动裁决会让 main 只依赖开发机环境，C-057 的临时暂停失去退出条件。
- 同时恢复 pull_request：项目当前不采用 PR 流程，没有对应治理对象，只会重复运行同一提交。
- 同时恢复 tag：tag 通常指向已通过 main hosted 的 commit，重复完整 E2E 增加成本；Release 仍为手工操作，不需要 tag job 承载发布。
- 以 hosted 取代本地 pre-push：网络队列和远端反馈晚于推送，不能替代本地阻断；两层证据职责不同。

#### 影响面
R-02-002 / E2E 验证基建、验证门禁、GitHub CI、Release 流程
