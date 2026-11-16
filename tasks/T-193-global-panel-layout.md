---
doc-type: task
mutation: lifecycle
id: T-193
---

# T-193 全局面板占屏的布局隔离——收起窗格并让出主区域

状态: active
类型: 缺陷修复
风险等级: major
风险面: 对外行为（全局面板占屏时的窗格显隐与中间列布局）、兼容性（DSH 0.2.0/0.2.2 全局面板标记差异）
关联需求: R-01-007/AC-01（范围澄清）、R-01-007/AC-03、R-01-007/AC-04（新增）；#5、#6
决策依据: 东家批准（2026-11-16）方案 A——全局面板占屏时收起窗格、中列回退外壳列布局；并要求补 0.2.2 验证回执、由维护者补 map/task/独立评审后合入。产品取舍见 C-101。PRD AC 的语义与该批准一致；AC-01 前置条件与 AC-03/AC-04 措辞按需求层可观察口径规范化，不改变承诺。评估证据：0.2.2-rc.1 隔离环境把 dsh-market 根节点的 container-type: inline-size 施加到原生页根后页面 96px、修复后 1000px；内置 Plugins 页在 0.2.0/0.2.2 均为 720px 不塌。

## 背景与目标

- 背景: #5 报告安装本插件与 dsh-market 后市场页被压成窄竖条；#6 定位 `applyLayout()` 桌面分支无条件切行布局、只给会话根 flex，原生面板占屏时 `conversationFlexItem()` 返回 null 且无回退。
- 目标: 全局面板占屏（会话视图不在屏）时中间列恢复外壳默认列布局、收起活动窗格并把主区域让给面板；返回会话时恢复行布局与用户既有折叠/宽度状态。
- 非目标: 不改宿主外壳、不改移动端抽屉契约、不引入第三方依赖；不改会话视图内的贴边布局承诺。

## 差距评估

- PRD: R-01-007/AC-01 的「视口宽度大于移动断点即显示窗格」未给全局面板态留例外；缺 AC-03/AC-04。
- SOLUTION: 宿主依赖条目与窗格渲染器只描述会话视图下的行布局，无全局面板分支。
- DOMAIN: 无「全局面板」词条，AC 与代码注释无统一称谓。
- 代码: applyLayout 桌面分支无回退；窗格显隐无单点。
- 测试: desktop-layout 无全局面板断言，也未复现 #5 的 inline-size containment 条件。

## 收敛方案

- 无分叉点: 东家已拍板方案 A（隐藏窗格、全宽）；备选「保留窗格 + 原生页根 flex」实测仅 720px，不满足 #5 的全宽预期，已在评估中否决。
1. 判据: 优先读宿主 0.2.2 起的 `data-global-panel`（中间列 mainPanel 标记）；0.2.0 无该标记时回退到「会话滚动区缺失」。
2. 布局: 命中全局面板时恢复外壳列布局、清掉会话根弹性填充（宿主保留会话 DOM 时不挤压面板），并收起窗格/开关（marker 用例断言 flexGrow 0/1）；返回时恢复显示与行布局。
3. 显隐: `display:none` 换取零占位；隐藏期 scrollTop 读数为 0、恢复后浏览器保留滚动位置、自动滚动有 clientHeight 守卫（隔离探针观察，未自动化）。
4. map: PRD R-01-007 增 AC-03/AC-04 并按可观察口径规范化措辞（AC-01 补「会话视图在屏」前置）；SOLUTION 宿主依赖与渲染器补分支；DOMAIN 登记「全局面板」「会话视图」与桌面布局适配例外。
5. 测试: desktop-layout 增全局面板用例，覆盖以下断言：
   - containment 刺激确已生效（containerType=inline-size），全局面板占满主区域且窗格隐藏；
   - 返回会话恢复贴边列、折叠窄条与既选宽度（拖拽到非默认值）；
   - 真实对话页施加 `data-global-panel` 标记时 marker 分支优先于保留的会话 DOM；
   - hero 页窗格保持可见作反例。
