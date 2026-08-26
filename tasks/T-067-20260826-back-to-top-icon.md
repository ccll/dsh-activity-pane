---
doc-type: task
mutation: lifecycle
id: T-067
---

# T-067 回到顶部按钮图标化与右下角定位

状态: active
关联: R-01-018 / 窗格渲染器
风险等级: standard

## 背景与目标

东家变更 R-01-018 呈现：按钮改为纯图标（无文字）、定位于窗格右下角（不居中）、不透明底色。行为语义（阈值显隐、激活回顶、reduced-motion、窄条/移动端）不变。

## 差距评估

- 现状：`.dap-top` 为底部居中文字胶囊（`left:50%; transform:translateX(-50%)`），底色为 `color-mix(currentColor 10%)` 半透明，文案「↑ 回到顶部」。
- 需改：骨架去文字、加 `aria-label`/`title`；JS 侧注入向上箭头 SVG 图标（复用 `createInlineIcon` 工厂，canonical 图标集无现成箭头，自绘 Lucide arrow-up 几何描边路径）；CSS 改右下角定位 + 圆形 28px 盒 + 不透明底色（深浅主题）。

## 收敛方案

- 骨架：`<button class="dap-top" type="button" aria-label="回到顶部" title="回到顶部" hidden></button>`；`ensurePane` 创建后 `append(createTopIcon())`。
- 图标：`createTopIcon()` 经 `createInlineIcon` 产出 14px 向上箭头（viewBox 24，stroke currentColor 2px 圆角线帽，`aria-hidden` 由工厂保证）。
- CSS：`bottom:12px; right:12px`（去 left/transform），28px 圆形盒 flex 居中图标；深色不透明底 `#1d1f25` + 细描边，浅色覆盖块取 `--dsw-alias-bg-layer-2`/`--dsw-alias-border-l2`。
- 行为代码（syncTopBtn/onTopClick/阈值/清理）不变。

## 测试计划

- `scripts/check.mjs`：更新 R-01-018 断言——图标按钮骨架（无文字、aria-label）、右下角定位、不透明底色双主题、图标注入；保留行为断言。
- `scripts/acceptance.mjs`：更新 R-01-018 人工验收步骤（图标/右下角/不透明）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：右下角图标按钮，激活回顶 | `scripts/acceptance.mjs#R-01-018`、`src/client.mjs::bindPaneControls` |
| 异常 | 适用：reduced-motion 直接定位（行为不变，回归） | `scripts/check.mjs#R-01-018/AC-02`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：深浅主题底色均不透明；窄条隐藏、移动端抽屉适用不变 | `scripts/check.mjs#R-01-018/AC-05`、`src/client.mjs::CSS` |
| 副作用 | 适用：可访问名称保留（无文字不失可访问性）；监听清理不变 | `scripts/check.mjs#R-01-018/AC-05`、`src/client.mjs::ensurePane` |

## 终态与证据

（待填写）
