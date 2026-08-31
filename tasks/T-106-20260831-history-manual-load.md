---
doc-type: task
id: T-106
mutation: lifecycle
---

# T-106 历史会话改为手动加载

状态: completed
关联: R-01-019/AC-01～AC-04 → 窗格渲染器；R-01-004/AC-01～AC-04、R-01-018/AC-01～AC-04 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: T-104 将历史会话改为客户端分批呈现，但当前滚动到底部会自动追加下一批；实际使用中用户容易被动加载过多不想查看的历史内容。
- 目标: 历史区有更多候选时，在列表底部显示一个可访问的「加载更多...」按钮；用户激活后才追加后续最多 10 条会话。
- 保持: 首批最多 10 条、剩余不足 10 条时全部追加、候选过滤与 `activityAt` 排序、活动/历史互斥、已显示卡片与详情读取、独立滚动、回到顶部、桌面与移动端抽屉行为。
- 非目标: 不改 DSH native `session.list` 的全量快照契约，不引入虚拟列表或新的数据路由；滚动到底部、IntersectionObserver 或首批未撑满视口均不再触发追加。

## 差距评估

- `src/client.mjs` 通过 `.dap-recent-tail`、`IntersectionObserver` 与 scroll fallback 在触底时调用 `loadMoreRecent()`，首批未撑满视口时也会自动补页。
- 历史区骨架没有手动加载控件，当前追加状态只由 observer/scroll 路径驱动。
- `R-01-019`、DESIGN、DOMAIN、README 与人工验收仍描述滚动触底追加，未表达用户显式点击这一触发条件。
- 现有 `recentVisibleCount`、10 条批次、详情按可见历史卡加载与列表重挂载重置可直接复用，无需新增状态模型。

## 收敛方案

1. map 原子演进：保留 `R-01-019` 编号与候选集合语义，将 AC-01～AC-03 改为无自动补页、底部按钮显隐与显式激活追加；同步 DESIGN、DOMAIN、README，并在 DECISIONS 追加手动触发选择。
2. `src/client.mjs`：删除历史尾部 sentinel、`IntersectionObserver`、scroll fallback 与渲染后的自动检查；在 `.dap-recent` 底部放置原生 `<button>`，仅在 `recentHasMore` 时显示，点击复用 `loadMoreRecent()` 追加最多 10 条；追加完成或候选耗尽后更新按钮状态，耗尽时隐藏。
3. 保持追加 guard 与 `recentVisibleCount`，双击/重复触发不得重复追加；按钮使用原生 `button` 的鼠标与键盘激活，保留独立滚动与主会话滚动隔离。
4. 测试先行：更新历史分页 browser E2E，断言触底不追加、按钮可见且点击追加 10 条、末批点击后耗尽并隐藏、桌面与移动抽屉均可用；同步 `scripts/check.mjs`、人工验收和测试影响记录。
5. 生成 `.dsh-plugin/client.js`，运行 focused E2E、`pnpm verify:fast` 与完整 `pnpm verify`；刷新 `http://127.0.0.1:3080/` 验收按钮位置、文案、显隐与点击行为。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-019/AC-01 | 首批未撑满视口不再自动补页；首批仍最多 10 条 | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-019/AC-01`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-01`、`scripts/acceptance.mjs#R-01-019/AC-01` |
| R-01-019/AC-02 | 触底追加改为用户激活底部「加载更多...」按钮 | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-019/AC-02`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-02`、`scripts/acceptance.mjs#R-01-019/AC-02` |
| R-01-019/AC-03 | 剩余批次与耗尽后按钮显隐保持可判定 | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-019/AC-03`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-03`、`scripts/acceptance.mjs#R-01-019/AC-03` |
| R-01-019/AC-04 | 手动追加不改变活动/历史互斥、独立滚动与回顶 | E2E/MANUAL | regression | `e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-04`、`e2e/specs/long-list.mjs#R-01-004/AC-01`、`e2e/specs/back-to-top.mjs#R-01-018/AC-01`、`scripts/acceptance.mjs#R-01-019/AC-04` |
| R-01-014/AC-02～AC-05 | 详情读取仍只覆盖已显示历史卡，追加后按可见性加载 | UNIT/E2E | regression | `scripts/check.mjs#R-01-014/AC-02`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-02` |
| R-02-003/AC-02 | 移除 observer 后仍清理按钮监听、卡片与窗格资源 | UNIT/E2E | update | `scripts/check.mjs#R-02-003/AC-02`、`e2e/specs/auto-update.mjs#R-02-002/AC-01` |
| DESIGN | 历史分页触发从触底自动追加改为按钮显式追加 | UNIT/E2E/MANUAL | update | `package.json::lint:agentmap`、`DESIGN.md#R-01-019`、`DOMAIN.md#历史分页`、`README.md`、`README.zh-CN.md` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：按钮仅在有更多历史时显示，点击追加后续最多 10 条 | `package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-02`、`package.json::check` |
| 异常 | 适用：滚动到底部不自动追加，重复点击不会重复追加，按钮激活仍走 guard | `package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-01`、`scripts/check.mjs#R-01-019/AC-02` |
| 边界配置 | 适用：0 条、少于 10 条、恰好 10/11 条、剩余少于 10 条及首批未撑满视口 | `package.json::check`、`package.json::test:e2e`、`scripts/check.mjs#R-01-019/AC-01`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-03`、`scripts/acceptance.mjs#R-01-019/AC-01` |
| 副作用 | 适用：活动/历史不重复，手动追加不改变主会话滚动，回顶与移动抽屉仍可用 | `package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-04`、`package.json::accept:manual` |
| 性能 | 适用：没有用户点击时不新增历史 DOM 与 models/history 读取；已有并发池保持 3 | `package.json::check`、`package.json::test:e2e`、`scripts/check.mjs#R-01-014/AC-02`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-01` |
| 恢复 | 适用：窗格重挂载后按钮监听与首批状态重新建立，不残留分页监听 | `package.json::check`、`package.json::test:e2e`、`scripts/check.mjs#R-02-003/AC-02`、`e2e/specs/auto-update.mjs#R-02-002/AC-01` |

