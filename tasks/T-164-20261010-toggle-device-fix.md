---
doc-type: task
mutation: lifecycle
id: T-164
---

# T-164 真机落位失效与宽度观感修复（诊断闭环）

状态: active
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家真机（iOS Safari，390×844pt）多轮反馈「胶囊还是浮空/太长」。桌面 Chromium 与桌面 WebKit 均复现不出。经临时自诊断码（东家真机截图回报 `E:P1:w64n46` / `F:H:P1:w64n46` / 会话态 `E:...n49ps`）取得真机事实，结论：

- **引擎自然排版宽 46px，与桌面一致——「拉伸」从未在布局层存在**。此前截图的「长胶囊」是胶囊与相邻宿主标题芯片两个暗色圆角块在截图里融为一体的观感。
- 会话态嵌入成功（`E` + 行首 + `position:static`）；英雄页 `F:H`（无头部）回退浮层为 AC-04 约定的兜底行为。
- 东家真机曾出现「胶囊浮于宿主抽屉之上」：因胶囊彼时处于兜底态（fixed、高层级）。胶囊回到文档流后宿主抽屉自然覆盖，无需额外隐藏机制（曾实现的命中测试式隐藏按 YAGNI 撤除，英雄态误判会常驻隐藏开关）。

本 task 交付两项加固并撤除诊断设施：宽度硬钳制与定位关键量内联钉死。

## 差距评估

- `src/client.mjs`：`width:max-content` 在真机上不足以约束观感（结合宿主相邻元素易读作长胶囊），无硬上限；嵌入/兜底定位依赖样式表规则（`.dap-toggle[data-embedded]` 等），样式与脚本状态失配时定位失效。
- 临时自诊断码已按承诺撤除（徽标旁 8px 状态码、1.5s 独立周期、cleanup 清理），不进入提交。

## 收敛方案

- `src/client.mjs`：
  - `.dap-toggle` 与 `[data-embedded]` 增加 `max-width: 64px`：徽标单挂内容宽 ≤ 60px（两位计数），钳值不裁内容；真机渲染宽收敛 46–64px。
  - `placeToggle` 以内联样式钉死定位关键量：嵌入态 `position:static` 并清 `top/left`；兜底态 `position:fixed; top:12px` 并写动态 `left`。样式表只承担外观，定位不再依赖其状态。
- `SOLUTION.md`：开关机制段补两条（内联钉位、max-width 钳制）。

## 测试计划

- `scripts/check.mjs`：钉宽断言扩为含 `max-width: 64px`；既有落位/兜底断言沿用。
- `e2e/specs/mobile-drawer.mjs`：AC-04 断言沿用（行首嵌入、不遮挡、兜底、留位）；真机观感留人工。
- `pnpm verify:fast`；全量 `pnpm verify`；真实环境（东家运行实例）chromium+webkit 双内核探针 + 东家真机诊断截图（证据见终态）。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：真机会话态嵌入成功（诊断码 `E`）、自然排版宽 46px 与桌面一致、钳制后渲染宽 ≤ 64px | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：英雄页无头部回退兜底浮层（真机诊断码 `F:H` 证实）、仍可见可点 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：三位数计数（如 100/100）超出钳值时内容溢出绘制（无 overflow 裁剪）——当前计数规模不触达，记录为边界 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：内联钉位随落位守卫每轮写入、卸载时随节点移除消失，无跨实例残留；抽屉/遮罩交互不变 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::placeToggle` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | 实现加固（max-width 钳制 + 内联钉位），AC 正文不变 | UNIT/E2E | update | `scripts/check.mjs` 钳制断言；`e2e/specs/mobile-drawer.mjs` 沿用 |
| SOLUTION | 开关机制段补内联钉位与钳制两条 | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 终态与证据

（待实现完成后填写）
