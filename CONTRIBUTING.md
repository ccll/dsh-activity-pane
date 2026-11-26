# 参与本仓库

这是 DeepSeek Harness 的 activity-pane 插件。宿主 DSH 通过注入的服务调用它，客户端在 Web 壳层里渲染会话卡片、事件流与后台任务。

本文件是给人看的完整指南。agent 读 `AGENTS.md` 路由，按任务类型进入 `.agents/skills/` 下对应的技能。两者冲突时以 `node tools/xtask.mjs` 的检查为准。

## 环境

- Node 24、pnpm 11。
- 宿主运行时由 CI 与环境变量 `DSH_RUNTIME_PATH` 提供；本地跑 e2e 前确认 `dsh --version`。
- 安装：`pnpm install --frozen-lockfile`。

本地挂载插件时注意副作用：`dsh plugin --profile web add` 会改写 profile 的 `package.json` 并把插件写进 `dsh.profile.bundles`。只想离线试一下时用 `cordis_define` / `cordis_run`，不要动 profile。

`pre-push` 会跑全量门禁，耗时 7–11 分钟。期间 github.com 的 SSH 连接会空闲，需要应用层保活：`~/.ssh/config` 里为 `Host github.com` 设 `ServerAliveInterval 30` 与 `ServerAliveCountMax 10`，否则推送会在门禁跑完后因空闲被掐断。

## 工作单元：issue

工作单元是 GitHub issue，不是仓库里的文档。

- 开 issue 时写清可观察的现象与期望；
- 认领由提 PR 完成，不需要额外登记；
- 一个 issue 一个话题，拆开比堆在一起便宜。

## 认领与合并

1. 从 `origin/main` 拉分支，命名 `claim/<issue>-<slug>`。
2. 第一个提交必须是空提交：`git commit --allow-empty -m "claim: #N"`。
3. 推送后开 **draft PR**，标题 `<区域>: <用户或调用方现在得到什么>`，正文首行 `Fixes #N`。
4. 同一 issue 下**编号最小的开放 PR 胜出**；后来者关闭自己的 PR 并在评论里说明。
5. 72 小时内没有任何推送，其他人可以先在 PR 里留言，然后从该分支接管，原作者的 PR 正文里保留署名。
6. **agent 永不合并**。合并由项目属主执行：`gh pr merge --squash --match-head-commit`。

合并前的门禁：PR 必填、属主批准、`verify` 全绿、`approved-for-ci` 标签存在、分支与主干同步、评审线程已解决。

## 提交约定

标题：`emoji 中文类型(scope): 中文结果描述`。

| emoji | 类型 | | emoji | 类型 |
|---|---|---|---|---|
| ⭐ | 功能 | | 🧹 | 维护 |
| ✨ | 改进 | | ⚙️ | 配置 |
| 🐛 | 修复 | | ♻️ | 重构 |
| 📝 | 文档 | | 🚀 | 发布 |
| 🧪 | 测试 | | 📌 | 计划 |

- 标题与正文之间空一行；正文必须含 `## 原因`、`## 影响`、`## 取舍` 三段。
- `scope` 用小写字母、数字与连字符，不用 subscope。
- 标题是给人读的：写结果，不写机制；不写 `WIP`，不含 issue 号。
- 实现、修正、收口的提交在正文引用 issue 号，保证 `git blame` → PR → issue 可反查。
- 标题与正文语言用中文，与既有 700 余笔历史一致；用户可见文档中英双份并存。

## 门禁

权威入口是 `node tools/xtask.mjs ci`。它按改动路径决定跑哪些检查，并打印每条检查是执行还是跳过及原因。

