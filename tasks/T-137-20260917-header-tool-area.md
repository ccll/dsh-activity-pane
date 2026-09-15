---
doc-type: task
mutation: lifecycle
id: T-137
---

# T-137 标题行拆分工具区并重排收起交互与档位默认档

状态: completed
关联: R-01-021/AC-01、AC-05、AC-06，R-01-011/AC-03、AC-07，R-01-008/AC-02 → 窗格渲染器
风险等级: standard

## 背景与目标

东家实测 T-130 交付的档位悬浮切换按钮后提出三点改进：悬浮于列表上方的圆形按钮外观与体验不佳；标题行仅右侧应保留为工具按钮区域（当前只有档位按钮一枚，未来新工具按钮统一放入该区）；标题行其余区域全部让给标题，删除常态显示的行尾 « 方向符号，改为鼠标进入标题行时在最右侧显现「收起」方向图标（左侧竖杠 + 向左箭头指向竖杠）。档位选择持久化已有（C-076），默认档需从完整改为中间。东家已直接给出上述交互要求，R-01-021 原地演进（AC-05 改写、AC-06 补默认档），R-01-011 新增 AC-07，本次 T-137 承载。

## 差距评估

- `src/client.mjs`：`.dap-density` 为 `position:absolute` 悬浮圆钮（`top:44px; right:12px`），与 `.dap-top` 共用声明；标题行常显 `.dap-collapse-hint`（« 文本）。
- `src/core.mjs`：`normalizeDensity` 非法/缺失回退完整档。
- `scripts/check.mjs`：normalizeDensity 单测为回退完整档口径；bundle 契约断言 `top:44px`、与 `.dap-top` 共用声明、« 两端断点一致呈现。
- `e2e/specs/compact-density.mjs`：断言默认完整档与悬浮按钮右上位置。
- `scripts/acceptance.mjs`：人工步骤为「右上角标题行下方悬浮按钮」口径。

## 收敛方案

- AgentMap：PRD R-01-021 陈述与 AC-05 改写、AC-06 补默认中间档；R-01-011 新增 AC-07（悬停显现收起图标）；DESIGN 产品契约与窗格渲染器内部结构条目同步；DOMAIN「显示档位」词条默认档与按钮位置同步。
- `src/client.mjs`：标题行拆为两部分——左侧 `.dap-titlebar`（flex:1 占满剩余宽度，收起控件与悬停高亮的载体），右侧 `.dap-tools` 固定工具区常显档位切换按钮（22px 圆形，兄弟节点激活不构成标题区折叠）；删除 « 常态方向符号，新增 `createCollapseIcon`（左侧竖杠 + 向左箭头）在标题区 hover/focus-visible 时于标题区最右端即时显现（无过渡动画、右缘锚定不动、不挤动工具区按钮）；清理悬浮按钮 CSS 与浅色覆盖的共用选择器。
- `src/core.mjs`：`normalizeDensity` 缺失/非法值回退中间档。
- 测试：check.mjs 归一断言与 bundle 契约更新（工具区选择器、悬停显隐、共用声明拆分）；e2e compact-density 重构为默认中间档 + 标题行按钮位置 + 新增 R-01-011/AC-07 悬停断言；acceptance 改标题行工具区口径。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-021、R-01-011）。
- `pnpm test:e2e`（更新 compact-density spec 锚定 R-01-021/AC-01～AC-08、R-01-011/AC-07）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：标题行拆为标题区（收起控件/悬停高亮载体）与右侧固定工具区、悬停收起图标即时显隐、默认中间档 | UNIT/E2E | update | 产品契约与窗格渲染器条目重写，AC 措辞对齐实现 |
| R-01-021/AC-05 | 改写：悬浮按钮 → 标题行右侧工具区常显按钮 | UNIT/E2E | update | `scripts/check.mjs#R-01-021/AC-05` + `e2e/specs/compact-density.mjs#R-01-021/AC-05` |
| R-01-021/AC-01 | 改写：切换按钮措辞随位置更新（标题行工具区），三档循环与锚定语义不变 | UNIT/E2E | update | `scripts/check.mjs#R-01-021/AC-01` + `e2e/specs/compact-density.mjs#R-01-021/AC-01` |
| R-01-021/AC-06 | 改写：补默认中间档（缺失/非法回退） | UNIT/E2E | update | `scripts/check.mjs#R-01-021/AC-06` + `e2e/specs/compact-density.mjs#R-01-021/AC-06` |
| R-01-011/AC-07 | 新增：标题行悬停显现收起方向图标 | UNIT/E2E | add | `scripts/check.mjs#R-01-011/AC-07` + `e2e/specs/compact-density.mjs#R-01-011/AC-07` |
| R-01-011/AC-03 | 改写：收起控件载体由标题行整体收窄为标题区（不含右侧工具区） | UNIT/E2E | update | `scripts/check.mjs#R-01-011/AC-03` + `e2e/specs/desktop-layout.mjs` |
| R-01-008/AC-02 | 改写：收起抽屉的激活范围收窄为标题区 | UNIT/E2E | update | `scripts/check.mjs#R-01-008/AC-02` + `e2e/specs/mobile-drawer.mjs` |
| R-01-021/AC-01～AC-04、AC-07、AC-08 | 保持：三档循环、紧凑内容、着色、跳转、状态不解除语义延续 | E2E | update | `e2e/specs/compact-density.mjs` 既有断言沿用 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：档位按钮常显于标题行工具区，悬停标题行显现收起图标，默认中间档 | `e2e/specs/compact-density.mjs#R-01-021/AC-05`、`e2e/specs/compact-density.mjs#R-01-011/AC-07`、`src/client.mjs::applyDensity` |
| 异常 | 适用：localStorage 缺失/非法值回退中间档；刷新恢复档位 | `scripts/check.mjs#R-01-021/AC-06`、`src/core.mjs::normalizeDensity` |
| 边界配置 | 适用：工具区为标题区折叠控件的兄弟节点，档位按钮激活不构成标题区折叠；窄条不显示工具区；键盘聚焦标题区同样显现收起图标 | `e2e/specs/compact-density.mjs#R-01-021/AC-05`、`scripts/acceptance.mjs#R-01-021/AC-03`、`src/client.mjs::onDensityClick` |
| 副作用 | 适用：状态变化不解除档位；渲染签名含档位分量不受按钮移位影响；卸载随骨架清理 | `e2e/specs/compact-density.mjs#R-01-021/AC-07`、`src/client.mjs::ensurePane` |

