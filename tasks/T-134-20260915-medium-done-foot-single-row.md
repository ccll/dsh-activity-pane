---
doc-type: task
mutation: lifecycle
id: T-134
---

# T-134 中间档完成提醒卡末行收合为单行

状态: completed
关联: R-01-021/AC-08 → 窗格渲染器；R-01-002/AC-09、R-01-002/AC-08（措辞限定）
风险等级: standard

## 背景与目标

东家实测提出：中间档的完成提醒卡末行两行内容（「已完成」胶囊行 +「继续对话，或移入历史」与「移入历史」按钮行）冗余，希望收合为单行——左侧「已完成」胶囊、右侧「移入历史」按钮，正文不再显示；完整呈现档维持两行结构不变。R-01-021/AC-08 原地演进（中间档完成提醒末行的档位差异形态）。

## 差距评估

- `src/client.mjs`：`.dap-foot` 为「胶囊行 + 正文行」纵向两段固定结构；中间档仅按档位隐藏进度/统计行，无按等待类别（`data-wait`）收合末行的规则。
- PRD R-01-002/AC-09 的完成提醒末行未限定呈现档位，与演进后的 R-01-021/AC-08 并读会产生档位口径冲突，需同次加「完整呈现档」限定。

## 收敛方案

- `src/client.mjs`：新增中间档完成提醒卡的纯 CSS 收合规则——`.dap-foot` 改横向单行，`.dap-await-head`/`.dap-note-row` 以 `display: contents` 释放为同行 flex 项，「已完成」胶囊居左、`.dap-confirm` `margin-left: auto` 居右、`.dap-note` 隐藏；DOM 结构与 JS 渲染逻辑零改动（档位仍由窗格根属性纯 CSS 承载）。
- PRD：R-01-021/AC-08 补中间档完成提醒收合句；R-01-002/AC-09 限定完整呈现档、R-01-002/AC-08 补正文不显示时可见胶囊承载同一脉冲的口径。
- DESIGN：窗格渲染器「卡片紧凑呈现」条目与 DOMAIN「显示档位」词条同步收合口径。

## 测试计划

- `pnpm build:client && pnpm check`（bundle 契约含新 CSS 规则断言）。
- `node e2e/run.mjs compact-density`（中间档完成卡单行断言 + 完整档两行回归）。
- `pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：中间档完成提醒卡末行收合为单行（CSS 档位规则），完整档两行结构不变 | UNIT/E2E | update | 产品契约与内部结构条目同步 |
| R-01-021/AC-08 | 改写：中间档完成提醒卡末行收合为单行（胶囊左、按钮右、正文不显示） | E2E | update | `e2e/specs/compact-density.mjs#R-01-021/AC-08`（完成卡末行单行断言）+ `scripts/check.mjs` bundle 契约 |
| R-01-002/AC-08 | 措辞澄清：正文行不显示的中间档完成提醒卡由可见胶囊承载同一脉冲节奏（行为不变） | E2E | update | `e2e/specs/compact-density.mjs#R-01-002/AC-08`（中间档胶囊 dap-pulse 断言） |
| R-01-002/AC-09 | 措辞澄清：完成提醒末行两行结构限定完整呈现档（完整档行为不变） | E2E | update | `e2e/specs/compact-density.mjs#R-01-002/AC-09`（完整档两行结构 + 正文/按钮可见基线断言） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：中间档完成提醒卡末行为单行，胶囊居左、按钮居右 | `e2e/specs/compact-density.mjs#R-01-021/AC-08`、`src/client.mjs::cardChildren` |
| 异常 | 适用：阻塞/错误提醒卡不收合（收合选择器以 data-wait="done" 作用域，经 bundle 契约断言）；非法档位回退完整呈现 | `scripts/check.mjs#R-01-021/AC-08`、`src/core.mjs::normalizeDensity` |
| 边界配置 | 适用：完整档维持两行结构、紧凑档整体隐藏末行 | `e2e/specs/compact-density.mjs#R-01-021/AC-02`、`src/client.mjs::cardChildren` |
| 副作用 | 适用：纯 CSS 档位形态，不改渲染签名与激活跳转；末行脉冲载体胶囊仍随 dap-pulse 闪烁、按钮不闪 | `scripts/check.mjs#R-01-002/AC-08`、`src/client.mjs::syncAwaitPulse` |

## 终态与证据

- 实现: `src/client.mjs` 新增中间档完成提醒卡纯 CSS 收合规则（4 条，均以 `[data-density="medium"] .dap-card[data-kind="awaiting"][data-wait="done"]` 作用域）：`.dap-foot` 改横向单行（row + center），`.dap-await-head`/`.dap-note-row` 以 `display: contents` 释放为同行 flex 项，「已完成」胶囊居左、`.dap-confirm` `margin-left: auto` 居右、`.dap-note` 隐藏；DOM 与 JS 渲染逻辑零改动，完整档两行结构与紧凑档整体隐藏不变。
- 测试: `pnpm verify` 全量通过——17 个 E2E spec；compact-density 扩展：中间档完成卡单行断言（胶囊/按钮可见、正文隐藏、同行、胶囊居左、胶囊 dap-pulse）与完整档两行基线（正文/按钮可见、`sameRow === false`）；check.mjs 新增 4 条收合规则 bundle 契约断言；agentmap lint 156 AC 全锚定；test-impact 记录 `~R-01-002/AC-08`、`~R-01-021/AC-08`。
- DESIGN 对照: 产品契约「卡片紧凑呈现」、窗格渲染器模块条目与 DOMAIN「显示档位」词条同步中间档收合口径；PRD R-01-021/AC-08 改写、R-01-002/AC-09 限定完整呈现档、R-01-002/AC-08 补正文不显示时可见胶囊承载同一脉冲——map 与 code 对照无差异。
- commit: 4868992
- review:
  - 审核方: Standards reviewer `c68df95f-f274-4bc3-bd7c-41a6627f6dce`；Spec reviewer `b7110522-4d8f-4676-b16f-a1b54f72133f`（`code-review` skill 并行双轴）
  - 目的理解: R-01-021/AC-08 演进后，中间档完成提醒卡末行收合为单行——「已完成」胶囊居左、「移入历史」按钮居右、正文不显示；完整档维持两行、紧凑档整体隐藏末行；收合为纯 CSS 档位形态（`data-wait="done"` 作用域），DOM 复用与激活跳转不感知档位；关联约束为 R-01-002/AC-08（胶囊脉冲、按钮不闪）与 AC-09（完整档两行结构）的档位口径一致性。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `65282dd...4868992`；修复提交 db8e81f 后由同一审核方基于 `65282dd...HEAD` 复审。
  - 问题与修复: Standards 轴 3 项——bundle 契约覆盖不全（2/4 规则）补齐 4 条断言；footLayout 魔数容差命名 `ROW_TOLERANCE_PX`；CSS 长前缀维持现状（成文约定覆盖基线，取舍记入提交正文）。Spec 轴 4 项——完整档两行结构补 `sameRow === false` 断言；验证矩阵「异常」行证据由错引的 error-reminder.mjs 改指 check.mjs 契约；PRD R-01-002/AC-08 补正文不显示时可见胶囊承载同一脉冲口径并以 e2e `capsulePulse` 断言锚定；check.mjs 断言消息与断言范围对齐。
  - 复审结论: Standards 轴 3 条与 Spec 轴 4 条 finding 经同一审核方复审全部关闭，双轴通过；无新 finding（Spec 轴残留非阻塞 nitpick：bundle 契约为选择器字符串存在性断言，与仓库既有模式一致）。
