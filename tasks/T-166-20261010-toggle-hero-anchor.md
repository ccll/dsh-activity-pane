---
doc-type: task
mutation: lifecycle
id: T-166
---

# T-166 兜底浮层贴靠宿主侧栏切换按钮成组

状态: active
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

（待实现完成后填写）
