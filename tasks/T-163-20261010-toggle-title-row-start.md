---
doc-type: task
mutation: lifecycle
id: T-163
---

# T-163 移动端「活动」开关嵌入标题行行首

状态: completed
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家实测 T-162（嵌入视图导航行行尾）后指示：「嵌到行尾体验不好，改插入到左边栏弹出按钮的右侧，把其它按钮往后挤」。即开关回到头部标题行、置于行首（视觉上位于左侧边栏弹出按钮的右侧），其余头部控件被真实后挤。徽标单挂形态与显式钉宽（T-161/T-162 沉淀）保留。

## 差距评估

- `PRD.md`：R-01-008/AC-04 位置条款为「嵌入视图导航行行尾」（T-162 版），需修订为「嵌入标题行行首（左边栏弹出按钮右侧）」；「容纳不下」回退子句随之失去承载（标题行经宿主自身弹性总能容纳开关），回退条件收敛为「标题行不可得」。
- `src/client.mjs`：`placeToggle` 锚点为导航行行尾（含行距抵消、投影预检、防抖记忆），需改为标题行行首插入（复用 T-160 的簇前插入与幂等判定，保留 T-161 钉宽与动态兜底 left）；导航行专用机制（columnGap 量测、投影、tabsRowRefusedWidth）随目标迁移移除。
- `scripts/check.mjs`：落位断言（appendChild 行尾、columnGap、溢出预检）需改写为标题行行首断言。
- `e2e/specs/mobile-drawer.mjs`：嵌入断言（父行=导航行、行尾）改为标题行行首 + 位于标题簇之前；「容纳不下」注入用例删除（标题行不存在该分支）；兜底/留位/徽标单挂断言沿用。
- `scripts/acceptance.mjs`、`SOLUTION.md`、`RATIONALE.md`（C-090）随同同步。
- 显隐语义（嵌入态留位/兜底 display:none）、抽屉交互、卸载契约不变。

## 收敛方案

- PRD R-01-008/AC-04：位置条款改为「嵌入会话头部的标题行参与布局，并位于该行行首（左边栏切换按钮的右侧）」；回退子句改为「标题行不存在时回退为浮层形态，显示在会话头部左上角」；紧凑形态（仅计数徽标）与不遮挡条款保留。
- `src/client.mjs`：
  - `placeToggle` 落位目标改回标题行：锚点 `header.firstElementChild`；插入点为行内首个内容簇（标题 crumb 导航所在顶层簇）之前，无簇时行首 prepend；幂等判定「开关为行首元素」。
  - 移除导航行专用机制：columnGap 量测与负外边距、投影预检、插入后溢出检查与 `tabsRowRefusedWidth` 防抖记忆；兜底分支不变（挂 body、摘标记、动态 left、清 margin）。
  - CSS：`[data-embedded]` 恢复 `margin-right: 8px` 与标题簇分隔；保留 `position: static; flex: none; width: max-content; min-height: 26px`。
- `scripts/check.mjs`、`e2e/specs/mobile-drawer.mjs`、`scripts/acceptance.mjs`、`SOLUTION.md`、`RATIONALE.md`（C-090）按上文同步。

## 测试计划

