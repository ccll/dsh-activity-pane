---
doc-type: task
mutation: lifecycle
id: T-134
---

# T-134 中间档完成提醒卡末行收合为单行

状态: active
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

（待实现后填写）
