---
doc-type: task
mutation: lifecycle
id: T-146
---

# T-146 标题行两接缝间距对称

状态: completed
关联: R-01-022/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家实测反馈：仓库入口右侧与标题区之间 padding/margin 过小（实测 **0px**——`.dap-repo` 右缘紧贴 `.dap-titlebar` 盒左缘，hover 高亮块直接贴着 GitHub 图标），显得标题区没有居中；参考标题区右缘与档位切换按钮之间的空间（实测 **12px**，由 `.dap-tools` 的 `padding-left: 12px` 承担），让两侧接缝对称。本变更属 DESIGN 承载的间距语义演进（东家本次指令即确认），PRD 不动（AC-01 未钉间距数值）。

## 差距评估

- 现状几何（e2e 环境实测，1100px 桌面）：repoRight=314、titlebarLeft=314（接缝 0px）、titlebarRight=513、toolsLeft=513（接缝 0px）、densityLeft=525（tools padding-left 12px）。标题区左接缝 0px vs 右接缝 12px，不对称。
- `src/client.mjs`：`.dap-repo` 的 `margin: 0 0 0 12px` 缺右缘间距。
- `e2e/specs/repo-entry.mjs`：已有 `repoRight <= titlebarX` 与 `densityX > titlebarRight` 两条几何断言，缺「两接缝对称」断言。
- `DESIGN.md`：产品契约「仓库入口」条目未承载接缝间距语义。
- `scripts/acceptance.mjs`：R-01-022 人工步骤无对称观感点。

## 收敛方案

- 测试先行：`e2e/specs/repo-entry.mjs` 新增对称断言——仓库入口右缘到标题区左缘的间隔与标题区右缘到档位按钮左缘的间隔相等（±2px 容差抗亚像素抖动），运行确认旧实现（0px vs 12px）转红。
- `src/client.mjs`：`.dap-repo` margin 改 `0 12px`（左缘窗格间距不变，右缘补 12px 与工具区间距对称）；CSS 注释同步。
- `DESIGN.md`「仓库入口」条目补接缝对称语义；`scripts/acceptance.mjs` R-01-022 步骤补对称观感点。
- `pnpm build:client` 重建 `.dsh-plugin/client.js` 并随实现一并提交。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-022/AC-01）。
- `pnpm test:e2e`（`e2e/specs/repo-entry.mjs::R-01-022/AC-01` 浏览器实测两接缝对称断言）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 浏览器实测：桌面与移动抽屉态各验标题区两侧接缝观感对称、悬停高亮不再贴 GitHub 图标。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-022/AC-01 | 保持：位置语义（分处标题行两端）不变，补两接缝间距对称的实现细节（东家指令） | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`——新增两接缝对称断言 |
| DESIGN | 改写：产品契约「仓库入口」条目补「与标题区的接缝间距对齐工具区间距」语义 | E2E | none | 同次修改的 active task 豁免：unit/contract 层无断言变化（`scripts/check.mjs` 仓库入口断言子串止于 `background: #1d1f25;`，不含 margin 行，无需同步）；DESIGN 变更由本行登记，接缝对称行为由 e2e 对称断言承载 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：仓库入口↔标题区间隔 = 标题区↔档位按钮间隔（±2px） | `e2e/specs/repo-entry.mjs::R-01-022/AC-01` |
| 异常 | 适用：激活隔离与档位语义不随间距变化 | `e2e/specs/repo-entry.mjs::R-01-022/AC-02` |
| 边界配置 | 适用：移动抽屉形态与浅色主题下对称间距同样生效（自动断言仅覆盖桌面 1100px；移动抽屉对称由人工步骤承载） | `scripts/acceptance.mjs::R-01-022/AC-01`、`e2e/specs/repo-entry.mjs::R-01-022/AC-03`（仅窄条隐藏断言） |
| 副作用 | 适用：仅 repo margin 变化，档位按钮/收起图标/折叠窄条几何不变 | `e2e/specs/compact-density.mjs::R-01-021/AC-01`、`e2e/specs/desktop-layout.mjs::R-01-011/AC-05` |

## 终态与证据

