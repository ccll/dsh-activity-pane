---
doc-type: task
mutation: lifecycle
id: T-158
---

# T-158 需求编号更正：档位资源纪律 R-01-024 改号 R-01-025

状态: active
关联: C-085、R-01-025、T-157（terminal，保留旧号引用作审计链）
风险等级: standard

## 背景与目标

- 背景: T-157 立项时将档位资源纪律编为 R-01-024。发版前核对历史发现该编号曾属「后台任务输出查看」（6bb73f0 引入、T-154 的 87c2c0b 原子级联删除，v0.14.0 发布说明留有引用），框架纪律规定需求编号删除后永不复用。东家确认（2026-10-08，改号闸口）：改号 R-01-025 后发布。
- 决策依据: C-085（编号更正，更正 C-084 影响面编号；C-084 历史文本保留原号不改写）。
- 目标: R-01-024 → R-01-025 原子改名，PRD/SOLUTION/代码注释与测试锚点全局一致；无行为变化。

## 差距评估

- 涉及文件：PRD.md（需求标题、七条 AC-ID、R-01-010/AC-09 注记）、SOLUTION.md（追溯索引、运行时语义、产品契约、模块内部结构、模型目录断言描述）、src/client.mjs（注释）、src/core.mjs（注释）、scripts/check.mjs（断言消息与锚点）、e2e/specs/density-resource.mjs（锚点）、scripts/acceptance.mjs（条目注释）、.dsh-plugin/client.js（随源码重建，注释字面量随改号）。
  - DOMAIN.md 不变量文本不含需求 ID 引用，无需改号（diff 无该文件）。
- T-157 为 terminal task：保留 R-01-024 引用作审计链，不随改号修改（lint 对 terminal task 不重验矩阵锚点）。
- RATIONALE C-084 历史文本保留 R-01-024（append-only、ID 不可改写），由 C-085 承载更正。

## 收敛方案

1. 原子改号：PRD 需求标题与 AC-ID、SOLUTION 追溯索引与契约条目、代码注释、check.mjs/e2e/acceptance 锚点字面量、bundle 随源码重建。
2. RATIONALE 追加 C-085 记录编号误用与改号决定，声明更正 C-084 影响面编号。
3. 新建本 task（T-158）承载改号；terminal T-157 不触碰。

## 测试计划

- `pnpm verify:fast`（agentmap lint、测试影响记账、单测与 bundle 契约）。
- `e2e/specs/density-resource.mjs` 与 `compact-density.mjs` 复跑（改号后锚点语义不变）。
- 全量 `pnpm verify` 由本次 pre-push 门禁承载。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| PRD | R-01-024/AC-01～AC-07 删除、R-01-025/AC-01～AC-07 新增（纯编号迁移，正文零语义变化） | UNIT/E2E | update | `scripts/check.mjs#R-01-025/AC-01`、`e2e/specs/density-resource.mjs#R-01-025/AC-01`、`scripts/acceptance.mjs#R-01-025/AC-04` 锚点同次改名 |
| SOLUTION | 追溯索引与档位资源纪律条目编号改号，方案语义不变 | UNIT/E2E | update | `scripts/check.mjs#R-01-025/AC-01` 契约断言随锚点改名，语义零漂移 |
| R-01-024/AC-01～AC-07 | 编号迁移为 R-01-025/AC-01～AC-07 | UNIT/E2E | none | 纯编号更正：正文逐字节不变，AC-ID 集合机检由 lint 承载（仅编号前缀变化，可判定语义不变） |
| R-01-010/AC-09 | 注记内编号引用随改号更新 | MANUAL | update | `scripts/acceptance.mjs#R-01-010/AC-09` 步骤字面量同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：全部 map/代码注释/测试锚点编号一致改为 R-01-025，无残留 R-01-024 | `scripts/check.mjs#R-01-025/AC-01`、`src/core.mjs::logWindowSuppressed` |
| 异常 | 适用：terminal T-157 保留 R-01-024 引用作审计链，lint 对终态 task 不重验矩阵锚点；RATIONALE C-084 历史文本不改写 | `scripts/check.mjs#R-01-025/AC-03`、`src/client.mjs::logWindowSuppressedFor` |
| 边界配置 | 适用：R-01-010/AC-09 注记随改号同步；发布流程在改号提交并入 main 后再创建 Release | `e2e/specs/density-resource.mjs#R-01-025/AC-01`、`src/client.mjs::enforceDensityDataDiscipline` |
| 副作用 | 适用：零行为变化——bundle 行为等价，测试断言仅锚点字面量改名 | `scripts/check.mjs#R-01-025/AC-05`、`src/client.mjs::enforceDensityDataDiscipline` |

## 终态与证据

- 实现: 档位资源纪律编号 R-01-024 改号 R-01-025（C-085，东家 2026-10-08 闸口确认）。
  - 原子改名：PRD 需求标题与七条 AC-ID、R-01-010/AC-09 注记、SOLUTION 追溯索引与契约条目、src/client.mjs 与 src/core.mjs 注释、check.mjs 断言消息与锚点、e2e/specs/density-resource.mjs 锚点、scripts/acceptance.mjs 条目注释、bundle 随源码重建。
  - RATIONALE 追加 C-085；C-084 历史文本保留 R-01-024；terminal T-157 保留旧号引用作审计链。
  - DOMAIN.md 无 ID 引用，diff 无该文件。
- 测试: `pnpm verify:fast` 全绿；`density-resource.mjs` 与 `compact-density.mjs` 通过；全量 `pnpm verify` 由本次 pre-push 门禁承载。
  - bundle diff 仅含编号字面量（`git diff .dsh-plugin/client.js` 非 ID 行为零），行为零变化独立证实。
- SOLUTION 对照: 需求追溯索引恰一行 R-01-025、契约条目与实现注释同步；PRD 关联方案「窗格渲染器」与 SOLUTION 反向承接一致，编号改写零语义漂移。
- commit: （终态时填写改号提交 hash）
- review:
  - 审核方: code-review skill 合并轴子代理（agent 2928710a），基线 HEAD（e16eba9）
  - 目的理解: 本次变更目的为更正 T-157 的编号误用（R-01-024 曾属 T-154 删除的「后台任务输出查看」），纯编号迁移、零行为变化；约束：terminal T-157 与 RATIONALE C-084 历史文本保留旧号作审计链、测试锚点语义零漂移、tmp-rc-diff/ 无关产物不入提交。
  - 执行方式: code-review skill 合并轴评审（工作树 vs HEAD； Standards 全树残留比对与多重集漂移检查，Spec 对照 T-158/C-085/PRD R-01-025）。
  - 问题与修复: 两项记录性发现已收敛——task 文件清单误列 DOMAIN.md、漏列 .dsh-plugin/client.js，均已在 active task 文本与 C-085 决策行同步修正。
  - 复审结论: 「无阻塞发现，T-158 改号审核通过」；清单收敛由执行方在提交前完成并记录于本块。
- 残余风险与测试缺口:
  - 终态 T-157 与 C-084 的 R-01-024 引用为设计保留审计链，后续勿当残留误改。
  - 工作树含无关未跟踪目录 tmp-rc-diff/（0.2.0-rc.2 包产物），提交勿误 add。
