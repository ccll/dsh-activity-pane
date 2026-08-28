---
doc-type: task
id: T-091
mutation: lifecycle
---

# T-091 恢复 main push hosted CI 独立裁决

风险等级: standard
状态: active

## 背景与目标

- 背景: C-057 因错误归因的 hosted sessions 停滞暂停全部自动触发；C-058 已在 client 渲染签名最小层修复真实根因。当前 main `38913d1` 的手工 GitHub Actions run `33177351704` 在 clean runner 上 12/12 通过，job 2m36s、Verify 2m00s、零 recovery。
- 目标: 恢复 `main` push 自动 hosted CI，作为本地 pre-push 之后的 clean-runner 独立裁决；保留 `workflow_dispatch` 诊断入口。
- 非目标: 不恢复 `pull_request`（项目不采用 PR 门禁）；不恢复 tag 自动触发或自动 Release；不改变本地 pre-push 权威阻断、不增加 E2E retry。

## 差距评估

- `.github/workflows/ci.yml` 当前仅 `workflow_dispatch`，其 runtime/cache/full-history/失败截图配置已经可用，无需重建 job。
- `scripts/check.mjs`、`CONVENTIONS.md`、`DESIGN.md` 明确断言/描述 main push 不自动触发，需要同次更新。
- 手工 hosted 基线已满足 C-057 的恢复前置条件，且当前 run 成本约 2.6 分钟，不再是已知 8～13 分钟红灯。

## 收敛方案

1. 追加 C-060：恢复 main push，保留 workflow_dispatch，继续排除 PR/tag。
2. workflow 只增加 `push.branches: [main]`，job、缓存、Node/pnpm/Playwright、timeout 与截图保持不变。
3. 更新 check contract、CONVENTIONS 与 DESIGN；本地 pre-push 仍为推送前权威门禁，hosted 是推送后 clean-runner 独立裁决。
4. 本次提交推送后观察自动 run 实际结果，不以 workflow YAML 静态解析代替 hosted 证据。

实现进度: 已增加 main push trigger，并同步 workflow contract、CONVENTIONS 与 DESIGN；正在执行本地门禁、独立审核和推送后自动 hosted 实测。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 验证门禁恢复 main push hosted 独立裁决 | UNIT/E2E | update | 更新 workflow contract、门禁归属及实际 hosted run 证据 |

## 测试计划

- `pnpm check`：要求 workflow_dispatch + main push，禁止 pull_request 与 tag trigger，锁定现有 runtime/timeout/history 配置。
- `pnpm verify` 与 staged/pre-push 门禁通过。
- 推送实现 commit 后，GitHub Actions 自动 run 成功且 12/12 E2E；记录 run URL、墙钟和 SHA。
- 固定基线独立 `code-review` 双轴审核并复审 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：main push 自动创建 clean-runner verify run | `.github/workflows/ci.yml::workflow_dispatch`、`package.json::verify` |
| 异常 | 适用：PR/tag 不得误触发，失败截图仍上传 | `scripts/check.mjs::ciWorkflowSource`、`.github/workflows/ci.yml::Upload E2E failure screenshots` |
| 边界配置 | 适用：仅 main branch，手工入口保留 | `.github/workflows/ci.yml::workflow_dispatch` |
| 副作用 | 适用：本地 pre-push、零 retry、手工 Release 保持 | `CONVENTIONS.md::权威验证入口`、`e2e/run.mjs::MAX_CONCURRENCY` |
| 性能 | 适用：当前 hosted 基线 job 2m36s，timeout 仍为 30m | `.github/workflows/ci.yml::timeout-minutes` |
| 安全 | 适用：只读 contents 权限，不增加 secrets 或写权限 | `.github/workflows/ci.yml::permissions` |
| 可观测性 | 适用：run URL、结论、head SHA、step 时长可查询 | `.github/workflows/ci.yml::name` |

## 终态与证据

待实现完成后填写。
