---
doc-type: rationale
mutation: append-only
id: C-050
owner: agent
---

# C-050 CI 面向 main push 与 release tag，不设置 PR 门禁

日期: 2026-08-28

#### 上下文
项目不接受 pull request，C-046 的 pull request 触发与 required check 没有实际治理对象。需要保证的是：本地推送前执行完整门禁、main 上的远端提交经 clean runner 独立验证，并在 release tag 创建时得到同一套验证结果作为发布参考。仓库尚无 tag 命名历史。

#### 决策
- GitHub Actions 只监听 main push、`v*` tag push，并提供 `workflow_dispatch` 手工重跑；删除 pull request 触发。
- 不配置 PR branch protection required check；本地 `.githooks/pre-push` 负责推送前阻断，GitHub Actions 负责推送后独立裁决。
- release tag 采用 `vMAJOR.MINOR.PATCH`；只从 main CI 已绿的 commit 创建 tag，tag CI 再次通过后才人工创建 GitHub Release。
- 当前不自动创建 Release；待 hosted CI 实测稳定且人工发布流程出现真实重复成本后再评估。

#### 被否方案及原因
- 保留 pull request 触发：项目不接收 PR，只产生无用配置与误导性的治理说明。
- tag CI 自动创建 Release：验证失败时 tag 已存在，自动发布会把裁决和发布耦合；当前发布频率尚无证据支持增加脚本与写权限。
- 只跑 tag CI：main 上的普通推送失去远端 clean-runner 反馈，问题会延迟到发布时才暴露。

#### 影响面
R-02-002 / E2E 验证基建、验证门禁、发布流程
