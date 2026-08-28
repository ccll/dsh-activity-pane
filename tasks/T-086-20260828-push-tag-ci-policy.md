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

- 删除 `pull_request`、main push 与 `v*` tag 自动触发；仅保留 `workflow_dispatch` 作为 hosted 诊断入口。
- 不增加自动发布：release 由人在本地 `.githooks/pre-push` 的 `pnpm verify` 通过后创建；待 upstream sessions 恢复可用后另行评估恢复 hosted main/tag CI。
- 推送实现提交后观察首次 hosted run，记录冷安装、浏览器安装、E2E、恢复次数与总耗时；首次 run 在建 job 前失败，根因为 job 级 env 引用了该阶段不可用的 `runner.tool_cache`，改用 `github.workspace/.cache` 并增加回归契约；第二次 run 进入 Verify 后发现 checkout 默认浅克隆使历史 terminal task commit 证据不可达，改为 `fetch-depth: 0`。
- 第三次 hosted run 在 Node 22 + 双 worker 下 8/10 失败、468.179s、16 次恢复；顺序 + 短世代后第四次仍 0/10、753.617s、10 次恢复，而本地 Node 24.16.0 同策略连续门禁可 10/10、0 fresh recovery。由此把 hosted Node 精确锁到 24.16.0，并把 job timeout 提高到 30 分钟；不增加发布脚本或环境重试。

## 测试计划

- 本地解析 workflow YAML，断言无 pull_request、main push 与 `v*` tag，仅含 workflow_dispatch。
- `pnpm verify:fast`、AgentMap lint、`git diff --check` 通过。
- push 前由本地 `.githooks/pre-push` 裁决 `pnpm verify`；不再自动启动已知失败的 hosted run。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：本地 pre-push 执行完整 `pnpm verify`；手工 hosted 诊断进入同一 verify job | `.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh::pnpm verify`、`.github/workflows/ci.yml::verify` |
| 异常 | 适用：本地门禁任一步失败即阻止 push；手工 workflow 失败保留 E2E screenshot artifact | `.githooks/pre-push::pre-push.d`、`.github/workflows/ci.yml::Upload E2E failure screenshots` |
| 边界配置 | 适用：pull request、main push 与任何 tag 均不自动触发 hosted CI | `.github/workflows/ci.yml::on` |
| 副作用 | 适用：不自动运行 Actions、不创建 release、不写仓库内容，permissions 保持 contents read | `.github/workflows/ci.yml::permissions` |
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
