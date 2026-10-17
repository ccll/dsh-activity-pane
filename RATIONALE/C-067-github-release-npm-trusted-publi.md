---
doc-type: rationale
mutation: append-only
id: C-067
owner: agent
---

# C-067 GitHub Release 发布后使用 npm Trusted Publishing 自动发布

日期: 2026-08-30

#### 上下文
npm 包的发布设置要求 2FA；CI 无法可靠交互输入一次性验证码，当前本地 npm token 也曾因认证失效返回 401。项目已经以人工方式创建 GitHub Release，并希望在人工确认 Release 后自动完成 npm 发布，同时避免保存可长期使用的发布 token。

#### 决策
- GitHub Release 继续由人工在 main hosted CI 通过后创建。
  - 新增独立 `.github/workflows/npm-publish.yml`，监听 `release.published`，并提供带 tag 输入的 `workflow_dispatch` 作为失败补发入口。
  - 两种入口都必须对应已 published 的 GitHub Release。
- workflow 先通过 GitHub API 确认 Release 已发布，再 checkout 对应的精确 tag，校验 `vMAJOR.MINOR.PATCH` 格式和 `package.json` 版本一致，执行 `pnpm verify:fast` 并确认检查未改写发布树。
- workflow 只授予 `contents: read` 与 `id-token: write`，通过 npm Trusted Publishing 的 OIDC 身份运行 `npm publish --provenance`，不读取 `NPM_TOKEN`。
- 完整 E2E 仍由 main CI 作为 Release 前置门禁；npm 发布 workflow 不复制完整 DSH/Chromium 测试环境。

#### 被否方案及原因
- 在 CI 中传递或模拟 OTP：验证码有短时效且需要人工在场，无法形成可靠的非交互发布凭据。
- 使用长期 `NPM_TOKEN`：可以绕过 2FA，但泄漏后可持续发布，安全性低于 OIDC；仅作为 Trusted Publishing 不可用时的临时后备。
- 仅监听 `v*` tag push：直接推 tag 即可能触发发布，绕过人工 GitHub Release 确认；`release.published` 更符合现行流程。
- 在发布 workflow 中重复完整 E2E：main CI 已提供 clean runner 的完整门禁，重复冷启动成本高；workflow 保留快速检查与精确 tag 防护。

#### 影响面
R-02-002 · E2E 验证基建
