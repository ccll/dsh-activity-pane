---
name: dap-client-bundle
description: 改了 src/ 下的客户端源码、需要重建或校验 .dsh-plugin/client.js 时读
---

# dap-client-bundle

本技能管 `src/` 到 `.dsh-plugin/client.js` 的生成关系与字节一致性。

- 只改 `src/` 下的源码；`.dsh-plugin/client.js` 是生成物，永不手改。
- 生成：`pnpm build:client`（`scripts/build-client.mjs`）。
- 拼接顺序固定：`src/core.mjs` → `src/navigation.mjs` → `src/client.mjs`，逐文件去掉行首的 export 关键字。
- 新增客户端模块必须同时加进 `scripts/build-client.mjs`，否则不进产物。
- 写盘是临时文件加原子 rename，避免 HMR 读到半边文件；不要改成就地写。
- 提交前重建并一并暂存：`pnpm build:client` 后 `git add .dsh-plugin/client.js`。
- 字节一致性：`node tools/xtask.mjs bundle --check` 与 pre-commit 的 `scripts/check-staged-client.mjs`（从 index 重建再比对）。
- 不要用 `git add -p` 或部分暂存漏掉 bundle；`pnpm check` 会按工作树重建它。
- 本地挂载：dsh plugin --profile web add ./dsh-activity-pane；profile 内是指向本仓的 link:。
- 热更开发：`pnpm dev:watch` 监视 `src/` 与 build 脚本，变化即重建，浏览器经 dsh-client-hmr 热装。
- 宿主侧 `src/host.mjs` 不在 bundle 里；改它要重启 `dsh web`，不需要重建 bundle。
- 产物字节受只减清单预算约束，变大要在 PR 正文解释。
