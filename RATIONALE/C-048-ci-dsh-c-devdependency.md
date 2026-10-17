---
doc-type: rationale
mutation: append-only
id: C-048
owner: agent
---

# C-048 CI 使用隔离的历史截止 DSH 安装（修订 C-046 的项目 devDependency）

日期: 2026-08-28

#### 上下文
把 `@deepseek-ai/dsh@0.1.0-rc.7` 加入项目 devDependency 后，包内 `^0.1.0-rc.7` 依赖在当前 registry 解析为 rc.8，使插件自身 `@deepseek-ai/dsh-storage-domain@rc.6` 的 peer 图也被重解；完整套件出现大面积 sessions 首推停滞。对照安装 `npm install --before=2026-08-18 @deepseek-ai/dsh@0.1.0-rc.7` 后，dsh-base、client-runtime、session-projection、web-app 等完整运行时均一致解析为 rc.7，与已验证宿主相同；同时不改变项目 lockfile 与插件 peer 图。

#### 决策
- 废弃 C-046 的“项目 devDependency 安装 dsh”；项目 lockfile只承载插件自身依赖与 Playwright。
- GitHub Actions 在独立全局前缀安装 `@deepseek-ai/dsh@0.1.0-rc.7`，并以 `--before=2026-08-18T00:00:00Z` 限定其 caret 传递依赖只能选择该版本发布时已存在的 rc.7 家族。
- CI 仍锁定顶层版本与历史截止时间，禁止安装 registry 当前 latest；升级 DSH 时必须显式更新两者并先跑完整 E2E。
- 本地开发沿用已安装的 dsh CLI；`pnpm verify` 启动前若 PATH 无 dsh，`bootE2e` 按既有失败语义明确报错。

#### 被否方案及原因
- 在项目 root 为全部 `@deepseek-ai/dsh-*` 传递包维护 overrides：需登记上百个包名，易漏且会污染插件自身依赖解析，维护成本不可接受。
- 只锁顶层 `@deepseek-ai/dsh@rc.7`：其 caret 依赖仍会随 registry 新发布漂移，已实测解析成 rc.8。
- CI 使用 rc.8 coherent runtime：当前对照实测的 sessions 首推停滞显著高于既有 rc.7 基线，不能作为稳定门禁运行时。

#### 影响面
R-01-002、R-01-008、R-02-002 / E2E 验证基建、验证门禁
