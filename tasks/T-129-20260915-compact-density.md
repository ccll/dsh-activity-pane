---
doc-type: task
mutation: lifecycle
id: T-129
---

# T-129 卡片紧凑显示（右下角悬浮一键收缩）

状态: completed
关联: R-01-021/AC-01～AC-07 → 窗格渲染器
风险等级: standard

## 背景与目标

东家在完成一轮的会话需要保留在活动区后续继续执行的场景下，反馈多张完成卡的时间线、统计与等待末行持续占用屏面，不便观察、寻找与定位会话。经四族候选交互（整卡手动折叠、标题行嵌套切换、自动紧凑、全局一键收缩）与四个落位（标题行行尾、独立工具行、右下悬浮、左下悬浮）的对比，东家确认：在「回到顶部」按钮正上方常显一枚悬浮 toggle，一键全体收缩为紧凑呈现（每卡仅保留标题行），并持久化。已按 UI/UX 改进入口走全链：查重（PRD 无同类）、查否决史（无相关否决）、PRD/DESIGN 演进经东家确认（全体收缩 + 右上落位），决策记 C-076。

## 差距评估

- `src/core.mjs`：无形态归一函数；`clampPaneWidth` 模式可复用为 `normalizeDensity`（缺失/非法回退完整呈现）。
- `src/client.mjs`：无密度切换按钮、无 `data-density` 根属性与紧凑 CSS；`normalizeDensity` 的启动恢复接线不存在。
- `scripts/check.mjs`：无 `normalizeDensity` 单测锚点。
- `e2e/specs/`：无紧凑切换 spec。
- `scripts/acceptance.mjs`：无 R-01-021 人工验收项。

## 收敛方案

- AgentMap：PRD 新增 R-01-021（AC-01～AC-07，已由东家确认立项）；DESIGN 需求追溯索引、配置可变点、产品契约与窗格渲染器内部结构同步；DOMAIN 新增「紧凑显示」术语；C-076 记录交互与落位决策。
- `src/core.mjs`：新增 `normalizeDensity(value)` 纯函数（`'compact'` → `'compact'`，其余 → `'full'`），供渲染层启动恢复与持久化写入共用。
- `src/client.mjs`：新增 `.dap-density` 悬浮按钮（`bottom:48px; right:12px`，规格同 `.dap-top`，`aria-pressed` + 可访问名称）；激活翻转窗格根 `data-density` 属性；紧凑态经 CSS 隐藏卡片次要行；localStorage 键 `dsh-activity-pane:density`（与列宽键同冒号惯例）持久化；窄条态经 CSS 隐藏按钮。
- 测试先行：先补 `normalizeDensity` 单测与 `compact-density` E2E spec（切换、跳转、刷新恢复、窄条隐藏），再实现转绿。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 新增：窗格渲染器承接卡片紧凑呈现（悬浮切换、根属性驱动 CSS、localStorage 持久化） | UNIT/E2E/MANUAL | update | 需求追溯索引新增 R-01-021 行、产品契约与内部结构条目、配置与可变点表更新 |
| R-01-021/AC-01 | 新增：一键切换全体卡片紧凑/完整 | E2E | add | `e2e/specs/compact-density.mjs#R-01-021/AC-01` |
| R-01-021/AC-02 | 新增：紧凑仅保留标题行 | UNIT/E2E | add | `scripts/check.mjs#R-01-021/AC-02` + `e2e/specs/compact-density.mjs#R-01-021/AC-02` |
| R-01-021/AC-03 | 新增：等待类别底色与状态点着色保持 | E2E/MANUAL | add | `e2e/specs/compact-density.mjs#R-01-021/AC-03` + `scripts/acceptance.mjs#R-01-021/AC-03` |
| R-01-021/AC-04 | 新增：紧凑下激活照常跳转 | E2E | add | `e2e/specs/compact-density.mjs#R-01-021/AC-04` |
| R-01-021/AC-05 | 新增：回到顶部上方常显悬浮按钮、窄条隐藏 | UNIT/E2E/MANUAL | add | `scripts/check.mjs#R-01-021/AC-05` + `e2e/specs/compact-density.mjs#R-01-021/AC-05` + `scripts/acceptance.mjs#R-01-021/AC-05` |
| R-01-021/AC-06 | 新增：形态持久化恢复 | UNIT/E2E | add | `scripts/check.mjs#R-01-021/AC-06` + `e2e/specs/compact-density.mjs#R-01-021/AC-06` |
| R-01-021/AC-07 | 新增：状态变化不解除形态 | E2E | add | `e2e/specs/compact-density.mjs#R-01-021/AC-07` |
| R-01-009/AC-08 | 同次夹带：进度条纹色带周期 20px→10px、keyframes 方向反转（工作树预存的 T-128 后续观感收敛，随实现提交一并入库；条纹滚动动画的可观察行为不变） | UNIT | update | `scripts/check.mjs` 条纹 bundle 契约断言同步改写，`pnpm verify` 全量通过 |

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-021）。
- `pnpm test:e2e`（新 spec 锚定 R-01-021/AC-01～AC-07）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：一键切换全体卡片仅保留标题行，按钮按下态与形态一致 | `e2e/specs/compact-density.mjs#R-01-021/AC-01`、`scripts/check.mjs#R-01-021/AC-02`、`src/client.mjs::applyDensity` |
| 异常 | 适用：localStorage 缺失/非法值回退完整呈现；重复切换与重复恢复幂等 | `scripts/check.mjs#R-01-021/AC-06`、`src/core.mjs::normalizeDensity` |
| 边界配置 | 适用：窄条不显示按钮；抽屉内可用；紧凑态下卡片激活照常跳转；等待卡类别着色保持 | `e2e/specs/compact-density.mjs#R-01-021/AC-03`、`e2e/specs/compact-density.mjs#R-01-021/AC-04`、`e2e/specs/compact-density.mjs#R-01-021/AC-05`、`scripts/acceptance.mjs#R-01-021/AC-03`、`src/client.mjs::createDensityIcon` |
| 副作用 | 适用：状态变化不解除形态；卡片复用与渲染签名不受 CSS 开关影响；卸载随骨架清理 | `e2e/specs/compact-density.mjs#R-01-021/AC-07`、`scripts/check.mjs#R-01-021/AC-02`、`src/client.mjs::ensurePane` |
| 兼容性 | 适用：完整呈现为默认形态，无持久化数据时行为与既有版本一致 | `scripts/check.mjs#R-01-021/AC-02`、`scripts/acceptance.mjs#R-01-021/AC-06`、`src/client.mjs::readStoredDensity` |

