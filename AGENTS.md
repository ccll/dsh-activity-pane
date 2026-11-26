# 本仓库的 agent 指引

> 人读 `CONTRIBUTING.md`；本文件是路由：每条硬规则后面写谁执行它，每个任务类型指向一份技能。
> 没有执行器的规则不许留在这里；要新增规则，同一提交里写出执行它的检查，或在行尾标 `advisory`。

## 开始之前

- 工作单元是 GitHub issue：`gh issue list --state open`。
- 结构读 `docs/architecture.md`，方向读 `docs/roadmap.md`，词汇读 `docs/glossary.md`。
- 认领前先查有没有更早的 PR：`gh pr list --search "#N"`。
- 权威门禁 `node tools/xtask.mjs ci`；编辑循环用 `node tools/xtask.mjs ci --fast`。

## 硬规则（括号内是执行者）

- 一个 issue 一个话题；分支 `claim/<issue>-<slug>`（`xtask policy`）。
- 第一个提交是空提交 `claim: #N`，随后开 draft PR（`.github/workflows/pr-checks.yml`）。
- 同一 issue 下编号最小的开放 PR 胜出；72 小时无推送可接管（advisory，靠 reviewer 与属主）。
- agent 永不合并、永不给主干加保护豁免（主干 ruleset：必需 PR + 必需 status check）。
- 提交标题 `emoji 中文类型(scope): 结果`，正文三段 `## 原因`/`## 影响`/`## 取舍`（`xtask policy --message`）。
- 不许手改 `.dsh-plugin/client.js`；改 `src/` 就在同一提交重建它（`xtask bundle --check`）。
- 期望值只能因判据错误而改，不许为通过而放宽、忽略或改写测试输入（`xtask ratchet` + goldens）。
- 新增 e2e spec 必须登记；人工验收到期即失败（`xtask ratchet`）。
- 回归测试放进既有区域文件，不新建 per-bug 文件（advisory，评审把关）。
- 兼容补丁变化时同一提交更新 `docs/compatibility.md`（`xtask docs`）。
- 文档与代码不一致时收敛代码，或先改文档再改代码（`xtask docs`）。
- 路由表与技能目录必须一一对应，每份技能 ≤3600 字节（`xtask skills`）。
- 规范清单排序、钩子脚本 `NN-name.sh` 唯一（`xtask lists`）。
- 版本号、tag、发布物一致（`xtask release`）。
- 禁止把 `tmp-*`、`.chrome-debug*`、生成物入库（`xtask policy`）。
- 禁止 `AC-`/`R-` 需求锚点与 AgentMap 遗留文件回流（`xtask policy`）。
- 推送到 `main` 一律拒绝（`xtask policy --push` + 主干 ruleset）。

## 技能：按任务读一份

| 技能 | 何时读 |
|---|---|
| `.agents/skills/dap-contributing/SKILL.md` | 第一次改代码、准备开 PR |
| `.agents/skills/dap-file-pr/SKILL.md` | 有改动、要开 PR 或补标题正文 |
| `.agents/skills/dap-babysit-pr/SKILL.md` | PR 已推送，盯 CI 与评审 |
| `.agents/skills/dap-full-stop/SKILL.md` | 收口一个 PR |
| `.agents/skills/dap-takeover/SKILL.md` | 接管 72 小时无推送的 PR |
| `.agents/skills/dap-host-compat/SKILL.md` | 宿主侧或壳层相关改动、宿主升级 |
| `.agents/skills/dap-client-bundle/SKILL.md` | 改了 `src/` 客户端源码 |
| `.agents/skills/dap-e2e/SKILL.md` | 加改或调试 e2e spec |
| `.agents/skills/dap-unit-checks/SKILL.md` | 加改 `scripts/check.mjs` 断言 |
| `.agents/skills/dap-ui/SKILL.md` | 布局、档位、抽屉、开关落位、样式 |
| `.agents/skills/dap-performance/SKILL.md` | 渲染、折叠、派生、时钟路径 |
| `.agents/skills/dap-resume/SKILL.md` | 断流恢复、回填、完成同步 |
| `.agents/skills/dap-jobs/SKILL.md` | 后台任务订阅与徽标 |
| `.agents/skills/dap-release/SKILL.md` | 发版、版本号、tag、npm 作业 |
| `.agents/skills/dap-tests/SKILL.md` | 加改测试、更新 golden、动只减清单 |
| `.agents/skills/dap-acceptance/SKILL.md` | 人工验收、写运行回执 |

## 提交前自查

1. `node tools/xtask.mjs ci --fast` 全绿。
2. PR 正文写清：改了什么可观察行为、动了哪些契约、怎么验证的。
3. 留给属主的：风险点、未覆盖场景、需要人工验收的项。
