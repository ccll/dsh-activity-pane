---
doc-type: task
mutation: lifecycle
id: T-098
---

# T-098 数量胶囊固定同步脉冲

状态: active
关联: R-01-002/AC-06、AC-07、AC-08 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 列头、折叠窄条与移动端「活动」按钮三处数量胶囊当前按等待行动占比改变脉冲周期，与等待卡末行文字的固定节奏不同且会错相。
- 目标: 三处数量胶囊统一改为固定 1.2s 脉冲，并与所有等待卡末行类型胶囊和正文同频同相。
- 非目标: 不改变数量、颜色优先级、底色、透明度、描边、等待类别、卡片正文或提醒解除语义。

## 差距评估

- `src/core.mjs` 的 `awaitPulsePeriod` 与快慢端常量仍按等待占比派生 0.5–1.6s 周期。
- `src/client.mjs` 经 `--dap-await-period` 给三处数量胶囊写入变速周期；等待卡末行固定使用 1.2s `dap-pulse`。
- 新等待卡可在数量胶囊动画已运行后出现，只统一 duration 仍不能保证相位同步。
- PRD R-01-002/AC-06、AC-07 已经东家确认并先行演进；DESIGN 方案已确认，待同步落盘。

## 收敛方案

1. 删除核心层的占比周期派生与快慢端常量，数量统计只保留计数与 tone 语义。
2. 三处数量胶囊固定使用 `dap-await-pulse 1.2s ease-in-out infinite`，不再写入 CSS 周期变量。
3. 渲染器以排序后的等待条目 id/类别集合与当前可见数量胶囊表面组成脉冲队列签名；签名变化后，在同一渲染帧统一重启三处数量胶囊及全部等待卡末行胶囊/正文动画，且仅在整轮渲染成功后提交签名。
4. 同步 PRD、DESIGN、DECISIONS、unit/contract、browser E2E 与 manual 验收证据，重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-002/AC-06 | 三处数量标识范围显式化，既有底色与门控不变 | UNIT/E2E/MANUAL | update | bundle 断言三处固定动画；浏览器与人工验收覆盖三处 |
| R-01-002/AC-07 | 占比变速改为固定 1.2s，并与等待卡末行同步 | UNIT/E2E/MANUAL | update | 删除周期纯函数断言；computed style 与 Web Animations 相位断言 |
| R-01-002/AC-08 | 等待卡末行加入跨数量胶囊的同步队列 | E2E/MANUAL | update | 新等待状态出现后断言数量胶囊与卡片末行动画同相 |
| DESIGN | 徽标脉冲派生与同步机制变化 | UNIT/E2E | update | 同步核心机制、产品契约与实现证据 |

## 测试计划

- 测试先行：先更新 `scripts/check.mjs` 与 `e2e/specs/auto-update.mjs`，确认旧实现因变速周期与缺少同步机制失败。
- 运行 `pnpm verify:fast`。
- 运行 focused browser E2E：`node e2e/run.mjs auto-update`。
- 运行 `pnpm verify`。
- 刷新现有 `http://127.0.0.1:3080/`，目验三处数量胶囊与等待卡末行同亮同暗。
- 调用 `code-review` skill 做独立双轴审核并处理 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三处数量胶囊均固定 1.2s 且与等待卡末行同相 | `package.json::check`、`package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-07`、`package.json::accept:manual` |
| 异常 | 适用：无等待行动时三处数量胶囊均停止脉冲 | `package.json::check`、`package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-06` |
| 边界配置 | 适用：等待占比与等待类别变化不改变周期，并触发全队列重新对相 | `package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-07` |
| 副作用 | 适用：n/m、tone、红/金/绿底色、无描边与按钮不闪保持不变 | `package.json::check`、`package.json::test:e2e`、`package.json::accept:manual` |

## 终态与证据

状态: active
