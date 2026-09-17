---
doc-type: task
mutation: lifecycle
id: T-143
---

# T-143 显示档位循环方向反转为升序（紧凑→中间→完整）

状态: active
关联: R-01-021/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈显示档位切换按钮当前的循环次序是完整→中间→紧凑（信息量从大到小），希望反过来从小到大切换：紧凑→中间→完整（信息量从小到大）。R-01-021/AC-01 的验收语义是「三档呈现间循环切换 + 滚动锚定」，未规定循环方向；方向属 DESIGN 承载的实现语义（产品契约两处写明「按完整→中间→紧凑循环」）。本次仅反转循环方向，三档内容、锚定、持久化与按钮落位语义均不变。

## 差距评估

- `src/core.mjs`：`DENSITY_ORDER = ["full", "medium", "compact"]`，`nextDensity` 沿此序循环——反转数组即反转循环方向。
- `src/client.mjs`：`applyDensity` 经 `nextDensity` 派生按钮可访问名称（表达目标档位），方向反转自动跟随；仅 2124 行注释与骨架按钮初始 `aria-label`/`title`（对应默认中间档的目标档）需同步。
- `scripts/check.mjs`：3476–3479 四条 `nextDensity` 断言钉住旧方向（R-01-021/AC-01 锚点）。
- `e2e/specs/compact-density.mjs`：中间档 label 断言与三处按名称点击按钮的档位推进路径按旧方向编排。
- `DESIGN.md`：产品契约与窗格渲染器模块条目两处条目共三处「完整→中间→紧凑循环」措辞。
- `DOMAIN.md`「显示档位」术语条目、`scripts/acceptance.mjs` 人工验收步骤、`e2e/specs/compact-density.mjs` 文件头注释各有一处旧方向措辞（初版差距评估遗漏，Spec 审核发现后补入本清单并同步修正）。

## 收敛方案

- 测试先行：反转 `scripts/check.mjs` 四条 `nextDensity` 断言（锚定 R-01-021/AC-01），运行确认旧实现转红。
- `src/core.mjs`：`DENSITY_ORDER` 改为 `["compact", "medium", "full"]`，注释与 `nextDensity` JSDoc 同步为「紧凑 → 中间 → 完整 → 紧凑」。
- `src/client.mjs`：2124 行注释同步；骨架按钮初始可访问名称改为「切换为完整显示」（默认中间档的新目标档）。
- `e2e/specs/compact-density.mjs`：label 断言改为「切换为完整显示」（中间档下）；原「一步到位」的三处点击改为沿新方向的两步点击（中间→完整→紧凑、紧凑→中间→完整、完整→紧凑→中间），并提取 `stepDensity` helper 统一推进写法。锚定断言改在「中间→完整」一步切换上量测（变高方向补偿目标必然可达、无滚动钳制干扰）；向小档切换后列表低于视口的滚动钳制分支（DESIGN 边界语义）自原 spec 起即无 E2E 直接证据，本次维持该缺口并在终态残余风险记录。
- `DESIGN.md`：两处循环方向措辞改为「按紧凑→中间→完整循环」。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-021/AC-01）。
- `pnpm test:e2e`（`e2e/specs/compact-density.mjs` 锚定 R-01-021/AC-01，浏览器实测循环方向）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：循环方向由「完整→中间→紧凑」改为「紧凑→中间→完整」，三档内容/锚定/持久化语义不变 | UNIT/E2E | update | 产品契约与模块条目两处方向措辞反转，AC-01 验收语义（三档循环 + 锚定）不变，测试断言随实现方向同步改写 |
| R-01-021/AC-01 | 保持：三档循环切换与滚动锚定语义不变，仅循环方向反转（东家指令） | UNIT/E2E | update | `scripts/check.mjs#R-01-021/AC-01` + `e2e/specs/compact-density.mjs#R-01-021/AC-01`——AC 正文未规定方向，断言随实现方向翻转；锚定断言改走「中间→完整」变高方向（补偿必然可达），钳制分支证据缺口承接原状 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：新方向循环 紧凑→中间→完整→紧凑，按钮可访问名称始终表达目标档位 | `scripts/check.mjs#R-01-021/AC-01`、`src/core.mjs::nextDensity` |
| 异常 | 适用：非法持久化值归一中间档后再循环，下一档为完整 | `scripts/check.mjs#R-01-021/AC-01`、`src/core.mjs::normalizeDensity` |
| 边界配置 | 适用：滚动锚定在两步推进路径下语义不变；窄条不显示按钮 | `e2e/specs/compact-density.mjs#R-01-021/AC-01`、`src/client.mjs::onDensityClick` |
| 副作用 | 适用：档位持久化与刷新恢复不受方向影响；会话状态变化不解除档位 | `e2e/specs/compact-density.mjs#R-01-021/AC-06`、`src/client.mjs::writeStoredDensity` |
| 兼容性 | 适用：既有 localStorage 档位值仍合法，恢复后沿新方向循环 | `scripts/check.mjs#R-01-021/AC-06`、`src/core.mjs::normalizeDensity` |

## 终态与证据

- 实现: （active，关闭前填写）
- 测试: （active，关闭前填写）
- DESIGN 对照: （active，关闭前填写）
- commit: （active，关闭前填写）
- review: （active，关闭前由独立 code-review 填写）
