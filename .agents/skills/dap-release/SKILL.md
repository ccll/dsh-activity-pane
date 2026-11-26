---
name: dap-release
description: 准备发版、改版本号或 tag、排查 npm 发布作业时读
---

# dap-release

本技能管版本、tag 与 npm 发布的机械步骤。发版与打 tag 是属主动作，agent 只做检查与准备。

- 版本唯一源是 `package.json` 的 `version`；tag 必须是 v<version>。
- 发版前先跑 `node tools/xtask.mjs release`（校验版本、tag、发布物完整性）。
- 门禁先全绿：`node tools/xtask.mjs ci`。
- `files[]` 必须覆盖实际发布物：`.dsh-plugin`、`src`、`scripts`、`cordis.patch.yml`、`README.md`、`LICENSE`。
- GitHub Release 由属主手工创建；`.github/workflows/npm-publish.yml` 在 release 为 published 或手工带 tag 触发。
- 发布作业自校验：tag 形如 `vX.Y.Z`、release 已发布、`package.json` 版本等于 tag。
- 发布前检查不得改写发布树（作业里有 `git diff --exit-code`）。
- 发布走 OIDC Trusted Publishing（`id-token: write`），不读 `NPM_TOKEN`；不要新增发布 token。
- agent 不打 tag、不建 Release、不执行发布。
- 宿主兼容矩阵有变化时同次更新 `docs/compatibility.md`。
- 版本号只增不减；同日多次发布各自用独立 tag。
