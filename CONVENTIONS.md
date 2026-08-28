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

- 每次 agent 工作完成运行 `pnpm verify`；编辑循环可先运行约 5 秒的 `pnpm verify:fast`。`pnpm check` 会从工作树重建 `.dsh-plugin/client.js`，提交时必须一并暂存；pre-commit 另以 Git index 内容校验 staged source/build script/bundle 完全一致。
- PRD 的 AC 新增或正文修改必须在同次变更中触碰含该 exact AC-ID 的自动测试或人工验收证据；仅措辞澄清可由同次修改的 active task 在「测试影响」表以 `none` 动作和具体理由豁免。DESIGN 变化必须由同次修改的 active task 记录 `DESIGN` 测试影响行。门禁只强制重新审视证据，不自动生成、改写或删除测试（C-059）。
- 测试证据按路径分类报告：`scripts/check.mjs` 为 unit/contract，`e2e/specs/*.mjs` 为 browser E2E，`scripts/acceptance.mjs` 为 manual；`test-anchored` 只表示 AC-ID 锚点闭合，不等同于浏览器覆盖率。
- `.d/` hook 统一使用 `NN-name.sh`，两位编号在同一目录内唯一；dispatcher 以 `LC_ALL=C` 按文件名顺序执行并在首个失败处停止。
- `.githooks/pre-push`：先对 outgoing commits 重放 `.githooks/commit-msg`，再执行 `pre-push.d/`。
- 快速验证入口: `pnpm verify:fast`（AgentMap lint + 测试影响检查器 self-test/report + core 单测与 client bundle 契约）。
- 权威验证入口: .githooks/pre-push
- 完整验证命令: `pnpm verify`（快速入口 + 全量浏览器 E2E）；agent 任务结束与 pre-push 重放同一命令。
- CI 门禁: 不适用：C-057 已暂停 main push、tag 与 PR 自动 hosted 运行，`.github/workflows/ci.yml` 仅保留 `workflow_dispatch` 诊断入口。C-058 已修复本项目 sessions readiness 根因，但恢复自动触发仍须先有手工 hosted 实测并另立决策；提交与推送以本地 `.githooks/pre-push` 的 `pnpm verify` 为当前权威门禁。
- `.githooks/pre-commit.d/20-agentmap-lint.sh`：AgentMap 结构、追溯与派生报告。
- `.githooks/pre-commit.d/25-test-impact.sh`：比较 HEAD 与 staged PRD/DESIGN，要求测试证据同步变化或由 staged active task 记录结构化 `none` 理由。
- `.githooks/pre-commit.d/30-dsh-activity-pane-check.sh`：dsh-activity-pane 单测与 client bundle 契约校验（`node scripts/check.mjs`）。
- `.githooks/pre-commit.d/35-staged-client-bundle.sh`：从 Git index 的 builder/source 生成期望 client bundle，并与 staged `.dsh-plugin/client.js` 按字节比较。
- `.githooks/pre-push.d/20-agentmap-lint.sh`：校验待推送历史的 AgentMap 不可变契约。
- `.githooks/pre-push.d/25-test-impact.sh`：逐个 outgoing commit 重放 PRD/DESIGN 测试影响门禁，防止本地 staged 检查被绕过。
- `.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh`：执行完整 `pnpm verify`；E2E 每 spec 使用独立 dsh web、Chromium、context 与单个页面连接世代，列表超时、列表失败与 spec 断言均不 reload 或换环境重试。
- 扫描来源：`.`

## 构建与开发工作流

- E2E（C-045、C-046、C-047、C-058）：`pnpm test:e2e` 启动隔离测试环境（临时 `$DSH_HOME` + mock LLM + 随机端口 dsh web）并固定顺序执行 `e2e/specs/*.mjs`；每 spec 独立 Chromium/context 且只建立一个页面连接世代；首次使用先 `PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec playwright install chromium-headless-shell`，失败截图落在 `e2e/fail-*.png`（已 gitignore）。
- 本地开发安装（在 profile 中挂载；pnpm `link:` 使 profile 内为指向本仓库的符号链接）：`dsh plugin --profile web add ./dsh-activity-pane`。
- `pnpm build:client` 生成 `.dsh-plugin/client.js`；`pnpm check` 做 core 单元检查 + bundle 校验；`pnpm dev:watch` 监视 `src/*.mjs`，变化即重建 bundle。
- 热更开发：DSH 通过 `dsh-client-hmr` 监视已安装插件的 client bundle 文件，内容一变就推送 `rebuilt` 帧，浏览器单独热装该插件——不需要整页刷新，也不需要重启 `dsh web`（host 侧改动除外：本插件自 T-073 起 host 侧承载完成确认状态，改动 `src/host.mjs` 后需重启 `dsh web` 生效）。
- 本插件以 `link:` 依赖装入 profile（符号链接），且 `scripts/build-client.mjs` 采用原子写入（临时文件 + rename），流程是：
  1. `dsh plugin --profile web add ./dsh-activity-pane`，然后重启一次 `dsh web`（新增 bundle 需重启才进入加载名单；之后的热更无需再重启）。
  2. 在本仓库运行 `pnpm dev:watch`（或 `node scripts/watch.mjs`）。
  3. 改 `src/core.mjs` / `src/client.mjs` → watch 自动重建 `.dsh-plugin/client.js` → profile 侧同一文件同步更新 → 浏览器热装生效。
- 注意：`dsh-activity-pane` 会改动 profile 的 `package.json`（加 `file:` 依赖）并把插件加入 `dsh.profile.bundles`；离线快速实验可改用 DSH 会话内的 `cordis_define` / `cordis_run` 动态加载，不落盘。

