---
doc-type: task
mutation: lifecycle
id: T-169
---

# T-169 移动端活动开关尺度对齐

状态: completed
关联: R-01-008/AC-07 / 窗格渲染器
风险等级: standard
出处: C-095

## 背景与目标

东家反馈移动端入口视觉偏小。

现行嵌入态高度为 26px。

计数文字字号为 10px。

宿主移动按钮基准为 38×38px。

目标是提升入口视觉重量。

目标是不改变落位与抽屉行为。

## 差距评估

- `src/client.mjs` 的外层按钮高度过小。
- `src/client.mjs` 的计数徽标缺少固定高度。
- `src/client.mjs` 的计数文字字号偏小。
- `scripts/check.mjs` 仍锁定旧尺寸。
- `e2e/specs/mobile-drawer.mjs` 未覆盖尺寸。
- `PRD.md` 缺少尺寸验收点。
- `SOLUTION.md` 缺少当前尺寸契约。

## 收敛方案

- 外层命中盒最小宽度固定为 44px。
- 外层命中盒高度固定为 38px。
- 外层按钮不增加可见底色或描边。
- 计数徽标最小宽度固定为 36px。
- 计数徽标高度固定为 24px。
- 计数徽标水平内边距固定为 8px。
- 计数文字字号固定为 12px。
- 嵌入态与 hero 态复用同一高度。
- 保留 `max-width: 64px` 计数上限。
- 保留现有落位、显隐和层级逻辑。

## 测试计划

- `scripts/check.mjs` 锁定新的 CSS 尺寸契约。
- `e2e/specs/mobile-drawer.mjs` 断言嵌入态尺寸。
- `e2e/specs/mobile-drawer.mjs` 断言 hero 态高度。
- `scripts/acceptance.mjs` 增加移动端观感检查。
- 运行 `pnpm verify:fast`。
- 运行移动端抽屉单 spec。
- 运行完整 `pnpm verify`。
- 用 WebKit、移动 UA、触屏与 390×844 壳层验证。
- 真机最终观感留东家验收。
- 关闭 task 前执行独立 `code-review`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：入口与宿主控件尺度对齐 | `scripts/check.mjs#R-01-008/AC-07`；`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| 异常 | 适用：hero 落位仍能垂直居中 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`；`src/client.mjs::placeToggle` |
| 边界配置 | 适用：计数内容变化不突破既有 64px 上限 | `scripts/check.mjs#R-01-008/AC-07`；`src/client.mjs::CSS` |
| 副作用 | 适用：落位、显隐、抽屉和标题行交互不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`；`scripts/check.mjs#R-01-008/AC-04`；`scripts/check.mjs#R-01-008/AC-05` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-07 | 新增尺寸承诺 | UNIT/E2E/MANUAL | add | `scripts/check.mjs`、`e2e/specs/mobile-drawer.mjs`、`scripts/acceptance.mjs` |
| R-01-008/AC-04 | 同一入口样式调整 | E2E | regression | 落位、遮挡、hero 贴靠行为保持不变 |
| R-01-008/AC-05 | 同一入口样式调整 | E2E | regression | 抽屉打开隐藏、关闭恢复保持不变 |
| SOLUTION | 方案尺寸契约更新 | UNIT | update | 同次变化同步当前实现尺寸 |
| RATIONALE | 新增 C-095 | - | add | 记录尺寸选择与被否方案 |

## 终态与证据

- 实现: 已完成。
  - 外层固定 44×38px。
  - 徽标固定 36×24px，字号 12px。
  - 长计数钳至 64px。
- 测试: 已通过。
  - `pnpm verify:fast` 通过。
  - `pnpm verify` 20/20 E2E 通过。
  - WebKit 移动 UA、触屏、390×844 探针通过。
  - 入口实测 44×38px，徽标实测 36×24px。
  - 点击后为 hidden，收起后为 visible。
- SOLUTION 对照: 已同步 R-01-008/AC-07、C-095 与当前 CSS 契约。
  - 嵌入态和 hero 态共用 38px 高度。
- commit: 503a9ea2c6978d4a08ca2478a7c7d977c19e1891
- review:
  - 审核方: daf7b0c7-00c4-4899-9d60-6441f75c65f9（Standards）；2424c775-c11e-408d-9f39-bf48fccabe11（Spec）。
  - 目的理解: 放大移动活动入口的可见尺度，保持嵌入/hero 落位、抽屉显隐、层级与 64px 上限不变。
  - 执行方式: `code-review` skill。
    - 基线为 HEAD=4a753c1。
    - 审核当前工作树与 T-169。
  - 问题与修复: 已完成。
    - 拆分 map 尺寸条目。
    - 固定 CSS 高度。
    - 改名 `toggleHeight`。
    - 补 WebKit 移动证据。
    - 增加长计数 64px 回归。
  - 复审结论: Standards 与 Spec 均无剩余 finding。
