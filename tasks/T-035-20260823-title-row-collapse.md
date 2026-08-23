---
doc-type: task
mutation: lifecycle
id: T-035
---

# T-035 桌面列折叠改为标题行整体控件

状态: active
关联: R-01-011 → 窗格渲染器
风险等级: standard

## 背景与目标

桌面窗格原折叠/展开由两个位置割裂的控件承担：header 内 20px 独立 « 按钮负责收起，折叠后 34px 窄条负责展开，快速往返需移动鼠标寻找目标（东家反馈，TODO 缺陷线索已升级为需求）。PRD R-01-011 已经东家确认改写：以「活动会话」标题行整体作为收起/展开控件，两种状态下手柄均位于窗格顶部同一位置；无动画；移动端不提供标题行收起。DESIGN 同步演进（标题行整体折叠控件）。

## 差距评估

- `src/client.mjs`：header 内存在独立 `.dap-collapse` 按钮（click → 折叠）；header 行本身不可点；折叠窄条 `.dap-rail` 仅显示计数、无竖排标题；折叠态未隐藏 header（标题被 34px 宽度裁切残留）。
- `scripts/check.mjs`：bundle 契约断言绑定旧实现（`collapse?.addEventListener("click", onCollapseClick)`）。
- `scripts/acceptance.mjs`：验收步骤锚定已删除的 R-01-011/AC-01、AC-02。

## 收敛方案

- `src/client.mjs`：
  - 模板：移除 `.dap-collapse` 按钮；`.dap-header` 加 `role="button"` `tabindex="0"` `aria-expanded`，行尾加方向符号 `«`（aria-hidden，行的一部分）；`.dap-rail` 内计数前加竖排标题 span「活动会话」。
  - 样式：header `cursor: pointer` + hover 高亮；折叠态 `display: none` 隐藏 header；rail 标题 `writing-mode: vertical-rl`；删除 `.dap-collapse` 全部 CSS。
  - 交互：`bindPaneControls` 移除 onCollapseClick；新增 header click 与 keydown（Enter/Space）处理，仅桌面断点（`matchMedia("(min-width: 768px)")`）生效，置 `collapsed = true`；rail click 展开不变；渲染同步 `data-collapsed` 处同步 header `aria-expanded`；unbind 对称清理。
- `scripts/check.mjs`：bundle 契约断言替换为新实现锚点（header role/aria-expanded、rail 竖排标题、无 dap-collapse 残留），锚定 R-01-011/AC-03～AC-06。
- `scripts/acceptance.mjs`：替换 R-01-011/AC-01、AC-02 两条步骤为 AC-03～AC-06 新锚点步骤。
- 不新增依赖；`src/core.mjs` 不变。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约。
- `python3 tools/agentmap_lint.py --report`：追溯完整（R-01-011 / 4 AC / 4 锚点）。
- `git diff --check`：空白检查。
- GUI 现场演示（标题行收起、窄条竖排标题展开、同位往返、移动端不受影响）由东家验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：标题行收起、窄条展开、同位往返 | `scripts/check.mjs#R-01-011/AC-03`、`scripts/acceptance.mjs#R-01-011/AC-03`、`src/client.mjs::bindPaneControls`、GUI 现场验收 |
| 异常 | 适用：键盘激活（Enter/Space）与鼠标点击路径一致；移动端断点误触不折叠 | `scripts/acceptance.mjs#R-01-011/AC-06`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：折叠态无拖拽手柄/宽度持久化等既有行为不回归；移动端抽屉开关不受影响 | `scripts/check.mjs#R-01-015/AC-03`、`scripts/acceptance.mjs#R-01-011/AC-06`、`src/client.mjs::bindPaneControls` |
| 副作用 | 适用：卸载移除全部监听；不引入定时器与轮询；纯 DOM 层变更 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |

## 终态与证据

（active：实现、测试、DESIGN 对照、commit 与 review 证据在关闭时填写。）
