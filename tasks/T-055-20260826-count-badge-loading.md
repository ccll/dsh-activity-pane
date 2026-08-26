---
doc-type: task
mutation: lifecycle
id: T-055
---

# T-055 数量标识在途显示加载指示

状态: active
关联: R-01-014/AC-06 / 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈「活动会话 n/m 胶囊在未加载到数据时一直显示 0/0」，要求与其它位置的加载过程一致显示加载转圈动画，数据就绪后再显示实际计数。当前行为违反 R-01-014 立意（应能分辨「数据正在加载」与「确实没有数据」）：列表在途时三处数量标识（列头 `.dap-count`、窄条 `.dap-rail-count`、移动端开关 `.dap-toggle-count`）直接渲染 `0/0`，冒充空态计数。UI/UX 改进走全链：PRD R-01-014 新增 AC-06、DESIGN「加载状态模型」新增计数级条目，由东家当次请求直接确认。

## 差距评估

- 渲染轮中计数写入不区分 `listState`：`awaitBadgeStats(active)` 在快照缺失/在途时得 `0/0`，三处徽标照常写入文本与 aria 文案。
- 既有加载指示惯例为 `dap-spinner`（列表区状态行、区头行内指示、卡片字段级），数量标识未接入。
- 加载态下 aria-live 播报「0 个活动会话」同样冒充已就绪语义。
- 错误态（`listState === "error"`）不在本次范围，维持原 0/0 呈现。

## 收敛方案

- `src/core.mjs`：新增 `countBadgeState(listState, waiting, total)` 纯函数——loading 归一为 `{ mode: "loading", ariaText: "活动会话计数加载中", awaiting: false }`；否则归一为 `{ mode: "count", text: "n/m", ariaText, awaiting }`（沿用既有文案口径）。不触碰 DOM，可单测。
- `src/client.mjs`：渲染轮计数段改用 `countBadgeState`；loading 时三处徽标 `replaceChildren(makeEl("span", "dap-spinner"))`（已是指示则不重写避免抖动），就绪时恢复文本写入路径；`data-awaiting` 与脉冲周期随 `awaiting` 归一。
- `scripts/check.mjs`：新增 R-01-014/AC-06 单元断言（loading/error/ready 三轴归一）与 bundle 契约断言。
- `scripts/acceptance.mjs`：新增 AC-06 人工验收步骤（慢列表下三处徽标显示转圈、就绪后显示实际 n/m）。

## 测试计划

- `scripts/check.mjs`：`countBadgeState` 三轴单元断言 + bundle 契约断言（三处徽标在途接入 spinner、aria 加载文案），锚定 R-01-014/AC-06。
- `scripts/acceptance.mjs`：AC-06 人工步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：列表在途时三处数量标识显示加载指示，就绪后显示实际 n/m | `scripts/check.mjs#R-01-014/AC-06`、`scripts/acceptance.mjs#R-01-014/AC-06`、`src/core.mjs::countBadgeState` |
| 异常 | 适用：列表错误轴不归一为加载指示，维持原呈现 | `scripts/check.mjs#R-01-014/AC-06`、`src/core.mjs::countBadgeState` |
| 边界配置 | 适用：等待响应计数在加载态不触发脉冲与 `data-awaiting`；就绪后 0/0 空态仍按 R-01-001/AC-06 显示 | `scripts/check.mjs#R-01-014/AC-06`、`src/client.mjs::setCountBadgeContent` |
| 副作用 | 适用：就绪态文本写入路径、aria-live 去重、脉冲周期逻辑不变 | `scripts/check.mjs#R-01-014/AC-06`、`src/client.mjs::setCountBadgeContent` |

## 终态与证据
