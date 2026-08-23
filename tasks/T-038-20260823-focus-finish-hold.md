---
doc-type: task
mutation: lifecycle
id: T-038
---

# T-038 响应保持扩展到当前焦点下运行结束的会话

状态: active
关联: R-01-010 → 活动状态模型
风险等级: standard

## 背景与目标

东家 GUI 验收发现：焦点从未离开的当前会话结束一轮后，卡片直接移入历史区而非以「需要响应」保持。根因：宿主只在「完成时未被选中」才置 `completed`，当前焦点下运行结束的会话不置 `completed`，T-037 的保持登记只覆盖「完成提醒卡被打开」路径。东家确认语义统一为：主会话结束一轮后只要仍在当前焦点，即以「需要响应」留在活动区，焦点离开才视作完成（PRD R-01-010/AC-06 改写、DOMAIN 响应保持词条改写、DESIGN 同步，两闸均已确认）。

## 差距评估

- `src/core.mjs`：`updateCompletedHolds` 第三参 `prevCompletedIds` 只接受上一帧完成提醒 id，无「上一帧自身活动主会话在当前焦点下变为非活动」的登记规则。
- `src/client.mjs`：`prevCompletedAwaitingIds` 只收集 `pendingText === "需要响应"` 的条目；点击路径的即时登记在规则泛化后成为冗余第二路径（DESIGN 已确认收敛为纯函数单点）。
- `scripts/check.mjs`：缺「焦点下运行结束 → 登记保持」锚点。

## 收敛方案

- `src/core.mjs`：`updateCompletedHolds` 第三参泛化为 `prevActiveIds`（上一帧自身活动的主会话 id）；登记规则：id 为当前会话、行存在、非子代理、且 `!isOwnActiveRow`（仍在运行/等待的不误登记）；同帧 `completed && current` 兜底与解除规则不变。
- `src/client.mjs`：`prevCompletedAwaitingIds` 泛化为 `prevActiveMainIds`（kind ∈ {running, awaiting} 的条目 id）；移除点击路径的即时登记块。
- `scripts/check.mjs`：R-01-010/AC-06 锚点补焦点下运行结束系列断言（运行中不误登记、结束即登记、awaiting 呈现、不入历史区、非当前不登记、子代理不登记）。
- `scripts/acceptance.mjs`：人工步骤补当前焦点下完成一轮的保持验收。

## 测试计划

- 测试先行：先补锚点（红），再实现转绿。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：当前焦点下运行结束的会话以「需要响应」保持；切走后解除并动画迁移 | `scripts/check.mjs#R-01-010/AC-06`、`scripts/acceptance.mjs#R-01-010/AC-06`、`src/core.mjs::updateCompletedHolds`、GUI 现场验收 |
| 异常 | 适用：宿主原子帧时序与快照在途行为不回退（沿用 T-037 锚点） | `scripts/check.mjs#R-01-002/AC-05`、`src/core.mjs::updateCompletedHolds` |
| 边界配置 | 适用：仍在运行/等待时不误登记；非当前会话结束不登记；子代理焦点下结束不登记 | `scripts/check.mjs#R-01-010/AC-06`、`src/core.mjs::isOwnActiveRow` |
| 副作用 | 适用：保持态仍为易失内存态；既有完成提醒路径行为不变（T-037 锚点全绿） | `scripts/check.mjs#R-01-002/AC-05`、`scripts/check.mjs#R-01-010/AC-06`、`src/client.mjs::updateCompletedHolds` |

## 终态与证据

（待关闭时填写）
