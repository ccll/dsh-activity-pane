---
doc-type: task
mutation: lifecycle
id: T-054
---

# T-054 数量徽标去描边与外环

状态: completed
关联: R-01-002/AC-06 / 活动状态模型
风险等级: standard

## 背景与目标

东家反馈标题栏 n/m 数量徽标的胶囊描边突兀，要求去掉描边只留底色与文字；经问答澄清范围：列头 `.dap-count`、折叠窄条 `.dap-rail-count`、移动端开关 `.dap-toggle-count` 三处计数徽标一起去描边（含等待态橙色边框与 1px 外环光晕），底色、胶囊圆角、脉冲全部保留。UI/UX 改进走全链：PRD R-01-002/AC-06 改写（背景色与透明度一致、不带描边与外环）与 DESIGN「徽标计数与脉冲紧迫度」条目同步演进，两闸口均经东家确认。

## 差距评估

- 三处徽标基态各带 `border: 1px solid transparent`（原为避免等待态边框出现/消失引起尺寸跳动；等待态不再有边框后该常驻透明边框失去存在理由，一并移除）。
- 三处等待态各带 `border-color: color-mix(in srgb, #e8a33d 55%, transparent)` 与 `box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent)` 外环。
- 浅色主题覆盖块为上述三选择器统一覆盖 `background` + `border-color` + `box-shadow: none`；去描边后只剩背景覆盖一行。
- check.mjs 多条断言精确锚定上述 CSS 文本（外环×3、border-color×3、浅色块声明体、基态闭合结构），需同步改写。
- acceptance.mjs R-01-002/AC-06 人工步骤含「底色、透明度与边框和等待卡片完全一致」「各验一次底色与边框」旧口径。
- 卡片上的等待标识徽标 `.dap-badge` 与等待卡描边不在范围，保持不变。

## 收敛方案

- `src/client.mjs`：三处基态删 `border` 声明（`.dap-count` 处防跳动注释一并移除）；三处等待态删 `border-color` 与 `box-shadow`，`.dap-count[data-awaiting]` 注释改为「底色/透明度与等待卡完全一致」；浅色覆盖块删 `border-color` 与 `box-shadow: none` 两行。
- `scripts/check.mjs`：R-01-002/AC-06 相关断言改写为新口径（无 border-color、无外环、浅色块仅背景覆盖），并补「三处等待态均无描边/外环」负向断言。
- `scripts/acceptance.mjs`：AC-06 人工步骤改写为「无描边与外环、底色/透明度与等待卡一致」口径。

## 测试计划

- `scripts/check.mjs`：更新 R-01-002/AC-06 断言（三处等待态无 border-color/box-shadow、浅色块声明体、基态规则闭合结构），锚定 AC-ID 不变。
- `scripts/acceptance.mjs`：R-01-002/AC-06 人工步骤同步新口径。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三处徽标任意主题下无描边与外环，等待态仅底色/透明度 + 脉冲 | `scripts/check.mjs#R-01-002/AC-06`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：浅色主题覆盖块仍正确覆盖等待态底色；无等待态时徽标基态无描边 | `scripts/check.mjs#R-01-002/AC-06`、`src/client.mjs::CSS` |
| 副作用 | 适用：等待卡描边、`.dap-badge` 闪烁徽标、脉冲动画与占比周期不变 | `scripts/check.mjs#R-01-002/AC-06`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/client.mjs` 三处徽标基态删常驻透明 `border`（`.dap-count` 防跳动注释一并移除）；三处等待态删 `border-color` 与 `box-shadow` 外环，`.dap-count[data-awaiting]` 注释改「底色/透明度与等待卡完全一致、无描边与外环」；浅色覆盖块删 `border-color` 与 `box-shadow: none` 仅留背景覆盖。底色、胶囊圆角、脉冲保留；等待卡描边与 `.dap-badge` 未动。`.dsh-plugin/client.js` 已重新生成。
- 测试: `scripts/check.mjs` R-01-002/AC-06 断言改写（三处等待态底色直连脉冲×3、无 1px 外环负向断言、浅色块声明体、基态规则闭合结构），`scripts/acceptance.mjs` AC-06 人工步骤同步新口径；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。
- DESIGN 对照: PRD R-01-002/AC-06 与 DESIGN「徽标计数与脉冲紧迫度」条目已按闸口确认文案改写，与实现一致；需求追溯索引既有行保持准确。
- commit: d440ff3ed7d784832bb49b5191a0dfa907610658
- review:
  - 审核方: Standards 子代理 `7ed3f13c-180f-4996-bca9-fed8564743fb`；Spec 子代理 `74fb5360-25f3-4cf5-8837-63be11880f34`。
  - 目的理解: 三处计数徽标（`.dap-count`/`.dap-rail-count`/`.dap-toggle-count`）基态与等待态整体去描边（含等待态橙色边框与 1px 外环），仅留底色与文字；脉冲、底色、圆角保留；关联 R-01-002/AC-06 改写口径与 DESIGN 徽标条目；等待卡描边与 `.dap-badge` 不在范围；预期行为与验证以 PRD 验收点 + check/acceptance 锁点为准（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill；固定基线 `968d1dcefe42a56d921efe53b48ceba07531488c`，范围 `git diff 968d1dcefe42a56d921efe53b48ceba07531488c...HEAD` 的 T-054 工作单元（单提交 d440ff3ed7d784832bb49b5191a0dfa907610658）；Standards/Spec 双轴并行审核。
  - 问题与修复: 无 finding。Standards 两条 judgement call（三处徽标 CSS 等待态形状重复、check.mjs 精确文本锁定断言脆弱）均为仓库既有模式，不属本次改动责任，不修。
  - 复审结论: Standards 通过；Spec 通过，无遗留 finding，无需复审。
