---
doc-type: task
mutation: lifecycle
id: T-027
---

# T-027 滚动条仅滚动时显示

状态: active
关联: R-01-004/AC-03 / 窗格渲染器
风险等级: standard

## 背景与目标

TODO 条目「滚动条默认不显示，仅在用户滚动时显示，与左边栏保持一致」经东家确认升级为 R-01-004/AC-03，目标行为选定为「滚动时显示、停后隐藏」。窗格自身原本无任何滚动条样式，Chromium 下吃全局主题 8px 常驻滚动条。

## 差距评估

- `.dap-scroll` 无滚动条样式，需新增 thumb 默认透明 + `data-scrolling` 显示的双路径 CSS（WebKit 伪元素 / Firefox scrollbar-color，后者必须在 @supports 门内——非 auto 值会令 Chromium 丢弃伪元素规则，与全局主题 scrollbar.css 同款写法）。
- 需一处滚动监听 JS：`bindPaneControls` 绑定 `.dap-scroll` 的 scroll 事件置位 `data-scrolling`，停滚 600ms 后移除；unbind 清理监听与定时器（R-02-003 纪律）。这是本批纯样式条目中唯一带 JS 逻辑的条目。

## 收敛方案

- CSS：`.dap-scroll::-webkit-scrollbar-thumb` 默认透明、`[data-scrolling]` 时取 `--dsh-scrollbar-thumb`（回退 color-mix 25%）；@supports 门内 Firefox `scrollbar-color` 双态。
- JS：扩展 `bindPaneControls` 增加 scroll 监听与 600ms 隐藏定时器，返回的 unbind 同步清理。
- 不改动主会话区域滚动行为与滚动隔离语义（R-01-004/AC-02）。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言双路径 CSS、滚动监听绑定与卸载清理（锚定 R-01-004/AC-03、R-02-003/AC-02）。
- `scripts/acceptance.mjs`：新增 R-01-004/AC-03 人工验收步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：滚动时显示、停滚约 600ms 后隐藏 | `scripts/acceptance.mjs#R-01-004/AC-03`、`src/client.mjs::bindPaneControls` |
| 异常 | 适用：快速反复滚动时隐藏定时器重置不叠加 | `scripts/check.mjs#R-01-004/AC-03`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：Chromium 伪元素路径与 Firefox scrollbar-color 路径互不干扰 | `scripts/check.mjs#R-01-004/AC-03`、`src/client.mjs::CSS` |
| 副作用 | 适用：卸载/重挂载清理监听与定时器；主会话滚动不受影响 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |

## 终态与证据

（待填写）
