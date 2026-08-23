---
doc-type: task
mutation: lifecycle
id: T-029
---

# T-029 移动端浮动开关移位与改名

状态: active
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

（待关闭时填写）
