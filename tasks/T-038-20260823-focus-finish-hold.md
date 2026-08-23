---
doc-type: task
mutation: lifecycle
id: T-038
---

# T-038 响应保持扩展到当前焦点下运行结束的会话

状态: completed
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

- 实现: `src/core.mjs`——`updateCompletedHolds` 第三参泛化为 `prevActiveIds`，登记规则统一为「上一帧自身活动（running/awaiting）的主会话在当前焦点下变为非活动即登记」，加 `!isOwnActiveRow` 守卫（仍在运行/等待不误登记），同帧 `completed && current` 兜底、快照在途保留与解除规则不变。 `src/client.mjs`——`prevCompletedAwaitingIds` 泛化为 `prevActiveMainIds`（kind ∈ running|awaiting），移除点击路径冗余即时登记（收敛纯函数单点），`heldCompletedIds` 注释与 DOMAIN 词条同步。`scripts/check.mjs` R-01-010/AC-06 锚点新增焦点下结束与等待解除系列断言；`scripts/acceptance.mjs` 补人工步骤。
- 测试: 测试先行（新锚点先红——「仍在运行时不登记保持」即红，实现后转绿）；`pnpm build:client && pnpm check` 全部断言通过；`python3 tools/agentmap_lint.py --report` 通过（19 需求 / 83 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收（当前焦点下完成一轮保持、切走动画迁移）由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「显示过滤 → 响应保持」（两条进入路径 + 等待解除口径）、「关键机制 → 响应保持与迁移动画」（纯函数单点登记）、窗格渲染器模块「响应保持登记与迁移检测」逐条一致；PRD R-01-010/AC-06、DOMAIN 响应保持词条同步改写，无差异。
- commit: 863a7c6a89ae1167a945ebec7fb9e24c00fd4a54
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 dca93bf8、Spec 子代理 321e4851，code-review skill 流程）
  - 目的理解: T-038 把 T-037 响应保持从「完成提醒卡被打开」扩展到「当前焦点下运行结束」（宿主只在完成时未选中才置 completed），统一语义为主会话结束一轮后仍为当前会话即以「需要响应」留在活动区、切走解除；登记收敛纯函数单点并移除点击冗余登记；关联 PRD R-01-010/AC-06、DOMAIN 响应保持词条、DESIGN 同步条目；预期验证为 `pnpm build:client && pnpm check` 与 agentmap lint（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线为工作树 `git diff HEAD`（实现提交前，基线 d86ab2d），范围含 src/、scripts/、PRD/DESIGN/DOMAIN、tasks/T-038 与生成产物一致性。
  - 问题与修复: Standards 轴——无硬违规，1 条建议采纳（heldCompletedIds 注释与 DOMAIN 词条同步）、1 条维持（prevActiveIds/prevActiveMainIds 命名差异，reviewer 自标注可不改）；Spec 轴——无缺失无实现错误，1 项 scope 口径（pendingInteraction 焦点下解除转空闲被登记保持）经确认为预期行为并显式锚定（新增两条断言 + DESIGN 口径说明），1 项注释漂移（同 Standards 轴，已修）；首轮重点核查 T-037 回退风险（原子帧时序、快照在途、子代理/母会话 parent 边界）逐项无回退。
  - 复审结论: 双轴复审均通过，无未决 finding。
