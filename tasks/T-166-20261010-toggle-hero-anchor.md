---
doc-type: task
mutation: lifecycle
id: T-166
---

# T-166 兜底浮层贴靠宿主侧栏切换按钮成组

状态: completed
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家真机反馈（16:17 截图）：英雄页兜底浮层与宿主侧栏切换按钮分离，且英雄页内容滚动穿过浮层下方，观感像误置。东家提问「能否像会话一样放到同一个布局里」并确认采用「贴靠成组」方案。

实测（WebKit + iPhone UA 移动壳层）：英雄页不存在可嵌入的布局行——宿主侧栏切换按钮是应用框架 grid 的直接子元素、自由浮动定位（无 class），宿主自身未给它布局行。决策见 C-091。

## 差距评估

- PRD R-01-008/AC-04 回退条款为「显示在会话头部左上角」，与东家确认的贴靠成组目标不符（需求变更）。
- `src/client.mjs` 兜底定位：`top` 恒 12px、`left` 仅锚 sidebar 槽位按钮右缘；移动壳层该按钮在屏外（右缘 ≤ 0），锚点退化为缺省 44px，与宿主按钮无关联。

## 收敛方案

- PRD R-01-008/AC-04 回退条款改为：贴靠宿主侧栏切换按钮右侧 8px 并垂直居中，按钮不可测时左上角兜底。
- `src/client.mjs` `placeToggle` 兜底分支锚点选择：
  1. sidebar 槽位内可见按钮（桌面壳层收起栏切换钮，现有锚点）；
  2. sidebar 槽位祖先链逐级首个直系可见 BUTTON 子元素（移动壳层英雄页侧栏钮，无 class 匿名按钮）；
  3. 均不可测时维持现状（top 12px、left 缺省 44px 或槽位按钮动态右缘）。
- 垂直居中：`anchor.top + (anchor.height - 开关高) / 2`，以内联样式钉死（与 T-164 内联钉位策略一致）。
- RATIONALE 增 C-091（贴靠决策）与 C-092（CONVENTIONS 新节登记）。
- SOLUTION 更新回退行与锚点次序；CONVENTIONS 新增「移动端真机验证」节（东家要求记录教训，C-092）。

## 测试计划

- `scripts/check.mjs`：锚点选择逻辑断言（槽位按钮、祖先链直系按钮、居中算式）。
- `e2e/specs/mobile-drawer.mjs`：桌面壳层兜底 left 断言沿用（锚点 1 结果不变）；top 若被断言则同步。
- `pnpm verify:fast`；全量 `pnpm verify`。
- WebKit + iPhone UA 探针实测英雄页贴靠与会话页嵌入。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：移动壳层英雄页开关贴靠宿主侧栏按钮右侧 8px、垂直居中；桌面壳层兜底 left 行为不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：锚点按钮不可测（缺失/在屏外/零宽）时回退左上角兜底，开关仍可见可点 | `src/client.mjs::placeToggle`、`scripts/check.mjs#R-01-008/AC-04` |
| 边界配置 | 适用：宿主改版使匿名按钮失去 BUTTON 标签或移出框架直系子级时，锚点 2 失效、退化为锚点 1 或左上角兜底 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::placeToggle` |
| 副作用 | 适用：定位随落位守卫每轮重算，滚动不改变锚点（宿主按钮为框架级浮动定位）；内联钉位与清理语义沿用 T-164 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::placeToggle` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | AC 回退条款改写（左上角 → 贴靠宿主按钮成组，不可测时回退左上角） | UNIT/E2E | update | `scripts/check.mjs` 锚点断言；`e2e/specs/mobile-drawer.mjs` 兜底 left 沿用 |
| R-01-008/AC-05 | 不变（抽屉打开隐藏语义不变，本 task 不触达） | E2E | none | AC-05 断言沿用 |
| SOLUTION | 回退行与锚点次序两条更新 | UNIT | update | 同次变化由本 task 记录 |
| PRD | AC-04 回退条款改写（子弹结构承载，东家选项问答确认） | MANUAL | update | 东家在选项问答中确认「贴靠 ⊡ 按钮成组」；AC 主句不变、子句承载回退语义 |
| RATIONALE | 增 C-091（贴靠成组决策与被否方案）、C-092（CONVENTIONS 新节登记） | - | add | 决策与规范新增记录 |
| CONVENTIONS | 新增「移动端真机验证」节（移动壳层验证纪律，东家要求） | MANUAL | add | 东家明确要求记录教训；RATIONALE C-092 承接 |

