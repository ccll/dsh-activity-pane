---
doc-type: task
mutation: lifecycle
id: T-115
---

# T-115 原生侧栏选中会话后滚动定位当前卡片

状态: completed
关联: R-01-006/AC-01、R-01-006/AC-02 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 会话较多时，用户从 DSH 原生左侧栏切换会话，窗格会更新对应卡片的高亮，但滚动位置保持不变，选中的卡片可能仍在可视区域外。
- 目标: 原生侧栏切换当前会话后，若窗格中存在对应卡片且未完整可见，只把窗格列表滚动到能完整显示该卡片的最小必要距离；已完整可见时不改变滚动位置，不强制居中。
- 需求闸口: 东家本次明确要求选中的会话卡片滚动进入屏幕且完整可见。

## 非目标

- 不改变会话排序、活动区/历史区分页、卡片高亮样式或主会话内容滚动位置。
- 不为未加载到当前历史页的会话自动扩展历史分页；对应卡片不存在于窗格时保持现有呈现边界。
- 不引入滚动动画、定时器、轮询或新的宿主数据订阅。

## 差距评估

- `src/core.mjs::cardSignature` 已包含 `isCurrent`，原生侧栏切换会触发窗格重绘并更新 `data-current`。
- `src/client.mjs::renderCardIntoList` 只更新高亮属性，渲染完成后没有根据当前卡片与 `.dap-scroll` 可视矩形修正 `scrollTop`。
- 现有 `R-01-006/AC-01` 只验证当前卡片高亮，`R-01-004/AC-01` 只验证用户手动滚动，缺少原生侧栏切换后的完整可见回归。

## 收敛方案

1. 更新 AgentMap：
   - `PRD.md` 为 `R-01-006` 增加 `AC-02`，明确原生左侧栏切换后的最小必要滚动和不居中语义。
   - `DESIGN.md` 同步运行时交互、产品契约、需求追溯索引和窗格渲染器职责。
   - `DOMAIN.md` 与 README 中同步当前会话卡片的可见性承诺。
2. 在 `src/navigation.mjs` 增加最小 DOM 几何辅助：仅在卡片顶部超出或底部超出 `.dap-scroll` 可视矩形时调整 `scrollTop`，不调用会影响外层页面的全局滚动 API。
3. 在 `src/client.mjs` 记录最近一次已处理的当前卡片，渲染完成后只在当前会话变化或卡片 DOM 更换时调用辅助；没有当前卡片时不写滚动位置，避免每次运行时重绘打断用户手动浏览。
4. 先更新 `scripts/check.mjs` 的几何边界断言与 `e2e/specs/long-list.mjs` 的原生侧栏选择场景，使旧实现先失败；实现后重建 `.dsh-plugin/client.js`。
5. 更新 `scripts/acceptance.mjs`、中英文 README，运行快速、focused 与完整验证，并刷新现有 `http://127.0.0.1:3080/` 核验。

## 测试影响

| 需求/设计 | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-006/AC-01 | 当前会话高亮保持不变 | E2E | regression | `e2e/specs/navigation.mjs#R-01-006/AC-01` 继续比较当前/非当前卡片样式 |
| R-01-006/AC-02 | 新增原生侧栏切换后的最小滚动与完整可见承诺 | UNIT/E2E/MANUAL | add | `scripts/check.mjs#R-01-006/AC-02` 几何边界；`e2e/specs/long-list.mjs#R-01-006/AC-02` 原生 treeitem 选择后可视矩形断言；`scripts/acceptance.mjs` 映射保留 |
| R-01-004/AC-01～AC-03 | 用户手动滚动、滚动隔离与滚动条行为保持不变 | E2E | regression | `e2e/specs/long-list.mjs` 既有长列表、主会话滚动隔离与 scrollbar 断言 |
| R-01-005/AC-01 | 卡片点击/键盘跳转不受滚动修正影响 | E2E | regression | `e2e/specs/navigation.mjs#R-01-005/AC-01` |
| R-02-003 | 渲染去重与卸载清理不增加残留监听或定时器 | UNIT/E2E | regression | `scripts/check.mjs#R-02-003/AC-01`、`package.json::verify` |
| DESIGN | 当前会话外部切换后的滚动定位契约变化 | UNIT/E2E | update | `scripts/check.mjs#R-01-006/AC-02`、`e2e/specs/long-list.mjs#R-01-006/AC-02` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：原生侧栏选中窗格内、位于列表下方且未完整可见的卡片后，卡片完整进入 `.dap-scroll` 可视区域 | `e2e/specs/long-list.mjs#R-01-006/AC-02`、`src/client.mjs::render` |
| 异常 | 适用：无当前卡片或目标卡片不在已呈现集合时不写滚动位置，不抛错、不影响其它卡片 | `scripts/check.mjs#R-01-006/AC-02`、`src/client.mjs::render` |
| 边界配置 | 适用：卡片顶部超出、底部超出、恰好完整可见分别只向必要方向调整；不居中、不额外滚动 | `scripts/check.mjs#R-01-006/AC-02`、`e2e/specs/long-list.mjs#R-01-006/AC-02`、`src/navigation.mjs::scrollCardIntoView` |
| 副作用 | 适用：窗格滚动不改变主会话滚动，点击/键盘导航、高亮、历史分页、滚动条与轨道绘制不回归 | `e2e/specs/long-list.mjs#R-01-004/AC-01`、`e2e/specs/navigation.mjs#R-01-005/AC-01`、`package.json::verify` |
| 资源释放 | 适用：使用现有渲染生命周期，无新增监听、定时器或宿主订阅 | `scripts/check.mjs#R-02-003/AC-01`、`src/client.mjs::apply` |

