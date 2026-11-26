# RFC-0001 以 SolidCraft 工作流取代 AgentMap

状态: Accepted
日期: 2026-11-26
决策者: 项目属主
取代: AgentMap v10 全部流程层（PRD、SOLUTION、DOMAIN、CONVENTIONS、AgentMap AGENTS.md、tasks/、RATIONALE/、tools/agentmap_*.py、test_impact_lint）

## 上下文

AgentMap 在本仓库运行了约 14 周，积累了完整的意图层与审计层，也积累了可测量的熵：

- 核心文档 283,445 B，占自登记上限 315,000 B 的 90%；SOLUTION 一份 138,154 B，占 44%。
- 归档层 2.06 MB，比 1.31 MB 的代码还重；203 个 task 共 1.64 MB，每个 task 平均 72 行仪式文本，且从早期均值 64 行涨到近期 80 行（+33%）。
- 703 笔提交里 31.9% 只改 map，19.2% 是纯规划或关闭提交。
- `agentmap_lint.py` 7,165 行、19 项生效检查，单次 15.7 s（1,619 次 git 子进程）；167 条警告中 159 条来自不阻断的写作风格检查。
- 证据链出现自证失效：T-190 审计更正 4 处失实证据；T-201 语义行 57 > 阈值 50 却按 minor 立案，事后追溯补开 task；8 个累计审计 task 的唯一产出是修复不可变 task 里的假证据。
- 规范自己豁免的仪式从未被使用：203/203 个 task 都写了"差距评估/收敛方案/测试计划/验证矩阵"，尽管规范明说 minor 档这些是仪式性写作。

同期，SolidCraft（tangency-labs/solidcraft）用一套相反的哲学在 50 天内产出 14,534 笔提交、9,850 个 PR、89 MB Rust 与 100 个发布。它的关键不在更完善的文档，而在更少的文档加更多可执行裁决：AGENTS.md 只有 5.4 KB 且每行规则都点名执行器；27 个技能每个 ≤3,600 字符并由 `cargo xtask skills` 校验拓扑；质量由可测 oracle（闭式解、独立程序、fuzz、goldens、只减清单）裁决，而不是由需求追溯裁决。

## 决策

退役 AgentMap 全部流程层，改为 SolidCraft 式工作流：

- 意图层只保留 `docs/roadmap.md`（愿景、目标、非目标、里程碑）；工作单元由 GitHub issue 承载，不再有 task 文档。
- 当前真相层 = `docs/architecture.md`（加 `docs/design/*.md` 下钻）+ `docs/glossary.md` + `docs/compatibility.md`。
- 决策层 = `docs/rfcs/NNNN-*.md`，承接原 RATIONALE。
- 规则层 = `AGENTS.md` 路由（≤5,600 字符，一行一条硬规则并点名执行器）+ `.agents/skills/`（每个 ≤3,600 字符）。
- 执行层 = `tools/xtask.mjs` 子命令；凡规则必须由子命令执行，无执行器者删除或标 advisory。
- 质量裁决 = tests + goldens + `tools/ratchet/`（只减清单）+ bundle 字节与性能预算。
- 协作 = PR-only 主干：`claim/<issue>-<slug>` 分支、空提交 `claim: #N`、编号最小者胜、72 h 接管、由属主 squash merge、agent 永不合并。

## 被否方案及原因

- 与 AgentMap 并存：两套意图层与两套门禁同时生效，固定成本相加而不是相减；且"哪份文档是真相"会被反复质疑。
- 只移植部分机制（保留 PRD/SOLUTION/tasks）：保留的部分正是实测熵的主体（归档层 2.06 MB、31.9% map-only 提交），移植的只是外围。
- 保留 203 个 task 文档并原样归档：等于把 AgentMap 的熵搬进新层，与替换初衷矛盾。工作历史按 SolidCraft 的定位活在 git 与 PR 里，库内只留可检索的 `docs/archive/worklog.md` 索引。
- 照搬 SolidCraft 全部规则：English-only（其因果是全球贡献池）、"agent 永不合并"（单属主仓库会变成无意义的空转）、把计划放进 gitignore（跨会话连续性正是本项目不可让渡的价值）均不适用。

## 影响面

损失：需求级查询（"R-01-012 做完了吗"）、1,998 处 AC 锚点代表的意图覆盖、AgentMap 写作规范（约 80 KB 中文散文）、lint 里约 70% 的检查（占位词、分档、评审证据、毕业制）。

替代：`docs/architecture.md` 的依赖表由 `xtask docs` 对照真实 import 校验；goldens 与 ratchet 承担行为回归；`docs/roadmap.md` + `docs/rfcs/` 承担连续性与"当初为什么"。

## 迁移映射

| 原层 | 规模 | 新位置 | 处理 |
|---|---|---|---|
| PRD.md | 62 KB / 28 R / 191 AC / 5 M | docs/roadmap.md | AC 与 ID 全部删除 |
| SOLUTION.md | 138 KB | docs/architecture.md + docs/design/*.md | 追溯索引删除，保留当前真相 |
| DOMAIN.md | 24 KB | docs/glossary.md | 术语全保留 |
| RATIONALE/ | 103 条 | docs/rfcs/NNNN-*.md | git mv；纯流程决策不入 RFC |
| tasks/ | 203 个 | docs/archive/worklog.md + git 历史 | 一行一个索引 |
| receipts/ | 2 份 | docs/receipts/ | 保留并由 compatibility 引用 |
| CONVENTIONS.md | 11.6 KB | CONTRIBUTING.md + xtask | 可机械化的全部进检查 |
| AGENTS.md | 47.7 KB | AGENTS.md 路由 + skills | 全重写并由 xtask skills 校验 |
| tools/*.py | 8,044 行 | tools/xtask.mjs | 约 30% 移植 |

## 阶段

1. P0 立项与骨架（本 RFC、docs 目录、xtask 契约）。
2. P1 新层成形（architecture、glossary、roadmap、compatibility、rfcs、skills、AGENTS 路由、xtask 子命令、ratchet）。
3. P2 关旧闸（删除 python 工具与钩子调用，改 package.json / ci.yml / .gitignore）。
4. P3 迁移历史并删除旧层（tasks → worklog，RATIONALE → rfcs，删除 PRD/SOLUTION/DOMAIN/CONVENTIONS/tasks/receipts 原位）。
5. P4 剥离 2,397 处 AC 锚点（src 锚点与 `pnpm build:client` 同提交）。
6. P5 新门禁接管并验证（xtask ci 全绿、27 个 e2e spec 全绿、bundle 可复现、ci.yml 加 pull_request）。
7. P6 取消跟踪 tmp-rc-diff（1,193 个文件，占跟踪文件 75%）。

## 验收

- `pnpm verify` 全绿，27 个 e2e spec 全绿。
- `node tools/xtask.mjs ci` 在 main 与 PR 上均能作为权威门禁。
- 仓库内不存在 PRD/SOLUTION/DOMAIN/RATIONALE/tasks/AgentMap 工具与钩子的引用。
- `docs/roadmap.md`、`docs/architecture.md`、`docs/rfcs/`、`docs/archive/worklog.md` 可独立回答"做什么、到哪了、当初为什么"。