## 测试计划

- 先更新 `scripts/check.mjs` 与历史分页 E2E，确认旧的 observer/scroll 自动追加实现按预期失败。
- 运行 `pnpm test:e2e recent-infinite-scroll`，覆盖桌面与移动端按钮点击、触底不追加、末批耗尽与按钮隐藏。
- 运行 `pnpm verify:fast` 与完整 `pnpm verify`。
- 刷新 `http://127.0.0.1:3080/` 做人工验收：历史区底部按钮位置与可访问名称，滚动到底部不自动加载，点击后才追加 10 条。
- 调用 `code-review` skill 做独立 Standards/Spec 双轴审核；finding 修复后由同一审核方复审。

## 终态与证据

状态: completed

- 实现: `src/client.mjs` 移除历史区 `.dap-recent-tail`、`IntersectionObserver`、scroll fallback 与首批自动补页；以原生 `<button class="dap-recent-more">` 在有未呈现候选时显示「加载更多...」，用户点击后复用 `loadMoreRecent()` 追加最多 10 条，追加期间防重复，候选耗尽后隐藏；`.dsh-plugin/client.js` 已同步重建。`PRD.md`、`DESIGN.md`、`DOMAIN.md`、README、DECISIONS、测试与人工验收已同步。
- 测试: 测试先行的旧实现 `pnpm check` 按预期在手动分页 bundle 契约处失败；实现后 `pnpm check` 与 `pnpm verify:fast` 通过，focused `pnpm test:e2e recent-infinite-scroll` 通过（首批 10 条、滚动到底部不追加、按钮点击追加、末批隐藏、桌面/移动独立滚动）；最终 `pnpm verify` 通过（13 个 browser spec 全部通过，`e2e: 全部 13 个 spec 通过（188399ms）`）。刷新 `http://127.0.0.1:3080/` 后 Playwright 确认 HTTP 200、窗格挂载，按钮文案为「加载更多...」且无历史候选时正确隐藏；`git diff --check` 干净。
- DESIGN 对照: `R-01-019/AC-01～AC-03` 已从触底自动追加收敛为首批不自动补页、底部按钮显式追加与耗尽隐藏；`R-01-019/AC-04` 的活动/历史互斥、独立滚动与回顶保持不变；详情按可见历史卡读取、桌面/移动抽屉、native `session.list` 非目标边界均无差异。
- commit: 23d9446
- commit: 38d0161
- review:
  - 审核方: Standards reviewer `72fad444-aa3f-4e4c-bd62-12a09ae8d77b`；Spec reviewer `e79321d8-2d80-4519-9880-ad34b9deb331`。
  - 目的理解: 在不改 DSH native `session.list` 契约的前提下，将历史会话从滚动触底自动追加改为用户激活「加载更多...」按钮后按最多 10 条追加；保留历史候选过滤、排序、详情渐进读取、活动/历史互斥、独立滚动及桌面/移动行为；关联 `R-01-019`、`DESIGN` 与 T-106。
  - 执行方式: `code-review` skill；固定基线 `f08e8a8`，审核范围 `git diff f08e8a8...38d0161` 及两个提交；Standards/Spec 双轴独立审核。
  - 问题与修复: Spec 初审无 finding。Standards 初审指出 task 尚处 `active` 且终态证据未填写，已在本终态更新补齐实现、测试、DESIGN 对照、commit 与 review 证据；初审提及旧按钮文案，复核当前 task、PRD、DESIGN、DOMAIN、README 与测试均已统一为「加载更多...」。Fowler baseline 无 finding。
  - 复审结论: Spec 0 findings；Standards 的实现代码、文档、测试与提交规范无 finding，task 终态证据已补齐。
