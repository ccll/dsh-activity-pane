---
doc-type: task
mutation: lifecycle
id: T-076
---

# T-076 等待双类脉冲行为一致化

状态: completed
关联: R-01-002/AC-06、AC-07、AC-08 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

C-028 曾把等待行动按阻塞性分两类呈现：阻塞等待脉冲催促、完成提醒静止降噪，并否决「已完成卡保留脉冲」与「任一等待即徽标脉冲」两条方案。东家实测发现完成提醒因静止呈现长期不被注意，要求两类等待的闪烁提醒完全一致。东家已确认翻案（C-037）：完成提醒卡与阻塞等待卡同频同相脉冲、描边光晕不弱化；数量徽标存在任一等待行动主会话即脉冲、频率按等待行动占比加快。

## 差距评估

- `src/core.mjs`：`countBadgeState` 返回 `blocked` 字段供渲染层门控脉冲（`awaiting` 琥珀底色由 `waiting > 0` 决定，门控发生在 client 读 `badge.blocked` 写 `data-blocked` 并以 `awaitPulsePeriod(blocked, total)` 计周期）；`awaitPulsePeriod` 按阻塞等待占比映射周期。
- `src/client.mjs` CSS：`[data-kind="awaiting"][data-wait="done"]` 卡片描边/光晕弱化、`.dap-dot` `animation: none` 静止；徽标脉冲由 `[data-awaiting][data-blocked]` 组合选择器门控；渲染层向徽标写 `data-blocked`。
- `scripts/check.mjs`：现有断言反向固化「完成提醒不脉冲、blocked 才触发徽标脉冲、done 卡弱化」旧契约。

## 收敛方案

- AgentMap：已演进——PRD R-01-002 陈述与 AC-06/AC-07/AC-08 改写；DOMAIN「完成提醒」与不变量更新；DESIGN 徽标脉冲紧迫度与等待双类呈现更新；DECISIONS 追加 C-037 翻案 C-028。
- `src/core.mjs`：`countBadgeState` 脉冲门控改为任一等待行动即脉冲；`awaitPulsePeriod` 周期按等待行动占比（waiting/total）映射；`awaitBadgeStats` 的 blocked 统计如无消费者则随门控移除一并删除。
- `src/client.mjs`：删除 `[data-wait="done"]` 的静止/弱化规则，完成提醒卡徽标与状态点随卡脉冲、描边光晕与阻塞等待一致；徽标脉冲选择器与 `data-blocked` 写入如无消费者则删除。
- 测试先行：先改写 `scripts/check.mjs` 中 R-01-002/AC-06/07/08 锚定断言为失败态，再实现转绿。

## 测试计划

- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 刷新现有 `http://127.0.0.1:3080/` 现场验证：完成提醒卡徽标与状态点脉冲、描边光晕与阻塞等待卡一致；仅存在完成提醒时数量徽标脉冲且频率随占比变化。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：任一等待行动（含仅完成提醒）触发卡片与徽标同频同相脉冲；频率按 waiting/total 单调加快 | `scripts/check.mjs#R-01-002/AC-06`、`scripts/check.mjs#R-01-002/AC-08`、`src/core.mjs::countBadgeState` |
| 异常 | 适用：无等待行动时徽标不脉冲；loading 态不脉冲 | `scripts/check.mjs#R-01-002/AC-06`、`src/core.mjs::countBadgeState` |
| 边界配置 | 适用：全部为完成提醒时达到脉冲频率上限；blocked 占比 0 时仍脉冲 | `scripts/check.mjs#R-01-002/AC-07`、`src/core.mjs::awaitPulsePeriod` |
| 副作用 | 适用：阻塞等待卡图标/文案/确认按钮差异保留；`data-wait` 类别属性保留；完成确认语义不变 | `scripts/check.mjs#R-01-002/AC-09`、`scripts/check.mjs#R-01-002/AC-10`、`src/core.mjs::buildEntries` |
| 兼容性 | 适用：当前会话蓝色高亮仍压过等待卡样式；深浅主题配色不变 | `scripts/check.mjs#R-01-002/AC-08`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/core.mjs` 的 `countBadgeState` 移除 `blocked` 返回字段（blocked 入参仅供 aria 计数说明），`awaitPulsePeriod` 入参语义改为等待行动数；新增核心纯函数 `awaitBadgeFlash(waitClass)` 单点承载两类等待徽标闪烁判定；`src/client.mjs` 删除 `[data-wait="done"]` 描边光晕弱化与状态点静止规则、三处徽标脉冲选择器改由 `data-awaiting` 承载并移除 `data-blocked` 写入，渲染层以 `awaitPulsePeriod(waiting, total)` 计周期；`.dsh-plugin/client.js` 已重建（HMR 热装生效，无需重启 dsh web）。
- 测试: `pnpm build:client && pnpm check` 通过（闪烁判定四值行为断言、仅完成提醒时徽标脉冲、周期按等待行动占比单调加快、data-blocked 归零等 R-01-002/AC-06/07/08 锚点）；`python3 tools/agentmap_lint.py --report` 通过（requirements=22、acceptance-criteria=127、test-anchored=127）；`git diff --check` 通过；`node scripts/acceptance.mjs` 可生成完整 92 项验收清单。GUI 目验项（完成提醒卡脉冲观感与徽标频率）无 CDP 通道可由东家现场验收。
- DESIGN 对照: `DESIGN.md` 徽标计数与脉冲紧迫度、等待双类呈现两节与实现一致——脉冲门控为任一等待行动、周期按 waiting/total 映射、完成提醒卡与阻塞等待卡脉冲/描边/光晕一致，`data-wait` 仅承载图标/文案/确认按钮差异；与 PRD R-01-002/AC-06、AC-07、AC-08 及 DOMAIN 不变量双向一致。
- commit: ff30037d11eba69f4f2e1425ea291eb4ed99c20b
- review:
  - 审核方: Standards reviewer `5e832412-72f1-4673-86f9-03848510c11d`；Spec reviewer `8c26b526-79ad-46d5-86c9-3d9a2adc7ca3`
  - 目的理解: 按 C-037 翻案 C-028，使完成提醒与阻塞等待的注意力信号完全一致（徽标/状态点同频同相脉冲、描边光晕同强度、任一等待行动触发徽标脉冲且频率按 waiting/total 映射），保留图标/文案/确认按钮与完成确认语义差异。
  - 执行方式: `code-review` skill 双轴并行审核，评审基线 `HEAD~1...HEAD`（初始 57c0902，修复后 amend 为 ff30037d11eba69f4f2e1425ea291eb4ed99c20b 并复审）。
  - 问题与修复: Spec 初审 1 项（周期测试注释/断言文案残留「阻塞等待占比」旧契约表述）→ 改写为「等待行动占比」canonical term，同一 reviewer 复审关闭；Standards 初审 3 项——①AC-08 仅有源码形状断言缺可执行行为证据 → 闪烁判定收敛为核心纯函数 `awaitBadgeFlash` 并补四值行为断言，②T-076 差距评估对旧门控位置陈述失实 → 修正为 client 侧 badge.blocked/data-blocked 门控的事实表述，③周期测试术语未同步 → 与 Spec finding 同一修复；同一 reviewer 复审确认三项全部关闭。
  - 复审结论: 两轴最终均通过；无未解决 hard violation、smell、Spec 缺失或 scope creep。
