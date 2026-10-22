---
doc-type: task
mutation: lifecycle
id: T-176
---

# T-176 紧凑档完成提醒卡 ✓ 确认按钮

状态: active
关联: R-01-021、R-01-002
风险等级: major
风险面: 无（升档依据：语义行数超过阈值，见终态证据语义行数行）

## 背景与目标

东家立项（2026-10-22）：最简显示档（compact）下完成提醒卡没有任何确认入口（AC-02 原文明确隐藏「移入历史」按钮），确认须先切档，空间又受紧凑行宽硬约束；东家拍板在标题行最右端放 ✓ 图标按钮（C-098）。属于 UI/UX 改进，走全链：PRD R-01-002/AC-10 改写为覆盖三档形态、R-01-021/AC-02 改写紧凑例外，均已东家确认。

现状与期望差距：紧凑档确认按钮整体不可达；`.dap-confirm` 挂在末行 `noteRow` 内，被紧凑档 `.dap-foot` 整体隐藏规则连带隐藏，无标题行形态。

## 差距评估

- PRD：R-01-021/AC-02 无紧凑例外条款；R-01-002/AC-10 未覆盖紧凑形态（已同次改写，均东家确认）。
- SOLUTION：卡片紧凑呈现段与窗格渲染器条目未承载 `.dap-confirm-icon`（已同步）。
- 代码：`src/client.mjs` awaiting 骨架 `row` 无确认按钮节点；CSS 无图标按钮形态。
- 测试：无紧凑下 ✓ 显隐/最右定位/激活迁移断言。

## 收敛方案

1. `src/client.mjs`：`cardChildren("awaiting")` 在标题行 `.dap-row` 末尾（`dap-total-time` 之后）追加 `makeConfirmIconButton()`——`aria-label`「移入历史」的图标按钮，内嵌 `createCapsuleIcon("done")` 对勾几何（与「已完成」胶囊共用字形）；`renderCard` awaiting 分支按陈旧骨架就地补建惯例补建缺失节点，每帧按 `data-density === "compact" && waitClass === "done"` 双条件赋 `hidden`，绑定与 `.dap-confirm` 同款（click preventDefault+stopPropagation、keydown stopPropagation、`dataset.bound` 只绑一次、`ackCompletion(id)`）。
2. CSS：`.dap-confirm-icon` 复用 `.dap-confirm` 压暗色调与 radius，方形内缩布局（icon 12px + padding；按钮 margin-box 20px 使标题行框 16→20px，增高 ≤4px），hover 提亮同族；伪元素透明外扩触屏命中区至 24×24、视觉盒不变。
3. 测试：`e2e/specs/compact-density.mjs` 增紧凑档断言——✓ 按钮可见、位于行内右缘信息之后（最右端）、点击后卡片迁入最近历史区且不跳转；完整/中间档该节点隐藏。

## 测试计划

- E2E（e2e/specs/compact-density.mjs）锚定 R-01-021/AC-02（改写后）、R-01-021/AC-09 与 R-01-002/AC-10：紧凑下 done 卡标题行 ✓ 按钮可见且位于累计时长之后（右缘）；点击后活动区完成卡计数下降（迁移动画收口）；medium 档 `.dap-confirm-icon` display:none（形态互斥复核）。
- MANUAL：桌面壳层 + 移动端 UA（390×844，WebKit）浏览器实测黄金路径——紧凑切换 → ✓ 可见可点 → 确认后卡片入最近历史。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：紧凑档确认入口（契约 bullet、卡片紧凑呈现段、渲染器条目） | E2E | update | `e2e/specs/compact-density.mjs` 新增紧凑 ✓ 断言 |
| R-01-021/AC-02 | 修改：末行隐藏条款扩为「与末行」，新增完成提醒卡例外（标题行最右端 ✓ 图标按钮） | E2E | 保留+新增 | 紧凑下 `.dap-foot` 隐藏断言保留；新增 ✓ 显隐/定位/激活断言 |
| R-01-002/AC-10 | 修改：形态从单档文字扩展为三档形态（完整/中间文字、紧凑 ✓ 图标），激活行为承诺不变 | E2E | 保留+新增 | 点击解除+迁移+不跳转断言沿用 completion-sync（full 档）与 compact-density 新增（compact 档） |
| R-01-002/AC-05～AC-08、AC-11～AC-13 | 不变 | UNIT+E2E | 保留 | 状态通道、脉冲、错误提醒、游标持久化语义不变 |
| R-01-021/AC-01、AC-04～AC-08 | 不变 | E2E | 保留 | 循环切换、滚动锚定、激活跳转、持久化断言不动 |
| R-01-025/AC-05～AC-08 | 不变 | E2E | 保留 | `.dap-confirm-icon` 为按钮节点显隐赋值，不新增隐藏内容的构建，低档静默门禁不受影响 |
| SOLUTION | 方案层核对：收口对照核验后更新 frontmatter 核对日期（无契约变化） | E2E | 保留 | 关闭时对照核验（374/474 行紧凑呈现与实现一致、149 行契约行一致）；核对日期更新为 2026-10-22 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：紧凑档确认入口黄金路径——✓ 按钮呈现、可访问名称、最右定位、激活迁入最近历史区 | `e2e/specs/compact-density.mjs#R-01-021/AC-09`、`scripts/check.mjs#R-01-021/AC-09`、`src/client.mjs::makeConfirmIconButton` |
| 异常 | 适用：陈旧骨架缺失节点的就地补建与重复绑定防护；激活冒泡不误触卡片跳转 | `src/client.mjs::makeConfirmIconButton`、`src/client.mjs::renderCard`、`scripts/check.mjs#R-01-021/AC-09` |
| 边界配置 | 适用：三档形态互斥（完整/中间档节点隐藏）；紧凑行宽极窄时按钮仍贴右缘 | `e2e/specs/completion-sync.mjs#R-01-002/AC-10`、`scripts/check.mjs#R-01-002/AC-10`、`src/client.mjs::renderCard` |
| 副作用 | 适用：末行脉冲、排序、持久化与低档静默门禁等既有语义不变 | `scripts/check.mjs#R-01-002/AC-08`、`e2e/specs/compact-density.mjs#R-01-021/AC-03`、`src/client.mjs::createCapsuleIcon` |
| 兼容性 | 适用：localStorage 档位持久化与刷新恢复不受影响 | `e2e/specs/compact-density.mjs#R-01-021/AC-06`、`scripts/check.mjs#R-01-021/AC-06`、`src/client.mjs::writeStoredDensity` |

## 自查清单

- [ ] 边界：紧凑行宽极窄（接近 200px 下限）时 ✓ 按钮仍位于标题行内右缘、不溢出卡片（gap 断言 + 行框增高 ≤4px 样式纪律：16→20px，按钮 margin-box 主导）。
- [ ] 异常路径：陈旧骨架缺 `confirmIcon` 时就地补建于 `dap-total-time` 之后；`dataset.bound` 保证重复渲染不重复绑定。
- [ ] 异常路径：keydown 激活同样阻断冒泡，不触发卡片跳转。
- [ ] 回归影响：末行文字按钮（`textContent「移入历史」`、脉冲互斥）与中间档收合契约不变，`check.mjs` 原断言全数保留。

## 终态与证据

- 实现: 待填
- 测试: 待补
- SOLUTION 对照: 待补
- commit: 待补
