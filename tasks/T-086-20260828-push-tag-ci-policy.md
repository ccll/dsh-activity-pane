---
doc-type: task
mutation: lifecycle
id: T-086
---

# T-086 main push 与 release tag CI 策略

状态: active
关联: C-050 → E2E 验证基建
风险等级: standard

## 背景与目标

项目不接受 pull request，现有 `pull_request` CI 触发和 required PR check 没有实际治理对象。门禁目标调整为：本地 pre-push 在推送前执行完整验证，GitHub Actions 在 main push 后独立重放，并在创建 release tag 时再次提供可审计结果。

## 差距评估

- `.github/workflows/ci.yml` 仍监听 pull request，未监听 release tag，也没有手工重跑入口。
- CONVENTIONS/DESIGN 仍把 PR 作为 CI 适用场景，并建议 branch protection required check。
- 仓库当前无既有 tag 命名约定；本 task 从 `vMAJOR.MINOR.PATCH` 起建立最小约定。

## 收敛方案

- 删除 `pull_request` 触发；保留 main push，新增 `v*` tag push 与 `workflow_dispatch`。
- 不增加自动发布：tag CI 只重放 `pnpm verify`，release 仍由人在 main commit CI 与 tag CI 均通过后创建。
- 推送实现提交后观察首次 hosted run，记录冷安装、浏览器安装、E2E、恢复次数与总耗时；首次 run 在建 job 前失败，根因为 job 级 env 引用了该阶段不可用的 `runner.tool_cache`，改用 `github.workspace/.cache` 并增加回归契约；第二次 run 进入 Verify 后发现 checkout 默认浅克隆使历史 terminal task commit 证据不可达，改为 `fetch-depth: 0`。
- 仅在 hosted 数据证明必要时优化缓存或 timeout；本 task 不预设额外发布脚本。

## 测试计划

- 本地解析 workflow YAML，断言无 pull_request、含 main、`v*` 与 workflow_dispatch。
- `pnpm verify:fast`、AgentMap lint、`git diff --check` 通过。
- push 后用 GitHub Actions hosted run 裁决 `pnpm verify`，记录步骤耗时和日志中的 sessions 恢复次数。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：main push、`v*` tag 与手工触发均进入同一 verify job | `.github/workflows/ci.yml::verify` |
| 异常 | 适用：任一步骤失败即 workflow 失败并保留 E2E screenshot artifact | `.github/workflows/ci.yml::Upload E2E failure screenshots` |
| 边界配置 | 适用：pull request 不再触发；非 `v*` tag 不触发 | `.github/workflows/ci.yml::push` |
| 副作用 | 适用：不创建 release、不写仓库内容，permissions 保持 contents read | `.github/workflows/ci.yml::permissions` |
| 性能 | 适用：首次 hosted run 记录冷缓存步骤耗时，后续优化需有实测 | `.github/workflows/ci.yml::Cache coherent DSH runtime` |
| 兼容性 | 适用：沿用 T-085 锁定的 Node、pnpm、coherent DSH rc.7 与 Chromium | `.github/workflows/ci.yml::Install coherent DSH runtime` |
| 可观测性 | 适用：GitHub run 与 tag commit 关联，失败 artifact 保留 7 天 | `.github/workflows/ci.yml::retention-days` |

## 终态与证据

- 实现: 待填写
- 测试: 待填写
- DESIGN 对照: 待填写
- commit: 待填写
- review:
  - 审核方: 待填写
  - 目的理解: 待填写
  - 执行方式: 待填写
  - 问题与修复: 待填写
  - 复审结论: 待填写
