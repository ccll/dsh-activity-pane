---
doc-type: conventions
mutation: living
owner: agent 主笔，项目属主审批
---

# CONVENTIONS — 本项目开发规范

## 高频规则

<!-- BEGIN AGENTMAP COMMIT CONVENTION -->
## Git 提交规范

- 标题使用 `emoji 中文类型(scope): 中文结果描述`。
- emoji/type 固定配对：⭐ 功能、✨ 改进、🐛 修复、📝 文档、🧪 测试、📌 计划、🧹 维护、⚙️ 配置、♻️ 重构、🚀 发布。
- `scope` 使用小写字母、数字和连字符，不使用 subscope。
- 普通提交正文必须包含 `## 原因`、`## 影响`、`## 取舍`；Merge、Revert、fixup 与 squash 使用 Git 生成标题。
- `.githooks/commit-msg` 校验当前提交，`.githooks/pre-push` 重检 outgoing commits；项目附加规则放入 `.githooks/commit-msg.d/NN-name.sh`。
<!-- END AGENTMAP COMMIT CONVENTION -->

## AgentMap 本地参数

- 需求组 01: 用户
- 需求组 02: 维护者
- 验证矩阵起始 task: T-001
- 代码审核起始 task: T-001
- 测试锚定模式: strict
- 测试锚点路径: scripts/check.mjs; scripts/acceptance.mjs; e2e/specs/*.mjs

## 验证门禁

- 每次 agent 工作完成运行 `pnpm verify`；编辑循环可先运行约 5 秒的 `pnpm verify:fast`。`pnpm check` 会重建 `.dsh-plugin/client.js`，提交时一并暂存生成结果。
- `.d/` hook 统一使用 `NN-name.sh`，两位编号在同一目录内唯一；dispatcher 以 `LC_ALL=C` 按文件名顺序执行并在首个失败处停止。
- `.githooks/pre-push`：先对 outgoing commits 重放 `.githooks/commit-msg`，再执行 `pre-push.d/`。
- 快速验证入口: `pnpm verify:fast`（AgentMap lint + core 单测与 client bundle 契约）。
- 权威验证入口: .githooks/pre-push
- 完整验证命令: `pnpm verify`（快速入口 + 全量浏览器 E2E）；agent 任务结束、pre-push 与 CI 重放同一命令。
- CI 门禁: 适用：`.github/workflows/ci.yml` 在 pull request 与 main push 上使用锁定的 Node、pnpm、dsh 与 Playwright Chromium 执行 pnpm verify，失败上传 E2E screenshot artifact。
- `.githooks/pre-commit.d/20-agentmap-lint.sh`：AgentMap 结构、追溯与派生报告。
- `.githooks/pre-commit.d/30-dsh-activity-pane-check.sh`：dsh-activity-pane 单测与 client bundle 契约校验（`node scripts/check.mjs`）。
- `.githooks/pre-push.d/20-agentmap-lint.sh`：校验待推送历史的 AgentMap 不可变契约。
- `.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh`：执行完整 `pnpm verify`；E2E 每 spec/恢复尝试独立 dsh web、Chromium 与 context，只有 `E2E_PANE_STALL` 允许有限恢复并在汇总中计数。
- 扫描来源：`.`

## 构建与开发工作流

- E2E（C-045、C-046、C-047、C-049）：`pnpm test:e2e` 启动隔离测试环境（临时 `$DSH_HOME` + mock LLM + 随机端口 dsh web）并以固定 2 worker 执行 `e2e/specs/*.mjs`；每 spec/恢复尝试独立 Chromium 与 context；首次使用先 `PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec playwright install chromium-headless-shell`，失败截图落在 `e2e/fail-*.png`（已 gitignore）。
- 本地开发安装（在 profile 中挂载；pnpm `link:` 使 profile 内为指向本仓库的符号链接）：`dsh plugin --profile web add ./dsh-activity-pane`。
- `pnpm build:client` 生成 `.dsh-plugin/client.js`；`pnpm check` 做 core 单元检查 + bundle 校验；`pnpm dev:watch` 监视 `src/*.mjs`，变化即重建 bundle。
- 热更开发：DSH 通过 `dsh-client-hmr` 监视已安装插件的 client bundle 文件，内容一变就推送 `rebuilt` 帧，浏览器单独热装该插件——不需要整页刷新，也不需要重启 `dsh web`（host 侧改动除外：本插件自 T-073 起 host 侧承载完成确认状态，改动 `src/host.mjs` 后需重启 `dsh web` 生效）。
- 本插件以 `link:` 依赖装入 profile（符号链接），且 `scripts/build-client.mjs` 采用原子写入（临时文件 + rename），流程是：
  1. `dsh plugin --profile web add ./dsh-activity-pane`，然后重启一次 `dsh web`（新增 bundle 需重启才进入加载名单；之后的热更无需再重启）。
  2. 在本仓库运行 `pnpm dev:watch`（或 `node scripts/watch.mjs`）。
  3. 改 `src/core.mjs` / `src/client.mjs` → watch 自动重建 `.dsh-plugin/client.js` → profile 侧同一文件同步更新 → 浏览器热装生效。
- 注意：`dsh-activity-pane` 会改动 profile 的 `package.json`（加 `file:` 依赖）并把插件加入 `dsh.profile.bundles`；离线快速实验可改用 DSH 会话内的 `cordis_define` / `cordis_run` 动态加载，不落盘。

