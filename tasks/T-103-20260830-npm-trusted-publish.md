---
doc-type: task
mutation: lifecycle
id: T-103
---

# T-103 GitHub Release 触发 npm Trusted Publishing

状态: active
关联: C-067 / GitHub CI、Release 流程
风险等级: high

## 背景与目标

- 背景: npm 包启用发布 2FA 后，CI 无法通过交互式 OTP 完成非交互发布；仓库当前只有 main 分支验证，没有 npm 发布 workflow。
- 目标: GitHub Release 发布后，由 GitHub Actions 使用 npm Trusted Publishing 的 OIDC 身份发布同一 tag 对应的 npm 包，不保存长期 `NPM_TOKEN`。
- 非目标: 不自动创建 GitHub Release；不改变插件运行时；不在 CI 中传递或模拟一次性 2FA 验证码；不重复实现完整 E2E 环境。

## 差距评估

- `.github/workflows/ci.yml` 只验证 main push 与手工诊断，没有 npm 发布 job。
- npm registry 已存在 `dsh-activity-pane@0.1.0`；发布 `0.2.0` 前必须让 release tag 与 `package.json` 版本一致。
- GitHub `v0.2.0` 当前指向的 `2f56884` 仍包含 `package.json` `0.1.0`，当前工作区的 `0.2.0` 尚未形成对应 tag 提交。
- npm Trusted Publisher 需要在 npm 包设置中登记 GitHub 用户、仓库与 workflow filename；该设置由东家完成。

## 收敛方案

1. 新增 `.github/workflows/npm-publish.yml`，监听 `release.published`，同时提供带 tag 输入的 `workflow_dispatch` 作为一次性补发/诊断入口；两种入口都必须对应已 published 的 GitHub Release。
2. workflow 通过 GitHub API 确认目标 Release 已发布后 checkout 精确 tag，拒绝非 `vMAJOR.MINOR.PATCH` tag，并拒绝 `package.json` 版本与 tag 不一致的发布。
3. 安装 pnpm 依赖并执行 `pnpm verify:fast`；若验证改写受 Git 跟踪的发布树则失败。
4. 赋予 `contents: read` 与 `id-token: write`，使用官方 npm registry 的 `npm publish --provenance`，不配置 `NPM_TOKEN`。
5. 保持完整 E2E 由 main CI 作为 Release 前置门禁；GitHub Release 继续人工创建，npm 发布改为发布事件后的机械步骤。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| Release 流程 | 适用：新增 OIDC npm 发布路径 | CI/config | add | workflow 只在已 published release 或显式手工 dispatch 运行，并在 publish 前校验 Release、tag/package 版本 |
| 验证门禁 | 适用：保留发布前快速检查 | UNIT/config | regression | `pnpm verify:fast` 与工作树洁净检查阻止 tag 树被检查过程改写 |
| 安全 | 适用：取消长期发布 token | CI/security | add | workflow 仅申请 `id-token: write`，不读取 `NPM_TOKEN` |
| 副作用 | 适用：防止重复或错误版本发布 | CI/config | add | 按 tag 建立 concurrency，npm registry 自身拒绝已存在的 immutable 版本 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：`release.published` 触发、tag/package 版本一致、OIDC 配置正确时发布 npm 包 | `.github/workflows/npm-publish.yml#release:`、`.github/workflows/npm-publish.yml#npm publish --provenance`、`package.json::"name":`；发布后运行 npm view dsh-activity-pane@<version> version |
| 异常 | 适用：非 semver tag、未 published 的 Release、版本不一致、Trusted Publisher 未配置时必须在发布前或发布步骤失败 | `.github/workflows/npm-publish.yml#unsupported release tag`、`.github/workflows/npm-publish.yml#release $RELEASE_TAG is not published`、`.github/workflows/npm-publish.yml#does not match release tag`、`package.json::"version":`；GitHub Actions failed run |
| 边界配置 | 适用：`workflow_dispatch` 只能对已 published 的已有 tag 补发；官方 registry、Node 24.16.0、npm >= 11.5.1 | `.github/workflows/npm-publish.yml#workflow_dispatch:`、`.github/workflows/npm-publish.yml#registry-url: https://registry.npmjs.org`、`package.json::"packageManager":`；workflow input 与 npm Trusted Publisher 设置 |
| 副作用 | 适用：不创建 GitHub Release，不使用长期 npm token，不让快速验证修改 release tree | `.github/workflows/npm-publish.yml#permissions:`、`.github/workflows/npm-publish.yml#id-token: write`、`CONVENTIONS.md::npm 发布:`；执行后检查 git diff --exit-code |
| 恢复 | 适用：npm 发布失败时可重跑同一 workflow，不移动已发布 tag | `.github/workflows/npm-publish.yml#cancel-in-progress: false`、`.github/workflows/npm-publish.yml#fetch-depth: 0`、`CONVENTIONS.md::npm 发布:`；GitHub Actions re-run |

## 测试计划

- 使用 Ruby/Python YAML parser 或 GitHub Actions parser 检查 workflow 语法。
- 在本地运行 `pnpm verify:fast`，确认现有代码与生成 bundle 仍通过。
- 完成 npm Trusted Publisher 设置后，以一个版本匹配的 release 或 `workflow_dispatch` run 验证 OIDC 发布。
- 发布验证后运行 `npm view`，并确认 GitHub Actions 日志没有读取长期 npm token。

## 终态与证据

状态: active

- 实现: `.github/workflows/npm-publish.yml` 已创建，待 npm Trusted Publisher 设置与版本/tag 对齐后验证。
- 测试: 待执行。
- DESIGN 对照: 不改变产品设计；仅新增 Release 发布自动化边界。
- commit: 待提交。
- review: 待独立审核。
