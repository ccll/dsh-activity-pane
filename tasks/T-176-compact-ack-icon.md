---
doc-type: task
mutation: lifecycle
id: T-176
---

# T-176 紧凑档完成提醒卡 ✓ 确认按钮

状态: completed
关联: R-01-021、R-01-002
风险等级: major
风险面: 无（升档依据：语义行数超过阈值，见终态证据语义行数行）

## 背景与目标

东家立项（2026-10-22）：最简显示档（compact）下完成提醒卡没有任何确认入口（AC-02 原文明确隐藏「移入历史」按钮），确认须先切档，空间又受紧凑行宽硬约束；东家拍板在标题行最右端放 ✓ 图标按钮（C-098）。属于 UI/UX 改进，走全链：PRD R-01-002/AC-10 改写为覆盖三档形态、R-01-021/AC-02 改写紧凑例外，均已东家确认。

执行期间全量 e2e 因上游 dsh-web-mobile@3.2.1 移动壳层新增顶部标签页与窗格开关命中盒叠置而失败，东家裁决钉 `dsh-web-mobile@3.2.0`（最后全绿版本）不追新，决策记 C-099。

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
| SOLUTION | 方案层演进：卡片紧凑呈现段补触屏命中区 24×24 契约（复审 map 缺口收口） | E2E | 保留+新增 | `e2e/specs/compact-density.mjs` headAckState 补 pseudoBox 精确断言（R-01-021/AC-09） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：紧凑档确认入口黄金路径——✓ 按钮呈现、可访问名称、最右定位、激活迁入最近历史区 | `e2e/specs/compact-density.mjs#R-01-021/AC-09`、`scripts/check.mjs#R-01-021/AC-09`、`src/client.mjs::makeConfirmIconButton` |
| 异常 | 适用：陈旧骨架缺失节点的就地补建与重复绑定防护；激活冒泡不误触卡片跳转 | `src/client.mjs::makeConfirmIconButton`、`src/client.mjs::renderCard`、`scripts/check.mjs#R-01-021/AC-09` |
| 边界配置 | 适用：三档形态互斥（完整/中间档节点隐藏）；紧凑行宽极窄时按钮仍贴右缘 | `e2e/specs/completion-sync.mjs#R-01-002/AC-10`、`scripts/check.mjs#R-01-002/AC-10`、`src/client.mjs::renderCard` |
| 副作用 | 适用：末行脉冲、排序、持久化与低档静默门禁等既有语义不变 | `scripts/check.mjs#R-01-002/AC-08`、`e2e/specs/compact-density.mjs#R-01-021/AC-03`、`src/client.mjs::createCapsuleIcon` |
| 兼容性 | 适用：localStorage 档位持久化与刷新恢复不受影响 | `e2e/specs/compact-density.mjs#R-01-021/AC-06`、`scripts/check.mjs#R-01-021/AC-06`、`src/client.mjs::writeStoredDensity` |

## 自查清单

- [x] 边界：紧凑行宽极窄（接近 200px 下限）时 ✓ 按钮仍位于标题行内右缘、不溢出卡片（e2e `gapToCardRight` 断言 + 行框实测 20px：16→20px，按钮 margin-box 主导；headAckState 断言 box 20×18 / pseudoBox 24×24）。
- [x] 异常路径：陈旧骨架缺 `confirmIcon` 时就地补建于 `dap-total-time` 之后（client.mjs:3756-3760）；`dataset.bound` 保证重复渲染不重复绑定（client.mjs:3764-3765，bundle 契约断言 check.mjs:3842-3846）。
- [x] 异常路径：keydown 激活同样阻断冒泡，不触发卡片跳转（client.mjs:3773 keydown stopPropagation；复审核验确认绑定存在）。
- [x] 回归影响：末行文字按钮（`textContent「移入历史」`、脉冲互斥）与中间档收合契约不变，`check.mjs` 原断言全数保留（check.mjs:4212-4217）。

## 终态与证据