| 命令 | 用途 |
|---|---|
| `node tools/xtask.mjs ci --fast` | 编辑循环，秒级：策略、技能、文档、清单、只减清单、bundle、单元检查 |
| `node tools/xtask.mjs ci` | 权威门禁：`--fast` 全部 + e2e |
| `node tools/xtask.mjs skills` | 路由与技能拓扑、长度、引用可解析 |
| `node tools/xtask.mjs docs` | `docs/architecture.md` 依赖表对真实 import、兼容版本对 src 标记、RFC 索引 |
| `node tools/xtask.mjs lists --fix` | 规范清单排序与命名 |
| `node tools/xtask.mjs policy` | 提交标题与正文、分支名、生成物一致性 |
| `node tools/xtask.mjs ratchet` | 只减清单的活性与到期 |
| `node tools/xtask.mjs bundle --check` | 重建客户端 bundle 并与索引字节比对 |
| `node tools/xtask.mjs unit` | `scripts/check.mjs` |
| `node tools/xtask.mjs e2e [--shard i/n]` | 27 个 e2e spec |
| `node tools/xtask.mjs accept` | 人工验收清单 |
| `node tools/xtask.mjs release` | 版本、tag、发布物完整性 |

钩子只做三件事，且都调用上面的命令：

- `pre-commit`：`policy` + `ci --fast` 的快速子集；
- `commit-msg`：标题与正文格式；
- `pre-push`：重放所有 outgoing commit 的 `policy`，然后跑 `ci`。

`.githooks/pre-commit.d/` 与 `.githooks/pre-push.d/` 下的脚本命名统一 `NN-name.sh`，两位编号在同目录唯一，按文件名顺序执行并在首个失败处停止。

## 测试放置

- 行为回归放进既有的区域文件：`scripts/check.mjs` 的对应小节，或 `e2e/specs/<area>.mjs`。**不新建 per-bug 测试文件**。
- 一个 spec 一个场景；失败截图会落在 `e2e/fail-*.png`，出现即失败信号。
- 不许为了通过而放宽期望值、忽略用例或改写测试输入。判据错了先改判据，判据对则改代码。
- `e2e/mock-llm.mjs` 的剧本是确定性的，所以每个 spec 的计数与终态记进 goldens；改 golden 必须在 PR 正文解释为什么。

## 只减清单

`tools/ratchet/` 下的文件只能变短：

- `host-shims.txt`：每代宿主的兼容补丁点，一处一行；移除补丁时删行。
- `uncovered-specs.txt`：暂时无法自动化的 spec，必须带原因与到期；
- `manual-acceptance.txt`：人工验收项，带原因与到期日，过期即失败；
- `bundle-bytes.json`、`perf-budget.json`：数字只能变小。

新增一项是错误，删掉一项是进展。

## 人工验收

自动化覆盖不到的部分写在 `scripts/acceptance.mjs`，由 `node tools/xtask.mjs accept` 走查。需要在真实宿主、真实数据或外部 registry 上跑一次的，把运行回执写进 `docs/receipts/`，并在 `docs/compatibility.md` 的对应行引用。

## 发布

- 版本号在 `package.json`，tag 为 `v<version>`，两者由 `xtask release` 校验。
- `npm-publish.yml` 用 OIDC 发布，发布前跑 `xtask ci`。
- `files[]` 必须覆盖实际发布产物。

## 文档该读哪一份

| 问题 | 去哪儿 |
|---|---|
| 这个项目做什么、到哪了、后面往哪走 | `docs/roadmap.md` |
| 现在是怎么实现的、模块边界在哪 | `docs/architecture.md` 与 `docs/design/` |
| 某个词到底指什么 | `docs/glossary.md` |
| 两代宿主差在哪、补丁埋在哪 | `docs/compatibility.md` |
| 当初为什么这么定 | `docs/rfcs/` |
| 某个历史改动做了什么 | `docs/archive/worklog.md`，细节用 `git show <commit>` |
| agent 该按什么流程做 | `AGENTS.md` 路由 → `.agents/skills/` |

## 规则从哪来

- 能机械判定的，写成 `node tools/xtask.mjs` 的子命令；执行不了的才留在文字里。
- 新增一条硬规则时，同一提交里必须同时写出执行它的检查，或在 `AGENTS.md` 里标 advisory。
- 纯过程性决定写进本文件或提交正文，不占 `docs/rfcs/`。