## 终态与证据

- 实现: `src/client.mjs` 新增 `.dap-density` 常显悬浮切换按钮（28px 圆形、`bottom:48px; right:12px`，与 `.dap-top` 共用声明仅 bottom 分列，`aria-pressed` + 可访问名称随形态翻转，`createDensityIcon` 密度隐喻图标）；激活翻转窗格根 `data-density="compact"` 驱动纯 CSS 隐藏卡片次要行（标题行保留），DOM 复用/渲染签名/激活跳转不感知形态；形态经 `normalizeDensity` 归一存 localStorage（键 `dsh-activity-pane:density`）并在启动/重挂载恢复；窄条态 CSS 隐藏、移动抽屉同构。`src/core.mjs` 新增 `normalizeDensity` 纯函数。`.dsh-plugin/client.js` 已重建。
- 测试: `pnpm verify` 全量通过——16 个 E2E spec（含新增 compact-density.mjs 覆盖 AC-01～AC-07）+ agentmap lint（154 AC 全锚定）+ test-impact（+7 AC）+ core 单测与 bundle 契约；审核修复后 back-to-top/compact-density 重跑通过。
- DESIGN 对照: 需求追溯索引恰一行 R-01-021（主责子系统「窗格渲染器」）、产品契约「卡片紧凑呈现」条目、窗格渲染器职责与内部结构、配置可变点表均已与实现一致；持久化键名 `dsh-activity-pane:density` 经复审从文档侧收敛（复审发现文档写点号，同次改文档对齐代码）。
- commit: 3c56a08
- commit: 4a688ad
- review:
  - 审核方: Standards reviewer `42b6afeb-04f7-4c2d-9237-c543ac987735`；Spec reviewer `da438b58-7c18-43c5-bf4b-4f5912d7ae76`（code-review skill 并行双轴）
  - 目的理解: 在不触碰 R-01-011 窗格折叠语义的前提下，为活动区与历史区全体卡片提供一键紧凑/完整切换——按钮常显于「回到顶部」正上方同规格悬浮，紧凑仅保留标题行，等待类别着色保持，跳转与持久化行为符合 R-01-021 七条 AC 与 C-076 决策（全体收缩、状态变化不解除）。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `3f12c6e...3c56a08`；修复后基于工作树 `git diff HEAD` 与全景 diff 复审。
  - 问题与修复: Standards 3 硬违规 2 判断题——键名 map-code 不一致（文档改冒号收敛）、T-128 条纹观感收敛工作树改动被实现提交夹带（按审核方允许方案在测试影响表补记 R-01-009/AC-08 update 行）、条纹注释 U+FFFD 乱码（修复）、`.dap-density`/`.dap-top` 三组选择器重复（采纳合并为逗号分组，check.mjs 契约断言同步改写）；Spec 4 项轻微——AC-03 覆盖收窄（澄清完成提醒卡即等待行动三类之一，覆盖成立）、条纹夹带（同上补记）、键名（同上）、acceptance「图标随形态切换」措辞与实现不符（改为「按下态与可访问名称随形态翻转」）。修复提交后由同一审核方复审。
  - 复审结论: Standards 与 Spec 两轴均确认全部 finding 关闭、无遗留阻塞项，通过。
