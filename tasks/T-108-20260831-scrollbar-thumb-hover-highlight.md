---
doc-type: task
id: T-108
mutation: lifecycle
---

# T-108 原生滚动条滑块悬停高亮

状态: active
关联: R-01-004/AC-03 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: T-107 已让 activity-pane 的 native scrollbar 可命中并在指针进入窗格时显示，但当前 `.dap-scroll` 的局部 thumb 显示规则覆盖了 DSH 全局 `::-webkit-scrollbar-thumb:hover`，鼠标移到滑块上仍保持普通颜色。
- 对照: DSH scrollbar theme 使用 `--dsh-scrollbar-thumb` 呈现普通滑块、`--dsh-scrollbar-thumb-hover` 呈现 WebKit hover 状态；Firefox 标准路径由浏览器派生 hover 状态。
- 目标: 鼠标悬停 activity-pane 的 native scrollbar thumb 时，显示与 DSH 左边栏一致的主题 hover 色，同时保留现有指针显隐、native 拖动和调宽边界。
- 非目标: 不改 scrollbar/resize 几何，不新增 JavaScript hover 状态，不自绘滚动条，不改变 Firefox 的标准 scrollbar 路径，不改变移动端/折叠态行为。

## 差距评估

- `src/client.mjs` 已为 `.dap-scroll` 声明默认透明、`data-scrolling` 和 `data-pointer-inside` 三条 WebKit thumb 规则，但缺少局部 `::-webkit-scrollbar-thumb:hover` 覆盖。
- DSH theme 已提供 `--dsh-scrollbar-thumb-hover` 与全局 WebKit hover 规则；由于 activity-pane 的局部 base selector specificity 更高，主题 hover token 当前不会生效。
- `PRD.md` 的 `R-01-004/AC-03` 已承诺显示/隐藏滚动条，但尚未明确滑块 hover 高亮，也没有对应 E2E/人工验收。

## 收敛方案

1. 更新 `R-01-004/AC-03`，增加 scrollbar thumb 悬停时使用更醒目主题色的可观察承诺。
2. 在 `src/client.mjs` 的现有 WebKit scrollbar 规则后增加一条带 `data-pointer-inside` 的高 specificity `::-webkit-scrollbar-thumb:hover` 规则，读取既有 `--dsh-scrollbar-thumb-hover`，只补 CSS cascade，不引入新的状态或依赖。
3. 在 `scripts/check.mjs` 固定 hover selector 与 hover token 的 bundle 契约。
4. 在 `scripts/check.mjs` 固定 hover selector 与主题 token；保留 `e2e/specs/long-list.mjs` 对 scrollbar 显示、命中与拖动的回归，并更新 `scripts/acceptance.mjs` 的真实浏览器视觉验收。Playwright synthetic mouse 不暴露 Chromium 原生 scrollbar pseudo 的 OS hover 状态，因此 hover 色由 CSS 契约与 headed GUI 验收证明。
5. 重建 `.dsh-plugin/client.js`，运行快速验证、focused E2E、完整验证与 headed GUI probe。
6. 调用 `code-review` skill 做独立 Standards/Spec 双轴审核，finding 清零后关闭 task。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-004/AC-03 | 增加 scrollbar thumb 悬停时的主题 hover 高亮承诺 | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-004/AC-03`、`e2e/specs/long-list.mjs#R-01-004/AC-03`、`scripts/acceptance.mjs#R-01-004/AC-03` |
| R-01-004/AC-01～AC-02 | 滚动可达与主会话滚动隔离保持不变 | E2E | regression | `e2e/specs/long-list.mjs#R-01-004/AC-01`、`e2e/specs/long-list.mjs#R-01-004/AC-02` |
| R-01-015/AC-01 | 右缘调宽与 native thumb 拖动边界保持不变 | E2E/MANUAL | regression | `e2e/specs/resize.mjs#R-01-015/AC-01`、`scripts/acceptance.mjs#R-01-004/AC-03` |
| DESIGN | 记录 hover 使用现有 DSH scrollbar theme token，Firefox 由平台派生 | UNIT/MANUAL | update | `DESIGN.md#R-01-015`、`scripts/check.mjs#R-01-004/AC-03` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：指针进入窗格显示 thumb，悬停 thumb 切换 hover 色，native 拖动和调宽仍可用 | `scripts/check.mjs#R-01-004/AC-03`、`e2e/specs/long-list.mjs#R-01-004/AC-03`、`scripts/acceptance.mjs#R-01-004/AC-03`、`src/client.mjs::CSS`、headed Chromium probe |
| 异常 | 适用：pointer leave 后普通/hover 显示规则不残留，窗格卸载不残留监听或属性 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：theme hover token 缺失时 fallback 仍提供可见差异；Firefox 标准路径不被 WebKit 规则干扰 | `scripts/check.mjs#R-01-004/AC-03`、`src/client.mjs::CSS`、headed Chromium probe |
| 副作用 | 适用：hover 只改变 thumb 颜色，不改变滚动区几何、pane 宽度、滚动隔离或移动端行为 | `e2e/specs/long-list.mjs#R-01-004/AC-02`、`e2e/specs/resize.mjs#R-01-015/AC-01`、`e2e/specs/mobile-drawer.mjs#R-01-008/AC-03`、`src/client.mjs::CSS` |

## 测试计划

- 先更新 `scripts/check.mjs` 与 `e2e/specs/long-list.mjs` 的 AC-03 断言，使当前缺少 hover 规则的实现失败。
- 修改 `src/client.mjs`、`PRD.md`、`DESIGN.md`、`scripts/acceptance.mjs`，重建 `.dsh-plugin/client.js`。
- 使用 headed `/opt/google/chrome/chrome` 对 `http://127.0.0.1:3080/` 验证：指针进入调宽区时 thumb 显示普通色，移到 thumb 后视觉变为 hover 色；native thumb 拖动与 pane 调宽仍分别生效。
- 运行 `pnpm verify:fast`、focused `pnpm test:e2e long-list`、`pnpm verify` 与 `pnpm check:staged-client`。
- 调用 `code-review` skill 做独立 Standards/Spec 双轴审核，finding 清零后再关闭 task。

## 终态与证据

待实现。
