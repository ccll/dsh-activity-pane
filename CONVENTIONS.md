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
- 测试锚点路径: scripts/check.mjs; scripts/acceptance.mjs

## 验证门禁

- 提交前务必运行 `pnpm build:client && pnpm check` 并把重新生成的 `.dsh-plugin/client.js` 一并暂存；`pre-commit` 的 `30-*` hook 也会重跑该检查。
- `.d/` hook 统一使用 `NN-name.sh`，两位编号在同一目录内唯一；dispatcher 以 `LC_ALL=C` 按文件名顺序执行并在首个失败处停止。
- `.githooks/pre-push`：先对 outgoing commits 重放 `.githooks/commit-msg`，再执行 `pre-push.d/`。
- 权威验证入口: .githooks/pre-push
- CI 门禁: 不适用：新项目尚未声明共享集成分支，建立 CI 时改为适用并登记配置路径
- `.githooks/pre-commit.d/20-agentmap-lint.sh`：AgentMap 结构、追溯与派生报告。
- `.githooks/pre-commit.d/30-dsh-activity-pane-check.sh`：dsh-activity-pane 单测与 client bundle 契约校验（`node scripts/check.mjs`）。
- `.githooks/pre-push.d/20-agentmap-lint.sh`：校验待推送历史的 AgentMap 不可变契约。
- 扫描来源：`.`

