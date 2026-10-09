---
doc-type: task
mutation: lifecycle
id: T-159
---

# T-159 后台任务子卡状态点活性脉冲（光晕与闪烁）

状态: active
关联: R-01-023（AC-09 新增）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 东家观察到后台任务子卡里的小蓝点不闪烁。
- 查证结论: 三层自洽，非缺陷——R-01-023 各 AC 从未承诺状态点闪烁（AC-05 只承诺状态点存在）。
  - SOLUTION 同样未承诺闪烁，实现自引入（6bb73f0，T-149）即静态、无回归。
  - 结论属需求缺口，东家确认（2026-10-09）立项补活性表达。
- 观感依据: 运行中主卡与运行中子代理卡的状态点均以 `dap-pulse 1.2s` 闪烁。
  - 任务子卡因此成为活动区唯一「在跑而不闪」的卡。
  - 任务卡无末行提示结构，状态点即天然的闪烁载体。
- 目标: 任务子卡第一行状态点以固定脉冲节奏闪烁并带同色相柔和光晕。
  - 着色随任务状态区分：运行中任务蓝，停止中琥珀。
- 非目标: 不改等待卡标题状态点静止纪律（R-01-002/AC-08，C-040）。
  - 不引入与等待末行脉冲的相位同步机制。
  - 不改 host 侧、core 侧与任务子卡其它呈现。

## 差距评估

- PRD.md: R-01-023 无状态点活性 AC，新增 AC-09。
- SOLUTION.md: 任务子卡的呈现落点缺脉冲与光晕的方案描述。
- src/client.mjs: `.dap-job-dot` 无 box-shadow 与 animation（client.mjs:748-752）。
  - stopping 分支只换 background，不动动画。
- scripts/check.mjs: 无任务子卡状态点的动画与光晕契约。
- e2e/specs/background-jobs.mjs: 只断言 `dotStatus` 数据态，不断言动画与光晕。
- scripts/acceptance.mjs: 无 AC-09 人工步骤。

## 收敛方案

1. `src/client.mjs`（纯 CSS，零 JS 改动）：
   - `.dap-job-dot` 基态只承载任务蓝着色与同色相光晕 `box-shadow: 0 0 6px rgba(101,160,255,.8)`，不带动画。
   - 动画按状态门控：running 与 stopping 的分组规则承载 `animation: dap-pulse 1.2s ease-in-out infinite`。
   - AC-09 的「运行中或停止中」条件由 CSS 显式表达，不依赖跨层隐式前提（双轴复审修复）。
   - stopping 分支换琥珀着色与光晕，脉冲由分组规则承载、节奏复用主卡状态点关键帧与周期。
   - `prefers-reduced-motion` 不特判，沿既有纪律（reduced-motion 只关进度填充过渡，不关状态脉冲）。
2. `scripts/check.mjs`: bundle 契约断言状态点动画与光晕声明，及 stopping 色相分支。
3. `e2e/specs/background-jobs.mjs`: 黄金路径断言运行态状态点的 computed 动画与光晕。
4. `scripts/acceptance.mjs`: AC-09 人工浏览器步骤。
5. `.dsh-plugin/client.js` 随实现重建（`pnpm check`），pre-commit 校验 staged 一致。

## 测试计划

- `scripts/check.mjs`（bundle 契约，锚定 R-01-023/AC-09）：状态点 animation 与光晕声明、stopping 色相分支。
- `e2e/specs/background-jobs.mjs`（browser）：运行态任务子卡状态点 computed 动画与光晕断言。
- `scripts/acceptance.mjs`（manual）：AC-09 人工步骤。
- 红绿序: 先落 check.mjs 锚点跑 `node scripts/check.mjs` 证红（bundle 尚无动画），再落 CSS 证绿。
- `pnpm verify:fast` 编辑循环，`pnpm verify` 全量回归。
- 浏览器人工验证（黄金路径）：热更后以真实后台任务会话核对闪烁与光晕观感，汇报附截图证据。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-023/AC-09 | 新增 | UNIT/browser/manual | add | `scripts/check.mjs` 状态点脉冲与光晕契约；`e2e/specs/background-jobs.mjs` computed 断言；`scripts/acceptance.mjs` 人工步骤 |
| SOLUTION | 任务子卡状态点脉冲与光晕方案落点演进 | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行态任务子卡状态点闪烁并带同色相光晕 | `scripts/check.mjs#R-01-023/AC-09`、`e2e/specs/background-jobs.mjs#R-01-023/AC-09`、`src/client.mjs::dap-job-dot` |
| 异常 | 适用：stopping 分支换琥珀色相与光晕，脉冲沿用基态不中断 | `scripts/check.mjs#R-01-023/AC-09`、`src/client.mjs::renderJobCardInto` |
| 边界配置 | 适用：明暗两主题光晕观感，紧凑档仅保留行 1 时脉冲照常 | `scripts/acceptance.mjs#R-01-023/AC-09`、`src/client.mjs::dap-job-dot` |
| 副作用 | 适用：零 JS 与零 host 改动，签名与激活语义不变，等待卡静止纪律不受影响 | `package.json::verify` |

## 终态与证据

（active 期间留空，关闭时填写）
