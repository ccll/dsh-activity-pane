---
doc-type: task
mutation: lifecycle
id: T-029
---

# T-029 移动端浮动开关移位与改名

状态: completed
关联: R-01-008/AC-02、R-01-008/AC-04、R-01-008/AC-05 / 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈：移动端「活动会话」浮动开关（`top:12px; right:12px`）遮盖 dsh-better-sidebar 右边栏的切换按钮组（`.toggleCluster`：`top:3px; right:10px`），且文案偏长。经东家确认（位置选项 + map 闸口）升级为 R-01-008/AC-04、AC-05：

- 浮动开关移到会话头部左上角、原生左边栏切换按钮（`[data-mobile-nav="toggle"]`，28×28 @ `left:8px; top:12px`）右侧，即 `top:12px; left:44px`；文案「活动会话」→「活动」。
- 抽屉从左侧滑出（宽 `min(84vw,320px)`），开关移位后抽屉打开时会压在抽屉头部标题上，故抽屉打开期间隐藏浮动开关，关闭后恢复；关抽屉由抽屉头部 × 与透明遮罩承担（AC-03 不变，AC-02 随之去掉「再次点击开关收起」）。

## 差距评估

- `src/client.mjs`：`.dap-toggle` 定位 `top:12px; right:12px` → `top:12px; left:44px`；开关文案改名；`togglePane` 单点同步开关显隐（`data-drawer-open`），CSS 在打开态隐藏开关。
- check.mjs / acceptance.mjs 对开关位置与文案无既有断言，需新增锚定。
- 数据层、DOM 结构、桌面形态均不变。

## 收敛方案

- CSS：`.dap-toggle` 改 `top:12px; left:44px`（8+28+8 间隔）；新增 `[data-dsh-activity-pane]` 无关的兄弟规则——打开态经开关自身 `data-drawer-open` 属性 `display:none`；z-index 注释同步修正（不再需要位于遮罩之上）。
- JS：开关文案 `<span>活动</span>`；`togglePane(open)` 内 `toggle.toggleAttribute("data-drawer-open", open)`。
- 卸载清理路径不变（开关整体移除）。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言——开关定位 `left: 44px`、不再含旧 `right: 12px` 定位、文案「活动」、打开态隐藏规则存在（锚定 R-01-008/AC-04、AC-05）。
- `scripts/acceptance.mjs`：新增 R-01-008/AC-04、AC-05 人工验收步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关位于左上角左边栏切换按钮右侧、文案「活动」，不再与右边栏切换按钮组叠盖；抽屉打开时开关隐藏、关闭恢复 | `scripts/check.mjs#R-01-008/AC-04`、`scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::CSS`、`src/client.mjs::togglePane` |
| 异常 | 不适用：纯呈现与显隐调整，无数据/失败路径 | — |
| 边界配置 | 适用：桌面断点外开关仍由媒体查询隐藏，不受新定位影响；无左边栏切换按钮时开关仍在左上角固定位置可用 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：抽屉/遮罩/卡片交互不变，卸载清理不残留 | `scripts/check.mjs#R-01-008/AC-03`、`src/client.mjs::togglePane` |

## 终态与证据

- 实现: `src/client.mjs` 浮动开关定位改 `top:12px; left:44px`（左上角、左边栏切换按钮右侧），文案「活动会话」→「活动」；`togglePane` 单点同步开关 `data-drawer-open`，CSS 新增 `.dap-toggle[data-drawer-open] { display: none; }`（移动媒体查询内）；遮罩注释与 z-index 说明同步修正；`.dsh-plugin/client.js` 重新生成。
- 测试: `pnpm build:client && pnpm check` 通过（`scripts/check.mjs` 新增 R-01-008/AC-04 定位/文案断言与 AC-05 显隐断言）；`python3 tools/agentmap_lint.py --report` 通过（18 需求 / 71 AC / 锚定 71 / design-covered 18）；`scripts/acceptance.mjs` 更新 AC-02/AC-03 步骤并新增 AC-04/AC-05 人工验收步骤，真实视觉结果仍需人工 GUI 验收。
- DESIGN 对照: 「边界与对外契约」移动端段（开关定位、打开时隐藏）与「窗格渲染器」模块条目（togglePane 显隐单点、AC-03 交互一致性措辞）已同步；R-01-008 需求追溯索引行保持准确；DESIGN 与实现对照无差异。
- commit: ba34f7b
- commit: aabec00
- review:
  - 审核方: Standards 子代理 `0a86ee14-2fe5-4940-9cf0-3c8462168bc9`；Spec 子代理 `c61c96fa-f468-428f-9824-77bbea273e28`。
  - 目的理解: 移动端浮动开关原位于右上角遮盖 dsh-better-sidebar 右边栏切换按钮组，需移到会话头部左上角左边栏切换按钮右侧并缩短文案为「活动」；抽屉打开时隐藏开关（避免压抽屉头部标题），关闭路径由 × 与遮罩承担；约束为 R-01-008/AC-02~AC-05、AgentMap 全链纪律、strict 测试锚定与 bundle 同步再生成门禁。
  - 执行方式: `code-review` skill；固定基线 `4e2f4ce`，范围为 `git diff 4e2f4ce...HEAD`（ba34f7b 实现 + aabec00 注释清理）；Standards/Spec 双轴并行审核。
  - 问题与修复: 执行 agent 自查发现 `togglePane` 旧注释行未随锚点范围移除（重复注释），以 aabec00 修复。Standards 三条 judgement call（left:44px 第三方几何硬耦合、check.mjs 精确 CSS 串断言脆性、「活动」与 DOMAIN「活动会话」命名微差）均为 commit 取舍已记录的有意权衡或既有文件风格，非阻断，不修。Spec 无缺失、无实质 scope creep、断言与产物逐字一致。
  - 复审结论: Standards 通过（无 hard finding）；Spec 通过；无遗留 finding，无需复审。
