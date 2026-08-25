---
doc-type: task
mutation: lifecycle
id: T-050
---

# T-050 时间线 assistant 行中文「助手/思考」标签与机器人图标

状态: active
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

（完成后填写）
