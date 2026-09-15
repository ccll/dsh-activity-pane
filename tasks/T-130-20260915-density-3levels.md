---
doc-type: task
mutation: lifecycle
id: T-130
---

# T-130 显示档位三档化、切换锚定与按钮移位

状态: completed
关联: R-01-021/AC-01～AC-08 → 窗格渲染器
风险等级: standard

## 背景与目标

T-129 交付二档紧凑显示后，东家实测提出三点改进：切换时当前选中卡片会移位甚至滚出屏幕（缺锚定）；完整与紧凑之间缺少过渡档（一档信息过丰、一档过简）；切换按钮在右下角，而用户主要在活动区工作、远离鼠标轨迹。东家已确认：三档循环切换（单按钮）、中间档为「上下文档」（保留工作区徽标行、标题行、等待末行、最近卡预览行）、按钮移至右上角标题栏正下方。R-01-021 原地演进（AC-01/AC-05 改写、新增 AC-08，AC-09 锚定并入 AC-01），本次 T-130 承载。

## 差距评估

- `src/core.mjs`：`normalizeDensity` 为二值归一（'compact'/'full'），无三档循环函数。
- `src/client.mjs`：`.dap-density` 位于右下 `bottom:48px`；`onDensityClick` 为二态布尔翻转，无滚动锚定；CSS 仅有 compact 档隐藏集合。
- `scripts/check.mjs`：`normalizeDensity` 单测与 bundle 契约均为二值口径。
- `e2e/specs/compact-density.mjs`：断言二态循环、右下位置、aria-pressed；无中间档与锚定断言。
- `scripts/acceptance.mjs`：人工步骤为二档口径。

## 收敛方案

- AgentMap：PRD R-01-021 陈述与 AC 改写（三档循环、中间档内容 AC-08、按钮右上 AC-05、锚定 AC-01 内）；DESIGN 产品契约与内部结构条目重写；DOMAIN「紧凑显示」拆为「显示档位」+「紧凑显示」两词条。
- `src/core.mjs`：`normalizeDensity` 值域扩为 'full'/'medium'/'compact'（非法回退 full）；新增 `nextDensity` 循环纯函数。
- `src/client.mjs`：`.dap-density` 移位右上（`top:40px; right:12px`，标题栏 ~32px + 8px 间距），与 `.dap-top` 共用声明保留；`data-density` 三值驱动两段 CSS（medium 隐藏时间线/进度/统计；compact 递增隐藏 head/等待末行/预览行）；`onDensityClick` 循环切换并执行滚动锚定（记录当前卡切换前相对视口 top，翻转后补偿 `scrollTop`）；`aria-pressed` 移除，可访问名称表达目标档位。
- 测试：check.mjs 归一三值断言与 bundle 契约更新；e2e 更新为三档循环/中间档内容/锚定/右上位置/刷新恢复；acceptance 改三档口径。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-021）。
- `pnpm test:e2e`（更新 compact-density spec 锚定 R-01-021/AC-01～AC-08）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：三档呈现（full/medium/compact）、循环切换、滚动锚定（含滚动边界钳制语义）、按钮移位右上 top:44px | UNIT/E2E | update | 产品契约与内部结构条目重写为三档口径，AC-01 滚动边界钳制语义与 .dap-foot 隐藏层级措辞对齐实现 |
| R-01-021/AC-01 | 改写：二态切换 → 三档循环 + 当前卡顶部视口位置稳定 | E2E | update | `e2e/specs/compact-density.mjs#R-01-021/AC-01` |
| R-01-021/AC-05 | 改写：按钮移至右上角标题栏正下方 | UNIT/E2E | update | `scripts/check.mjs#R-01-021/AC-05` + `e2e/specs/compact-density.mjs#R-01-021/AC-05` |
| R-01-021/AC-06 | 改写：持久化值域扩为三档 | UNIT/E2E | update | `scripts/check.mjs#R-01-021/AC-06` + `e2e/specs/compact-density.mjs#R-01-021/AC-06` |
| R-01-021/AC-08 | 新增：中间呈现内容（上下文档） | E2E | add | `e2e/specs/compact-density.mjs#R-01-021/AC-08` |
| R-01-021/AC-02、AC-03、AC-04、AC-07 | 保持：紧凑仅标题行、着色保持、跳转、状态不解除（语义延续至三档） | E2E | update | `e2e/specs/compact-density.mjs#R-01-021/AC-02` 等既有断言沿用 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三档循环切换，中间档保留工作区/等待末行/预览行，紧凑仅标题行 | `e2e/specs/compact-density.mjs#R-01-021/AC-01`、`e2e/specs/compact-density.mjs#R-01-021/AC-08`、`src/client.mjs::applyDensity` |
| 异常 | 适用：localStorage 缺失/非法值回退完整档；刷新恢复档位 | `scripts/check.mjs#R-01-021/AC-06`、`src/core.mjs::normalizeDensity` |
| 边界配置 | 适用：当前卡不可得时不补偿滚动；窄条不显示按钮；紧凑/中间下跳转照常 | `e2e/specs/compact-density.mjs#R-01-021/AC-05`、`scripts/acceptance.mjs#R-01-021/AC-03`、`src/client.mjs::applyDensity` |
| 副作用 | 适用：状态变化不解除档位；卡片复用与渲染签名不受 CSS 开关影响；卸载随骨架清理 | `e2e/specs/compact-density.mjs#R-01-021/AC-07`、`src/client.mjs::ensurePane` |
| 兼容性 | 适用：旧持久化值（full/compact）在新值域下直接有效；非法值回退完整 | `scripts/check.mjs#R-01-021/AC-06`、`src/client.mjs::readStoredDensity` |