- 实现: `src/client.mjs` `.dap-repo` margin 由 `0 0 0 12px` 改为 `0 12px`——右缘与标题区的接缝间距对齐工具区的接缝间距（`.dap-tools` padding-left 12px），标题区悬停高亮两侧留白对称；CSS 注释与 `DESIGN.md` 产品契约「仓库入口」条目补接缝对称语义；`.dsh-plugin/client.js` 已随实现提交重建。选择 margin 而非 header gap 的理由：gap 会同时加在标题区↔工具区接缝使右侧间距变 24px，破坏既有对称基准。
- 测试: 实现提交前旧实现转红确认（e2e 对称断言对左接缝 0px vs 右接缝 12px 失败）；`pnpm verify` 全量 18 spec 通过前先复跑三个受影响 spec（repo-entry/desktop-layout/compact-density）全绿 + `pnpm verify:fast` 全绿；浏览器实测两态截图核对——桌面 1100px 展开态与移动抽屉 375px 态的标题区两侧接缝观感对称、悬停高亮不贴 GitHub 图标（临时产物已清理）。
- DESIGN 对照: 需求追溯索引恰一行 R-01-022（主责「窗格渲染器」，设计落点「标题行左侧仓库入口」不变）；产品契约「仓库入口」条目补接缝对称语义与实现一致（margin-right 12px 对齐 tools padding-left 12px）；PRD 未改动（AC-01 钉位置语义未钉间距）。
- commit: f12297d
- review:
  - 审核方: Standards reviewer `bea109a3-8822-479c-ad15-6a6a6ab23de2`；Spec reviewer `a6a39c00-db09-40ec-8d99-17e4012c20b8`（code-review skill 并行双轴）
  - 目的理解: 仓库入口与标题区的接缝间距（0px，紧贴悬停高亮块）对齐标题区与档位按钮之间的接缝间距（12px），两侧对称；关联约束为 R-01-022/AC-01 位置语义不变（分处标题行两端）、PRD 不动（AC-01 未钉间距数值），验证方式为 e2e 对称断言（±2px 容差）+ 双态浏览器实测 + 全量门禁。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `ae78b61..f12297d`（实现提交）；证据登记修正后由同一审核方逐项复审（工作树仅 task 文档改动，代码未被触碰）。
  - 问题与修复: Standards 轴 4 项——(1) 12px 双字面量耦合（repo margin-right 与 tools padding-left 独立承载对称不变量）：不采纳 CSS 变量收口（YAGNI，既有基准值与对齐值语义不同），e2e ±2px 断言运行时兜底，记残余；(2) DESIGN 单行过长：沿既有条目风格，接受；(3) e2e/acceptance 断言：无发现；(4) 测试影响 DESIGN 行证据与实际不符（f12297d 未触碰 check.mjs）：动作 update→none、验证层改 E2E，理由写明断言子串止于 `background: #1d1f25;` 不含 margin 行。Spec 轴 (a) 2 项——验证矩阵「边界配置」证据登记过度（repo-entry::AC-03 段仅窄条隐藏、移动抽屉对称无自动断言）：证据列降级为 acceptance 人工步骤承载并括注 e2e 断言范围；测试影响 UNIT 行预案落空：与 Standards ④ 同项改 none；(c) 断言口径与 spec 一致、无硬伤。
  - 复审结论: 两轴均复审通过、无新增发现——Standards 确认四项处置（含 DESIGN 行 none 改述与验证矩阵降级登记准确）；Spec 确认 spec 钉点逐字落实、PRD 未动、登记口径自洽，终态残余风险按复审条件写入下条。
  - 残余风险与测试缺口: 接缝对称只保证悬停高亮盒两侧留白对称；`.dap-titlebar` 自身 padding 左 12/右 8 的既有不对称未触及，盒内标题文字仍偏左——若东家所指为标题文字居中，需另立变更调整 titlebar padding。对称不变量由 `.dap-repo` margin-right 与 `.dap-tools` padding-left 两个独立 12px 字面量承载（语义不同：既有基准值 vs 对齐值），耦合由 e2e ±2px 对称断言运行时兜底，可选 CSS 变量收口留作下次触碰该区域时评估；移动抽屉形态的对称间距无自动断言（自动断言仅覆盖桌面 1100px），由 `scripts/acceptance.mjs` 人工步骤承载，本 task 已双态截图实测核对。