- `scripts/check.mjs`：徽标单挂骨架断言沿用；落位断言改为标题行行首（insertBefore 簇前）；保留 left:44、data-embedded、留位、钉宽断言。
- `e2e/specs/mobile-drawer.mjs`：AC-04 断言——开关父行为标题行且为行首元素、位于标题簇之前（compareDocumentPosition）、标题行仍含其余控件；不遮挡/兜底/留位断言沿用。
- `scripts/acceptance.mjs`：AC-04 人工步骤改标题行行首观感验收。
- `pnpm build:client && pnpm check`；`pnpm verify:fast`；全量 `pnpm verify`；真实环境（东家运行实例）Playwright 探针 chromium+webkit 双内核实测行首落位与截图。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关嵌入标题行行首参与布局、位于标题簇之前、不遮挡任何控件；抽屉开合交互不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：标题行不可得（欢迎页/会话视图未挂载窗口期）回退兜底浮层，仍可见可点 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：桌面断点外媒体查询隐藏不变；浅色主题底色覆盖规则继续生效 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：落位守卫幂等不自激、卸载契约不变、抽屉/遮罩交互不变 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::cleanup` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | AC 正文修订（位置条款：视图导航行行尾→标题行行首；回退条件收敛） | UNIT/E2E/MANUAL | update | `scripts/check.mjs` 标题行落位断言；`e2e/specs/mobile-drawer.mjs` 行首嵌入断言；`scripts/acceptance.mjs` 人工步骤同步 |
| SOLUTION | 移动端开关落点段由导航行行尾改为标题行行首（C-090） | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 终态与证据

- 实现: `src/client.mjs` 落位目标收敛为头部标题行行首（簇前插入，簇判定简化为「head 内含 nav 即标题簇」并删不可达上溯循环）；导航行专用机制（columnGap 量测、投影预检、`tabsRowRefusedWidth` 防抖）全撤；兜底分支不变（挂 body、摘标记、动态 left、清 margin）；徽标单挂与钉宽维持，`[data-embedded]` 恢复 `margin-right: 8px`。commit: 54a59d8
- 测试: `pnpm verify` 全绿（最终工作树，agentmap lint、test impact lint、check、20/20 e2e specs）；`e2e/specs/mobile-drawer.mjs` 行首嵌入断言（父行=标题行、`firstElementChild`、nav 之前、其余控件仍在行内）与兜底/留位断言全过；真实环境（东家运行实例 127.0.0.1:3080）chromium+webkit 双内核探针实测：46×26、x=76、行首、其余头部控件后挤，双内核几何一致。真机最终观感留人工验收。
- SOLUTION 对照: 开关机制段、产品形态段、窗格渲染器段三处与实现一致（幂等措辞对齐 settled 判定）；PRD AC-04 修订（行首为承诺、侧栏按钮右侧降括注；回退条件收敛为标题行不存在）由本 task 测试影响表承接；R-01-008 追溯索引行不变且仍准确。
- commit: 54a59d8
- review:
  - 审核方: Standards 子代理 `8dc2a2f2-085d-4828-92b7-8d790adf34b3`；Spec 子代理 `fe7779cd-f5fb-4de9-88ed-8ff7664e4e23`。
  - 目的理解: 东家实测 T-162 导航行行尾后指示「改插入到左边栏弹出按钮的右侧，把其它按钮往后挤」——开关回到标题行行首参与布局；约束为 PRD 同次修订与测试证据同步、strict 锚定、bundle 字节一致、T-161/T-162 形态沉淀（徽标单挂 + 钉宽）不回退。
  - 执行方式: `code-review` skill；固定基线 HEAD=c70db74，范围为工作树 diff（实现提交 54a59d8）+ 新增 task；Standards/Spec 双轴并行审核，各复审一轮。
  - 问题与修复: Standards 一轮 1 hard + 4 项——SOLUTION 幂等条款「行未变化」无实现对应（hard：改「已处于插入点（标题簇之前，无簇时行首）」）、簇判定 while 上溯不可达（删循环并注释理由）、PRD 双几何承诺（行首为规范承诺、侧栏按钮右侧降括注）、e2e 类名子串锚定脆弱（改 nav 元素锚定）、check 幂等断言消息覆盖不完整（补簇前分支断言并限定无簇分支措辞）；Spec 一轮 3 项——「其余控件仍在行内」断言缺失（补 `others > 0`）、嵌入分支 marginLeft 清理为死代码（删，兜底分支保留）、tmp-rc-diff/ 卫生提示（保持未跟踪不入提交）。全部闭合。
  - 复审结论: Standards 轴闭合（hard 1 项修复，judgement call 全部处置，bundle 同步验证）；Spec 轴闭合（低 1 极低 1 卫生 1 全部闭合，无缺失无 scope creep）；双轴确认修复无新问题。