## 终态与证据

- 实现: `src/client.mjs` `.dap-density` 移位窗格右上角、标题栏正下方（`top:44px; right:12px`，与 `.dap-top` 共用声明仅纵向锚点分列）；`data-density` 三值（full/medium/compact）驱动两段 CSS——medium 隐藏时间线/进度/统计，compact 递增隐藏 head/等待末行/预览行仅留标题行；`onDensityClick` 按完整→中间→紧凑循环并执行滚动锚定（记录当前卡切换前相对视口位置，翻转后补偿 `scrollTop`，当前卡不可得或补偿目标超出滚动边界时不补偿/钳制）；`aria-pressed` 移除、可访问名称表达目标档位；`normalizeDensity` 值域扩三档、新增 `nextDensity` 循环纯函数（`src/core.mjs`）；档位持久化并在启动/重挂载恢复。`.dsh-plugin/client.js` 已重建。
- 测试: `pnpm verify` 全量通过——16 个 E2E spec（含更新后 compact-density.mjs 覆盖 AC-01～AC-08：三档循环、中间档内容、锚定、右上位置、刷新恢复、状态不解除、窄条隐藏）+ agentmap lint（155 AC 全锚定）+ test-impact（+AC-08，~AC-01/03/04/05/06/07）+ core 单测与 bundle 契约；审核修复后 compact-density 重跑通过。
- DESIGN 对照: 需求追溯索引恰一行 R-01-021（主责子系统「窗格渲染器」）、产品契约「卡片紧凑呈现」条目（三档循环、滚动锚定含边界钳制、top:44px、持久化键）与窗格渲染器内部结构条目均与实现一致；DOMAIN「紧凑显示」拆为「显示档位」+「紧凑显示」两词条。
- commit: 646c159
- commit: 9ec5bfd
- review:
  - 审核方: Standards reviewer `baa877dc-97ba-4fc4-a822-7a6ab8a31301`；Spec reviewer `0e0d75d4-0360-4b21-85fe-18c870dee4ae`（code-review skill 并行双轴）
  - 目的理解: 在 T-129 二档紧凑显示基础上演进三档（完整/中间/紧凑）循环切换，锚定当前选中卡片顶部视口位置使切换不移位，按钮移至右上角标题栏正下方；符合 R-01-021 八条 AC 与 C-076 决策的演进口径。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `c40aee9...646c159`；修复后基于工作树 `git diff HEAD` 复审。
  - 问题与修复: Standards 1 硬违规 5 判断题——check.mjs 逐字重复断言（删除）、densityValue 命名弱（全量改名 densityLevel）、DESIGN 紧凑档隐藏层级措辞与实现漂移（改述 .dap-foot）、compact CSS 重复罗列（两段各自表达档位递进语义，审核方接受不合并）、activateCardByIndex 泛化（两处使用，保留）；Spec 2 项——AC-01 锚定边界未收敛（PRD 补「滚动余量不足时以不使当前卡片移出滚动视口为准」、DESIGN 补 [0,maxScroll] 钳制语义）、AC-03/AC-04 medium 分支无 e2e 锚点（补中间档底色一致与激活跳转断言，compact 段改 index 1 避免重复激活）；另 top:40px→44px（header 实测 ~36px + 8px）。两轮修复提交后由同一审核方复审。
  - 复审结论: Standards 与 Spec 两轴均确认全部 finding 关闭（含 DESIGN 产品契约行 top:44px 同步），无阻塞项，通过。
