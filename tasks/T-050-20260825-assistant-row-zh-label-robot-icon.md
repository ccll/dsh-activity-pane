---
doc-type: task
mutation: lifecycle
id: T-050
---

# T-050 时间线 assistant 行中文「助手/思考」标签与机器人图标

状态: completed
关联: R-01-012（AC-09、AC-10）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

活动会话时间线中，agent 正文行的标签为英文「Assistant」、思考语义标签为英文「Think」，与周围中文文案（上下文注入、更新任务清单、正在思考/已思考等组标题）不一致；正文行图标复用 sparkle（与 cordis 插件动作、未知工具兜底同款），体现不出 agent 助手输出语义。东家确认方案：正文行 label 改「助手」、思考语义 label 统一「思考」；正文行图标复用最近卡 agent 角色标识同源的机器人图标（createRobotIcon，R-01-013/AC-08）；图标分流从 label 字符串比较改为按数据字段（reasoning/detail 有无）判定。UI/UX 改进，走全链：PRD R-01-012 追加 AC-09/AC-10 与 DESIGN 产品契约演进已经东家两闸口确认。

## 差距评估

- PRD/DESIGN：已同次演进（AC-09/AC-10；工作项时间线呈现契约补 label 中文归一与图标分流约束）。
- `src/core.mjs`：`timelineItemFromChatNode` label 取「Think/Assistant」（约 317 行）、`foldMemberOf` 思考成员 label「Think」（约 486 行）、`foldWorkGroups` 正文行 label「Assistant」（约 581 行）三处英文残留。
- `src/client.mjs`：`fallbackTraceIcon` 以 `label === "Think"` 字符串比较分流，正文行落 sparkle 图标（约 1494 行）。
- `scripts/check.mjs`：既有两处 label "Assistant" 断言与一处 `"Think" ? createThinkIcon() : createSparkleIcon()` bundle 断言需改写；多处 fixtures 的英文 label 需同步中文化。
- `scripts/acceptance.mjs`：T-009/R-01-012 相关人工验收步骤仍描述「Think」标题，需同步并补 AC-09/AC-10 验收步骤。

## 收敛方案

- `src/core.mjs`：三处 label 中文化——正文行「助手」、思考语义（含折叠组成员数据）「思考」。
- `src/client.mjs`：assistant 非折叠行按 `detail`（reasoning）有无分流：有 → 思考图标，无（正文行）→ `createRobotIcon()`；不再比较 label 文案。折叠 think 组图标（思考图标）不变；sparkle 仍服务 cordis/未知工具兜底。
- 测试先行：`scripts/check.mjs` 更新 label 断言为「助手/思考」并锚定 R-01-012/AC-09；新增纯思考项 label「思考」断言（AC-10）；bundle 守卫改为「机器人图标分流表达式 + 无英文 Think/Assistant 标签残留 + 含中文标签」；fixtures 同步中文化。
- `scripts/acceptance.mjs`：相关步骤措辞同步为「助手/思考」，新增 AC-09/AC-10 人工验收步骤。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（含新锚点断言）。
- `python3 tools/agentmap_lint.py --report` 追溯完整。
- `git diff --check` 干净；提交时 pre-commit 钩子重放通过。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：正文行 label「助手」+ 机器人图标；思考语义 label「思考」 | `scripts/check.mjs#R-01-012/AC-09`、`scripts/check.mjs#R-01-012/AC-10`、`src/core.mjs::foldWorkGroups`、`src/client.mjs::fallbackTraceIcon` |
| 异常 | 不适用：纯呈现文案/图标变更，无新失败路径 | — |
| 边界配置 | 适用：reasoning+正文同节点剥离后正文行仍「助手」且无推理残留 | `scripts/check.mjs#R-01-017/AC-02 reasoning+正文同节点剥离`、`src/core.mjs::foldWorkGroups` |
| 副作用 | 适用：bundle 无英文 Think/Assistant 残留；sparkle 兜底面（cordis/未知工具）不受影响 | `scripts/check.mjs#R-01-012/AC-10 时间线数据层无英文`、`scripts/check.mjs#R-01-013/AC-08`、`src/client.mjs::fallbackTraceIcon` |

## 终态与证据

- 实现: PRD R-01-012 追加 AC-09/AC-10（两闸口东家确认）；DESIGN 产品契约「工作项时间线呈现」补 label 中文归一与图标分流约束；src/core.mjs 三处 label 中文化（正文「助手」、思考「思考」）与两处注释英文清理；src/client.mjs 正文行图标改 createRobotIcon（与最近卡 agent 角色标识同源）、图标分流改 detail truthy 谓词（评审收口，与 core label 判定同源）；scripts/check.mjs 断言与 fixtures 同步并新增 AC-09/AC-10 锚点与 bundle 守卫；scripts/acceptance.mjs 措辞同步并新增 AC-09/AC-10 人工验收步骤；.dsh-plugin/client.js 重新生成。
- 测试: pnpm build:client && pnpm check 全绿（测试先行：新锚点先红后绿）；python3 tools/agentmap_lint.py --report 通过（requirements=22 / acceptance-criteria=105 / design-covered=22 / test-anchored=105）；git diff --check 干净；两次提交 pre-commit 钩子（20-agentmap-lint、30-dsh-activity-pane-check）重放通过。GUI 现场验收（正文行机器人图标 +「助手」标签、思考行「思考」标签）由东家按 scripts/acceptance.mjs 人工核验。
- DESIGN 对照: 产品契约「显示行 label 中文归一」「正文行机器人 SVG、思考行思考图标、图标分流按 reasoning/detail 有无而不比较 label 文案」与实现一致；需求追溯索引无需变动（无新 R-ID）。
- commit: 43256cb e77c13c（前者实现、后者双轴评审收口）
- review:
  - 审核方: 独立子代理双轴并行（Standards：224daacd-0aae-4268-a197-701152c5c983；Spec：85330b58-fb19-4916-8094-fd1fda863a54）。
  - 目的理解: 时间线 agent 正文行标签中文化（助手/思考）、正文行图标改为与最近卡 agent 角色标识同源的机器人图标、图标分流从 label 字符串比较改为按 reasoning/detail 有无判定；关联 R-01-012/AC-09、AC-10；预期行为与验证以 PRD AC 与 check/acceptance 锚点为准。
  - 执行方式: code-review skill 双轴（Standards + Spec）审核 git diff HEAD~1...HEAD（提交 43256cb）；Standards 对照 AGENTS/CONVENTIONS/DESIGN 横切约束 + Fowler 味道基线；Spec 对照 tasks/T-050 方案、PRD R-01-012/R-01-013 与 DESIGN 契约。
  - 问题与修复: Standards——无硬违规；判断性 1) client detail.trim() 谓词与 core truthy 判定对纯空白 reasoning 不一致 → e77c13c 改 truthy 同源谓词；2) label 字面量三处重复 → 被仓库内联惯例压制，维持现状。Spec——无缺失/范围蔓延/实现错误；nit：core 两处注释残留英文「Think」→ e77c13c 改「思考」。
  - 复审结论: 双轴复审均通过（finding 全部消除，无新增问题）。