## 测试计划

- 先修改 map、`scripts/check.mjs` 与长列表 E2E，运行 `node scripts/check.mjs` 与 focused E2E，确认旧实现缺少 AC-02 证据或行为按预期失败。
- 实现后运行 `pnpm verify:fast`，再运行 `pnpm exec node e2e/run.mjs long-list navigation`。
- 重建 `.dsh-plugin/client.js`，刷新现有 `http://127.0.0.1:3080/`，从原生左侧栏选中窗格中的下方会话，确认卡片完整可见且不强制居中。
- 调用 `code-review` skill 做 Standards/Spec 双轴独立审核；如有 finding，由同一审核方复审。
- 最终运行 `pnpm verify`、`git diff --check`，按规范提交并记录精确结果。

## 终态与证据

- 实现: `src/navigation.mjs::scrollCardIntoView` 按卡片顶部/底部越界量调整 `.dap-scroll.scrollTop`，并将目标限制在合法滚动范围；`src/client.mjs::ensureCurrentCardVisible` 只处理与 `currentId` 匹配、已呈现且有尺寸的当前卡片，在滚动后仍未完整可见时不提前写入去重状态；`.dsh-plugin/client.js` 已由 source 重建同步。
- 测试: `node scripts/check.mjs` 通过；`PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec node e2e/run.mjs long-list` 通过；最终 `PLAYWRIGHT_BROWSERS_PATH=0 pnpm verify` 通过（AgentMap、test-impact、unit 与全部 13 个 E2E spec，其中 `long-list.mjs` 与 `navigation.mjs` 均通过）；`git diff --check` 通过；刷新 `http://127.0.0.1:3080/` 后 HTTP 200、窗格数量为 1 且 `.dap-scroll` 正常挂载。
- DESIGN 对照: `PRD.md` 的 `R-01-006/AC-02` 已加入原生左侧栏切换后的最小滚动承诺；`DESIGN.md` 的运行时交互、产品契约、追溯索引与窗格渲染器职责已同步；`DOMAIN.md`、中英文 README、`scripts/acceptance.mjs` 与测试锚点已同步。
- commit: be4861e （✨ 改进(activity): 选中会话卡片自动滚动可见）。
- review:
  - 审核方: Standards reviewer `9a11d614-3090-41a3-af25-4722415ab44f`；Spec reviewer `54d0e428-9cc3-401c-9735-fb924b93d150`。
  - 目的理解: 审核目标为原生左侧栏切换后，只让已呈现且未完整可见的当前卡片以最小必要距离进入 `.dap-scroll`，不居中、不改变外层滚动，并保留高亮、手动滚动、分页与资源语义；关联 `R-01-006/AC-01～AC-02`、`R-01-004`、`R-01-005`。
  - 执行方式: 使用 `code-review` skill，固定基线 `cb4e370c7cff721b0fb8c367839e075e93dab9f5`，评审范围为 `git diff cb4e370c...HEAD`，提交列表为 `be4861e ✨ 改进(activity): 选中会话卡片自动滚动可见`；Standards/Spec 双轴独立复审。
  - 问题与修复: 复审前提出当前卡片身份校验、`scrollTop` 边界钳制、滚动后过早写入去重状态以及 E2E 顶部方向覆盖不足；`be4861e` 已分别增加身份匹配、合法范围限制、可见性复核与原生侧栏向上/向下回归断言。
  - 复审结论: Standards 无 documented standard 违反、无可成立 Fowler baseline smell；Spec 无缺失需求、无 scope creep、无逻辑错误；最终通过。