6. 0.2.2 回执: 在隔离环境以 DSH 0.2.2-rc.1 实测修复前后几何（96→1000px、返回恢复 280px），记录于 `receipts/T-193-0.2.2-layout.md::结论`。

## 测试计划

- `node scripts/check.mjs`: bundle 契约断言（data-global-panel 判据、setPaneHidden 单点）。
- `node e2e/run.mjs desktop-layout`: 全局面板断言（containment 刺激 + marker 分支 + 宽度/折叠往返 + hero 反例），先在未修复 bundle 上验证红、修复后绿。
- `node e2e/run.mjs mobile-drawer mobile-thermal`: 移动端抽屉与屏外休眠回归。
- `pnpm verify`: 全量门禁。
- 0.2.2 隔离环境探针：以当前分支 bundle 复测修复前后几何与返回恢复，结果写入回执。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-007/AC-01 | 范围澄清：增「会话视图在屏」前置条件，会话视图内承诺不变 | E2E | update | `e2e/specs/desktop-layout.mjs` 既有贴边断言保持 |
| R-01-007/AC-03 | 新增：全局面板占屏时收起窗格、主区域让给面板 | E2E | add | `e2e/specs/desktop-layout.mjs::desktopLayout` 以 containment 复现 #5 并断言容器类型、隐藏与全宽；marker 分支单独断言 |
| R-01-007/AC-04 | 新增：返回会话恢复贴边列、折叠形态与既选宽度 | E2E | add | 同一 spec 的折叠窄条往返 + 展开宽度断言 |
| SOLUTION | 宿主依赖与窗格渲染器补全局面板分支 | UNIT/E2E | update | 机制由 e2e 与 `scripts/check.mjs` 断言承载 |
| PRD | 补充 R-01-007 出处 C-101，验收点不变 | E2E | none | AC 文案与测试锚点保持，决策记录见 RATIONALE |
| DOMAIN | 登记「全局面板」「会话视图」词条与桌面布局适配例外 | UNIT | update | `scripts/check.mjs` 断言判据进入 bundle；不变量与既有 SOLUTION 布局适配对齐 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：注入 inline-size containment 的全局面板占满主区域、窗格隐藏 | `e2e/specs/desktop-layout.mjs::desktopLayout` |
| 异常 | 适用：0.2.0 无 data-global-panel 时以会话滚动区缺失回退，仍走列布局 | `e2e/specs/desktop-layout.mjs::desktopLayout`、`receipts/T-193-0.2.2-layout.md::结论` |
| 边界配置 | 适用：hero/空白会话存在会话滚动区，窗格不得误收起；折叠窄条与宽度往返保持 | `e2e/specs/desktop-layout.mjs::desktopLayout` |
| 副作用 | 适用：返回会话恢复贴边列与折叠/宽度；移动端抽屉不受影响 | `e2e/specs/desktop-layout.mjs::desktopLayout`、`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| 兼容性 | 适用：0.2.0 回退判据与 0.2.2 marker 判据均经可执行用例覆盖 | `e2e/specs/desktop-layout.mjs::desktopLayout`、`receipts/T-193-0.2.2-layout.md::结论` |

## 自查清单

- 边界：会话视图/hero 页存在滚动区时窗格保持可见；全局面板占屏时窗格隐藏且面板全宽；折叠窄条与既选宽度往返保持。
- 异常路径：0.2.0 无 `data-global-panel` 时回退判据生效；宿主保留会话 DOM 但标记全局面板时仍收起窗格。
- 回归影响：会话视图的贴边布局与折叠/宽度行为不变；移动端抽屉与屏外休眠不变；卸载复位不变。
- 残余风险：0.2.0 无标记宿主在会话滚动区暂缺的瞬时窗口也会收起窗格（启动/切会话），未做去抖；隐藏期 `scrollTop` 读取为 0（恢复后浏览器保留位置）；桌面全局面板打开期间窗格仍在渲染，未做渲染门控。

## 终态与证据

关闭时填写实现、测试、SOLUTION 对照、commit 与独立 review 证据。
