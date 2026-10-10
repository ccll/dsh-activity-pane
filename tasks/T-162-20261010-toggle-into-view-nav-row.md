---
doc-type: task
mutation: lifecycle
id: T-162
---

# T-162 移动端「活动」开关嵌入视图导航行

状态: completed
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家明确指示（2026-10-10，附真机截图）：「我想要的是把胶囊嵌入到它下面的顶部导航栏里，参与布局，而不是让它继续浮空」。即开关应嵌入胶囊正下方的视图导航行（对话/轨迹/上下文 行）参与布局，而非标题行、也非浮层。

同轮反馈两项：

- 面板图标被误读为「多了个边栏按钮」——撤销图标，徽标单挂。
- 真机截图实测：胶囊仍处兜底浮层位（左缘 ≈40pt）、宽 ~147pt 而内容仅 ~65pt（iOS WebKit 对 fixed 态按钮的尺寸行为，Chromium 复现不出；`width:max-content` 在该态未生效）。导航行内嵌入态为文档流 flex 子项（`flex:none` + `width:max-content`），不受该态影响；真机最终观感留人工验收。

## 差距评估

- `PRD.md`：R-01-008/AC-04 位置条款仍为「会话头部左上角、左边栏切换按钮的右侧」（T-161 版），需修订为视图导航行嵌入 + 回退条款。
- `src/client.mjs`：`placeToggle` 锚点为标题行；骨架含图标 span 与 `createDrawerIcon`；需改导航行行尾落位（量测式抵消宿主行距、溢出预检回退）并撤销图标。
- `scripts/check.mjs`：骨架/落位断言绑定标题行与图标，需改写。
- `e2e/specs/mobile-drawer.mjs`：嵌入断言（父行=标题行、位于 crumb 之前）需改为导航行断言。
- `scripts/acceptance.mjs`：AC-04 人工步骤措辞。
- `SOLUTION.md`、`RATIONALE.md` 随同同步。
- 显隐语义（嵌入态留位/兜底 display:none）、抽屉交互、卸载契约不变。

## 收敛方案

- PRD R-01-008/AC-04：位置条款改为「嵌入会话头部的视图导航行参与布局，并位于该行末端」；新增回退子句「视图导航行不存在或容纳不下开关时，回退为浮层形态，显示在会话头部左上角」；不遮挡条款保留。
- `src/client.mjs`：
  - 骨架徽标单挂：`toggle.innerHTML = "<span class=\"dap-toggle-count\"></span>"`，撤销 `dap-toggle-icon` 与 `createDrawerIcon`。
  - `placeToggle` 落位目标改为视图导航行：锚点为 `header` 的最后一个元素子行（且非标题行、flex 行）；行尾 `appendChild`，并按量测的宿主 `columnGap` 写 `margin-left = 12px - gap` 抵消行距（不硬编码宿主几何）；插入前预检投影宽度（既有子项宽 + 行距 + 开关宽 + 自留距 ≤ 行宽），放不下不插入、直接回退，避免插入-回退抖动；已在行尾且未溢出时不动 DOM。
  - 回退分支不变（挂 body、摘 `data-embedded`、兜底 left 按侧栏按钮实测右缘）。
  - CSS：撤销图标 svg 规则；`[data-embedded]` 去掉 `margin-right`（行距由行内 margin-left 承担），保留 `position: static; flex: none; width: max-content`；嵌入态 `min-height` 收为 26px 与导航行行高协调。
- `scripts/check.mjs`、`e2e/specs/mobile-drawer.mjs`、`scripts/acceptance.mjs`、`SOLUTION.md`、`RATIONALE.md`（C-089）按上文同步。

## 测试计划