- 实现: `src/client.mjs` `makeConfirmIconButton()`（2860-2886 区段：`dap-confirm-icon` 图标按钮、`aria-label="移入历史"`、内嵌 `createCapsuleIcon("done")` 对勾几何）+ `renderCard` awaiting 分支就地补建与 `dataset.bound` 单次绑定（3755-3777：click preventDefault+stopPropagation→`ackCompletion(id)`、keydown stopPropagation、每帧 `densityLevel === "compact" && waitClass === "done"` 双条件赋 hidden）；CSS `.dap-confirm-icon`（718-738：压暗色调复用、20px margin-box 使标题行框 16→20px、hover 提亮、`::before inset -4px -3px` 透明外扩命中区 24×24、`[hidden]` 显式覆盖）。`.dsh-plugin/client.js` 同步重建。
- 测试: `e2e/specs/compact-density.mjs` 锚 R-01-021/AC-02、AC-09 与 R-01-002/AC-10 全过——✓ 可见/可访问名称/最右定位/点击迁入最近历史且不跳转/medium 互斥/pseudoBox 精确 24×24/四缘命中/负对照；`scripts/check.mjs` 全过（骨架与 [hidden] 覆盖 bundle 断言 3840-3846、末行按钮契约 4212-4217 保留）；全量 `pnpm verify` 22/22 spec PASS（钉 dsh-web-mobile@3.2.0 后三轮复跑全绿，bash-3491）；MANUAL 双引擎黄金路径 PASS（chromium-desktop 1280×800 + webkit-mobile 390×844 UA/isMobile/hasTouch/dsf3：造卡→切紧凑→✓ 可见可点→命中区外扩点点击→卡片入历史，截图 /tmp/t176-manual/）。
- SOLUTION 对照: 需求追溯索引 R-01-002、R-01-021 主责「窗格渲染与显示档位」一致；「窗格显示档位契约」bullet（SOLUTION.md:149）、「卡片紧凑呈现」段（SOLUTION.md:374，含触屏命中区 24×24 契约）与渲染器条目（SOLUTION.md:474）与实现一致；frontmatter 核对日期 2026-10-22。
- commit: fc9d7c2（功能实现）、9152bae（审核修复：命中区 24×24 + 钉 3.2.0 + DOMAIN 同步）、884eaab（盒模型口径修正 + e2e 几何断言）、2485f29（复审收口：注释口径、伪元素几何断言、SOLUTION 契约补记）
- 语义行数: 228
- 语义行数口径: 228 为 lint task_commit_span 实测（自最早被引提交 4ce78f7 起，含文档与生成物；lint 对多提交 task 只量至最早被引提交，与 AGENTS.md「到关闭时 HEAD」的口径差记 T-177 N-1/N-5）；实现者自述口径 src+e2e+scripts 剥注释空行=126——major 定档各口径均成立
- review:
  - 审核方: 独立上下文两轮——首轮双轴子代理（Standards 轴 631a30fc、Spec 轴 48cc06f0）；复审轮因前轮代理回收换派新独立子代理（二轮为全量实测复审）
  - 目的理解: 紧凑档完成提醒卡缺确认入口（AC-02 原文隐藏按钮），东家拍板标题行最右 ✓ 图标按钮（C-098）；预期行为=仅紧凑 done 卡显示、可访问名称「移入历史」、点击迁入最近历史不跳转、完整/中间档末行文字形态不变、命中区 ≥24×24；验证=E2E compact-density + check.mjs bundle 契约 + MANUAL 双引擎黄金路径
  - 执行方式: code-review skill 双轴——spec 源=task 及上游链（R-01-021/AC-02、AC-09，R-01-002/AC-10，SOLUTION 契约落点 149/374/474 行）；standards 源=CONVENTIONS、client.mjs 模块边界契约、DOMAIN 术语表、12 条 Fowler smell 基线；固定点 4ce78f7
  - 问题与修复: 首轮 F1 命中区断言不实（视觉盒 20×18、padding:0 实际 22×20 ≠ 承诺 24×24）→ 伪元素透明外扩（9152bae）；F2 行框增高表述不符、F3 缩进噪声、F4 e2e 头注释漏列 R-01-002/AC-10、DOMAIN「紧凑显示」「确认按钮」两词条漏同步双形态 → 同提交修复。二轮探针实测命中区 22×22（inset -3px -2px 按 content-box 心算而 button UA 默认 border-box，基准实为 padding 盒 18×16）→ inset -4px -3px 修正至 24×24 并在 e2e 钉 box/rowHeight/hitEdges/outsideHit/pseudoBox 几何断言（884eaab）；N-1 补 pseudoBox 精确断言、N-2 注释口径改写为 content-box 对照、SOLUTION 补命中区契约（2485f29）。全部 blocking 清零
  - 复审结论: 两轮独立上下文审核均通过，blocking 清零；non-blocking 维持项——透明命中区提前触发 hover（观感）、图标按钮与末行按钮激活绑定代码同款重复（复审认可维持）、残余测试缺口（键盘激活/完整档隐藏/阻塞卡隐藏无专项 e2e，bundle 断言与 MANUAL 覆盖）
