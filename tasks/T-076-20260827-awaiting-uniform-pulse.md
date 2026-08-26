---
doc-type: task
mutation: lifecycle
id: T-076
---

# T-076 等待双类脉冲行为一致化

状态: active
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

（完成时填写）