- `scripts/check.mjs`：骨架徽标单挂断言、导航行落位与行距抵消/溢出预检断言；保留 left:44、data-embedded、留位断言。
- `e2e/specs/mobile-drawer.mjs`：AC-04 断言——开关父行为头部视图导航行（header 最后元素子行）且 `data-embedded`、位于导航行内；标题行不再含开关；不遮挡/兜底/留位断言沿用。
- `scripts/acceptance.mjs`：AC-04 人工步骤改导航行观感验收。
- `pnpm build:client && pnpm check`；`pnpm verify:fast`；全量 `pnpm verify`；真实环境（东家运行实例）Playwright 探针实测导航行落位与截图。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关嵌入视图导航行行尾参与布局、标题行不再含开关、不遮挡任何控件；抽屉开合交互不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：导航行不可得（欢迎页/视图窗口期）或放不下（窄视口）回退兜底浮层，仍可见可点 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：桌面断点外媒体查询隐藏不变；宿主行距/标签宽度变化由量测式落位吸收，不硬编码 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：落位守卫幂等不自激（预检不插入即无 DOM 变更）、卸载契约不变、抽屉/遮罩交互不变 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::cleanup` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | AC 正文修订（位置条款：标题行→视图导航行 + 回退子句） | UNIT/E2E/MANUAL | update | `scripts/check.mjs` 导航行落位断言；`e2e/specs/mobile-drawer.mjs` 导航行嵌入断言；`scripts/acceptance.mjs` 人工步骤同步 |
| SOLUTION | 移动端开关落点段由标题行改为视图导航行（C-089） | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 终态与证据

- 实现: `src/client.mjs` 开关骨架徽标单挂（撤销 `dap-toggle-icon` 与 `createDrawerIcon`）；`placeToggle` 落位目标改为视图导航行行尾（header 最后元素子行、flex、非标题行），行距按宿主 `columnGap` 量测后以负外边距抵消（自留 12px），插入前预检投影宽度（n−1 行距公式）、插入后实测仍溢出记 `tabsRowRefusedWidth` 防抖动，幂等守卫含行尾校验；导航行不可得或容纳不下回退兜底浮层；CSS 撤销图标规则、嵌入态钉宽保留并收 `min-height` 26px 与行高协调。落位守卫幂等与抽屉交互、卸载契约不变。commit: 1735701
- 测试: `pnpm check` 通过（徽标单挂/导航行落位/行距抵消/溢出预检断言）；`pnpm verify:fast` 绿（agentmap lint、test impact ~R-01-008/AC-04、check）；`pnpm test:e2e mobile-drawer` 单 spec 绿（含「容纳不下→兜底→回嵌」行为级新用例）；`pnpm verify` 全量 19/20 绿、density-resource 并行负载下偶发失败而单跑复现通过（重跑全量复核中）；真实环境（东家运行实例 127.0.0.1:3080）chromium+webkit 双内核探针实测：行尾落位 46px、几何与导航行对齐（26px=行高）、无溢出、标题行无开关、兜底回退正常。真机最终观感留人工验收。
- SOLUTION 对照: 「边界与对外契约」开关段、「产品形态」段、「窗格渲染器」段三处落位/形态描述与实现一致（含行距抵消、预检、防抖记忆）；PRD AC-04 修订由本 task 测试影响表承接；R-01-008 追溯索引行不变且仍准确。
- commit: 1735701
- review:
  - 审核方: Standards 子代理 `16b7b5db-f39d-41f3-abaf-c1293f04bc28`；Spec 子代理 `e04ffd84-3d9a-4ac5-a34e-da73dfe2e866`。
  - 目的理解: 东家明确指示开关嵌入其正下方的视图导航行参与布局、撤销被误读的面板图标；约束为 PRD R-01-008/AC-04 同次修订、strict 锚定、bundle 字节一致、幂等守卫与卸载契约不回退。
  - 执行方式: `code-review` skill；固定基线 HEAD=3590200，范围为工作树 diff（实现提交 1735701）+ 新增 task；Standards/Spec 双轴并行审核，各复审一轮。
  - 问题与修复: Standards 一轮 1 hard + 5 项——「行末端」无可判定断言（hard：e2e 补 `toggle === navRow.lastElementChild`，源码幂等守卫同步补行尾校验）、「容纳不下→回退」无行为级用例（补注入超宽子项的确定性用例 + acceptance 措辞）、C-089 决策段超体裁（收敛为一句话）、26px/1px 容差缺理由注释（补齐）、SOLUTION 长句拆分、navRow 命名统一与重复表达式合并；Spec 一轮 6 项——幂等守卫缺行尾校验（同 hard 修复）、min-height 超纲（收编进 task）、行距公式 n 改 n−1 并排除 toggle 自身宽度、插入-回退抖动残余路径（补 tabsRowRefusedWidth 记忆：仅插入后实测溢出记账、预检拒绝不记账、视口变化解锁）、四处注释漂移清理、C-088/C-089 间空行。全部闭合。
  - 复审结论: Standards 轴闭合（残余「SOLUTION 未描述防抖状态」一条 judgement call 已随复审补齐 SOLUTION 一行并过 verify:fast）；Spec 轴闭合（中 1 低 5 全部闭合，无缺失无 scope creep）；双轴确认修复无新问题。