## 终态与证据

- 实现: `src/client.mjs` placeToggle 兜底分支两级锚点（sidebar 槽位按钮 → 槽位祖先链逐级首个直系可见 BUTTON，共用 ON_SCREEN_X=-10 在屏判据）+ 垂直居中算式 + 内联钉位；e2e 镜像同步同口径。PRD AC-04 回退条款以子弹结构承载改写；SOLUTION 回退行/锚点次序/在屏判据三条；RATIONALE C-091（贴靠决策）与 C-092（CONVENTIONS 新节登记）；CONVENTIONS「移动端真机验证」节。commit: ee9d7da
- 测试: `pnpm verify` 全绿（最终工作树单跑，20/20 e2e specs）；`scripts/check.mjs` 断言更新（祖先链直系按钮/右缘 8px/垂直居中/ON_SCREEN_X 具名常量）；WebKit + iPhone UA 探针实测英雄页贴靠（开关 56,16 紧邻宿主 ⊡ 按钮 10,12,38×38，垂直居中）；mobile-drawer 与 recent-infinite-scroll 单跑复绿。真机最终观感留人工验收。
- SOLUTION 对照: 回退行、锚点次序、在屏判据三条与实现一致；PRD AC-04 主句不变、子弹承载回退语义（lint 的 AC 变更检测以主句为准、测试影响表 PRD 行以合法验证层枚举放行）；C-091/C-092 决策与规范登记完整。
- commit: ee9d7da
- review:
  - 审核方: Standards 子代理 `5d3de84e-ab45-4832-8cc4-ee014d13c083`；Spec 子代理 `100e6406-e661-47c6-a905-cd03502fa801`。
  - 目的理解: 英雄页兜底浮层与宿主侧栏按钮分离且内容滚动穿底，东家确认贴靠成组方案；约束为 PRD 子句结构合规（lint AC 检测以主句为准）、锚点不耦合哈希类、内联钉位沿用 T-164 策略、CONVENTIONS 新节须记 RATIONALE。
  - 执行方式: `code-review` skill；固定基线 HEAD=e4678e7，范围为工作树 diff（实现提交 ee9d7da）+ 新增 task；Standards/Spec 双轴并行审核，各复审一轮。
  - 问题与修复: Standards 一轮 4 hard + 6 项——PRD 合并句违写作风格（还原子弹结构，lint 放行改由测试影响表 PRD 行 layer 修正承载——`-` 不在 ALLOWED_LAYERS 为根因）、CONVENTIONS 新节缺 RATIONALE（补 C-092）、SOLUTION:167 旧单锚点行失真（重写为贴靠语义）、两行 lint 新告警（拆短句）；judgement——判据统一 ON_SCREEN_X 具名常量、注释漂移合并、槽位查询复用、C-091 体例、task 清单补全、断言耦合记录。复审余 3 项（旧注释残留、两 lint 告警行、C-092 前空行）修后闭合。Spec 一轮 4 项——e2e 镜像未随锚点 2 同步（中，镜像改为两级锚点同口径）、锚点 2 字面「框架直系」与祖先链实现不符（低，SOLUTION/task 措辞改「祖先链逐级」）、CONVENTIONS 新节未入 task（低，收敛方案与测试影响补行）、C-091 体例（低，空行与列表）。全部闭合。
  - 复审结论: Standards 轴闭合（4 hard + 6 judgement 全部处置，lint 余下告警确认为基线既有行）；Spec 轴闭合（中 1 低 3 全部核销，e2e 镜像与实现同口径）；双轴确认修复无新问题。
