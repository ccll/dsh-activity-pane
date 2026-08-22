---
doc-type: task
mutation: lifecycle
id: T-027
---

# T-027 滚动条仅滚动时显示

状态: completed
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

- 实现: `src/client.mjs` 新增 `.dap-scroll` 滚动条双路径 CSS（WebKit 伪元素默认透明 + data-scrolling 显示；Firefox scrollbar-color 走 @supports 门）与 `bindPaneControls` 滚动监听/600ms 隐藏定时器（unbind 同步清理）；`.dsh-plugin/client.js` 已重新生成。
- 测试: `node scripts/check.mjs` 通过（新增 R-01-004/AC-03 双路径与监听断言、R-02-003/AC-02 unbind 清理序列断言）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过。`scripts/acceptance.mjs` 新增 R-01-004/AC-03 人工验收步骤，真实滚动表现仍需人工 GUI 验收。
- DESIGN 对照: 呈现与交互细节属实现自由，DESIGN 无需演进；R-01-004 需求追溯索引既有行保持准确。
- commit: e8b076f
- commit: c549e83
- review:
  - 审核方: Standards 子代理 `46b8c897-252d-4b79-851d-02664e80290e`；Spec 子代理 `270eef05-9df1-465f-90f9-404f764f3fc1`。
  - 目的理解: 实现 R-01-004/AC-03——窗格滚动条默认不显示、滚动时显示、停滚约 600ms 后隐藏；双路径 CSS 与滚动监听 JS，卸载/重挂载清理监听与定时器；不改主会话滚动行为与滚动隔离。
  - 执行方式: `code-review` skill；固定基线 `cffd240`，范围为 `git diff cffd240...HEAD` 的 T-027 工作单元；Standards/Spec 双轴并行审核，修复后由同一审核方分别复审。
  - 问题与修复: Spec 初审 finding——卸载清理断言被 onScroll 重置分支同名文本穿检；修复为断言锚定 unbind 内 removeEventListener+clearTimeout 连续两行序列，并顺带删除双轴指出的 onScroll 不可达防御分支（c549e83）。Standards 另两条 judgement call（scroll 命名遮蔽、color-mix 重复）按审核方「可不改」结论保留。
  - 复审结论: Standards 复审通过；Spec 复审确认 finding 清零、修复未引入新问题，双轴闭环。