## 终态与证据

- 实现: `src/client.mjs` 标题行拆为两部分——左段 `.dap-titlebar`（flex:1 占满剩余宽度，`role="button"` 收起控件与悬停高亮的载体）+ 右段 `.dap-tools` 固定工具区常显档位切换按钮（22px 圆形，兄弟节点激活不构成标题区折叠）；删除 « 常态方向符号，新增 `createCollapseIcon`（左侧竖杠 + 向左箭头）在标题区 hover/focus-visible 时于标题区最右端即时显隐（无过渡动画、右缘锚定不动、不挤动工具区按钮）；`normalizeDensity` 缺失/非法值回退默认中间档（`src/core.mjs`）；`.dsh-plugin/client.js` 已重建。
- 测试: `pnpm verify` 全绿——17 个 E2E spec（compact-density 覆盖 R-01-021/AC-01～AC-08 与 R-01-011/AC-07：默认中间档、标题行工具区按钮位置与几何、悬停显现不挤动工具区、高亮仅标题区、三档循环/锚定/持久化/窄条隐藏）+ agentmap lint（158 AC 全锚定）+ test-impact（+AC-07，~AC-01/02/03/05/06）+ core 单测与 bundle 契约；默认中间档连锁的 11 个依赖完整时间线的 spec 经新增 `ensureFullDensity` 显式切完整档后全数通过。
- DESIGN 对照: 需求追溯索引恰两行（R-01-011、R-01-021，主责「窗格渲染器」）；产品契约「卡片紧凑呈现」与窗格渲染器「标题行两部分结构」「卡片紧凑呈现切换」条目均与实现一致（两段结构、即时显隐、默认中间档、localStorage 键）；DOMAIN「显示档位」词条同步默认档与按钮位置。
- commit: 3e41ed1
- review:
  - 审核方: Standards reviewer `baa5b44b-377d-48c8-9f44-703084feaf96`；Spec reviewer `5f34aad0-360e-41f4-ac56-59c85f707cd5`（code-review skill 并行双轴，两轮）
  - 目的理解: 按东家反馈将档位切换按钮移入标题行右侧工具区、删除常态 « 符号改为悬停显现收起方向图标、档位默认中间档；符合 R-01-021 与 R-01-011 演进后的 AC 口径，AgentMap 级联（PRD/DESIGN/DOMAIN/task）完整。
  - 执行方式: code-review skill 双轴并行，基线 `7f24575`（HEAD）对未提交工作树；东家中途补充三点反馈（两段式标题行、即时显隐无动画、默认中间档）后由同一审核方增量复审。
  - 问题与修复: 第一轮——Spec：中间档收合断言 capsuleLeft/capsulePulse 被删未登记（已补回）；Standards：e2e 死代码 collapseHintState 与内联重复实现（已收敛为单一实现）、check.mjs 重复断言与弱锚点（已合并/锚定完整选择器）、CSS 悬停色字面量（裁定保留：两按钮规格刻意分叉）、术语混用（已统一「标题行」）。第二轮——Standards：acceptance 步骤措辞过期（已改标题区口径）、PRD 引言与 AC-01 措辞过期（已改）、check.mjs 重复断言合并与 4377 行片段锚定（已完成）、padding 简写/back-to-top import/消息措辞（已修）；Spec：acceptance 同一步骤与 loading-ready 缩进（已修）。复审确认 stopPropagation 整体删除正确（兄弟节点天然隔离）且消除了行内嵌套交互 a11y 隐患。
  - 复审结论: Standards 与 Spec 两轴均 PASS、无未闭合项；残余风险——header/headerEl 更名暂缓（审核方无异议）、即时显隐无过渡动画无自动化断言（CSS 人工核实，人工验收项）。
