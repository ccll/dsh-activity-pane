---
doc-type: task
mutation: lifecycle
id: T-137
---

# T-137 标题行工具区收编档位切换与悬停收起图标

状态: active
关联: R-01-021/AC-05、AC-06，R-01-011/AC-07 → 窗格渲染器
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

任务 active 期间本节留空；关闭时按规范填写实现、测试、DESIGN 对照、commit 与 review 证据。
