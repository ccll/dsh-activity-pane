---
doc-type: task
mutation: lifecycle
id: T-104
---

# T-104 历史会话无限滚动分页

状态: completed
关联: R-01-010/AC-01～AC-10 → 活动状态模型、窗格渲染器；R-01-019/AC-01～AC-04 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 最近历史区当前只承载 24 小时内、最多 20 条的非活动主会话；东家同意将其演进为可连续浏览的历史会话列表，首批显示最近 10 个，触底后追加后续 10 个。
- 目标: 取消最近历史的 24 小时与 20 条上限；在当前 DSH `session.list` 全量快照基础上，前端分批呈现历史卡片，详情读取仅覆盖已呈现批次，直到所有可见历史会话展示完。
- 保持: 活动/历史互斥、主会话过滤、归档/空会话/子代理/等待提醒/委托周期过滤、`activityAt` 精化排序、桌面与移动端独立滚动、回到顶部及卡片导航行为。
- 非目标: 不在本任务内改造 DSH native `session.list` 的网络分页；不引入虚拟列表、第三方滚动依赖或新的数据路由。

## 差距评估

- `src/core.mjs::buildRecent` 仍按 `HISTORY_WINDOW_MS` 过滤并以 `HISTORY_MAX` 截断。
- `src/client.mjs::render` 将完整 recent 集合直接渲染，并把全部历史卡作为 `loadNativeDetails` 目标；`.dap-scroll` 的滚动监听尚无触底追加逻辑。
- `session.list` 当前 v1 返回完整会话快照，`cursor` 未实现，因此本任务的分页是渲染/详情读取分页，不减少列表元数据传输。
- 既有 `activityAt` 在 history/turn timing 到达后可能精化并重新排序；分页状态必须保持已展示卡片唯一，并避免重复详情任务与滚动位置跳变。
- PRD、DESIGN、DOMAIN、README 仍把最近历史描述为 24 小时/最多 20 条，缺少首批 10 条、触底追加和末尾停止契约。

## 收敛方案

1. map 原子演进：PRD 将 R-01-010 的历史范围改为当前可见的非活动主会话，新增 R-01-019 约束首批/追加批次/末尾停止；DESIGN、DOMAIN、README 同步当前语义；DECISIONS 追加本次客户端分页与非目标边界。
2. `src/core.mjs`：移除 24 小时和 20 条截断，保留未来时间防御、既有候选过滤与 `activityAt` 倒序；增加稳定 id tie-break，保证相同活动时间下分页顺序确定。
3. `src/client.mjs`：增加每批 10 条的 `recentVisibleCount`，只渲染 visible prefix；在 `.dap-recent` 末端使用原生 `IntersectionObserver` 并以滚动检查兜底，首批未填满视口时自动补页；窗格重挂载时重置分页，列表短暂 pending 与普通实时快照更新时保持已展示数量。
4. 详情加载：`loadNativeDetails` 仅接收活动条目与已渲染历史条目；历史卡进入 visible prefix 后复用既有并发池、memo、失败重试和详情缓存，避免一次性读取全量历史。
5. 生成与测试：重建 `.dsh-plugin/client.js`；在 `scripts/check.mjs` 增加无限候选、稳定排序与分页契约，在 E2E/人工验收中覆盖首批 10、触底追加、末尾停止、滚动隔离、活动迁移和移动抽屉。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-010/AC-01 | 最近历史由 24 小时窗口改为当前可见的非活动主会话 | UNIT/E2E/MANUAL | update | `buildRecent` 跨窗口候选、历史区长列表与人工全量浏览 |
| R-01-010/AC-03、AC-08、AC-09 | 保持 activityAt 精化排序与到达后重排 | UNIT/E2E | regression | 既有 turn end 精化断言 + 稳定 tie-break 与分页边界断言 |
| R-01-019/AC-01～AC-04 | 新增首批 10、触底追加 10、无重复、末尾停止 | UNIT/E2E/MANUAL | add | `scripts/check.mjs` 分页状态契约、新增历史长列表浏览 spec、人工滚动步骤 |
| R-01-004/AC-01～AC-04、R-01-018/AC-01～AC-04 | 追加历史不破坏独立滚动和回顶 | E2E/MANUAL | regression | 复用 long-list/back-to-top 场景并增加追加后的断言 |
| R-01-014/AC-02～AC-05 | 详情只随已呈现历史页加载，仍可渐进填充与重试 | UNIT/E2E | regression | detail load target 与新批次可见后加载断言 |
| R-02-002/AC-01、R-02-003/AC-02 | 观察者、分页状态和卡片缓存随重挂载/卸载清理 | UNIT/E2E | regression | bundle 契约与窗格重挂载人工步骤 |
| DESIGN | 24h/20 条旧契约同步为全量可见历史 + 10 条渐进呈现 | UNIT/E2E/MANUAL | update | `package.json::lint:agentmap`、`DESIGN.md#R-01-019`、`DOMAIN.md#历史分页`、`README.zh-CN.md#最近历史` |

## 测试计划

- 测试先行：先更新 `scripts/check.mjs` 的历史范围、稳定排序和分页行为锚点，确认旧实现按预期失败。
- 运行 `pnpm verify:fast`，确认 AgentMap、test impact、核心断言和生成 bundle 通过。
- 运行受影响的历史长列表 E2E，并补跑 `long-list`、`back-to-top`、`session-lifecycle`。
- 刷新 `http://127.0.0.1:3080/` 做人工验收：首批 10、触底追加、首批不足视口自动补页、末尾停止、详情渐进加载、桌面/移动滚动隔离与回顶。
- 运行 `pnpm verify`；在关闭 task 前调用 `code-review` skill 做 Standards/Spec 独立审核，finding 修复后由同一审核方复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：首批 10 条、触底追加 10 条并可继续浏览所有候选 | `package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-01`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-019/AC-01` |
| 异常 | 适用：详情读取失败仍降级并在卡片重新可见时重试；观察者缺失不阻断窗格 | `package.json::check`、`scripts/check.mjs#R-01-014/AC-05`、`package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-02` |
| 边界配置 | 适用：0 条、少于 10 条、恰好 10/11 条、相同 activityAt、首批未撑满视口 | `package.json::check`、`scripts/check.mjs#R-01-019/AC-01`、`package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-03` |
| 副作用 | 适用：active/recent 不重复，追加不改变主会话滚动，回顶与移动抽屉保持可用 | `package.json::test:e2e`、`e2e/specs/long-list.mjs#R-01-004/AC-01`、`e2e/specs/back-to-top.mjs#R-01-018/AC-01`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-019/AC-04` |
| 性能 | 适用：未展示历史卡不发 models/history 读取；现有并发池上限保持 3 | `package.json::check`、`scripts/check.mjs#R-01-014/AC-02`、`package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-019/AC-01` |
| 恢复 | 适用：列表刷新/窗格重挂载后分页状态与卡片缓存收敛，不残留 observer/listener | `package.json::test:e2e`、`e2e/specs/auto-update.mjs#R-02-002/AC-01`、`package.json::check`、`scripts/check.mjs#R-01-019/AC-04` |

## 终态与证据

状态: completed

- 实现: `src/core.mjs::buildRecent` 移除 24 小时与 20 条截断，保留既有过滤、未来时间防御、`activityAt` 精化排序并增加相同时间的稳定 session id tie-break；`src/client.mjs` 以 `recentVisibleCount` 首批/追加最多 10 条，使用历史尾部 sentinel、`IntersectionObserver` 与 scroll fallback，保留已展开页并仅为可见历史卡读取详情；`.dsh-plugin/client.js` 已同步重建。`scripts/bench.mjs`、`scripts/check.mjs` 已同步核心签名与回归断言。
- 测试: `pnpm verify:fast` 通过（AgentMap/test-impact lint、`scripts/check.mjs` 全部通过）；focused `pnpm test:e2e recent-infinite-scroll` 通过（`e2e: 全部 1 个 spec 通过（51718ms）`），覆盖首批/后续/末批、去重、active/history 互斥、回顶、IntersectionObserver 缺失 fallback、桌面与 375x700 移动抽屉独立滚动；最终 `pnpm verify` 通过（13 个 browser spec 全部通过，`e2e: 全部 13 个 spec 通过（191275ms）`）。`node scripts/bench.mjs` 通过；刷新 `http://127.0.0.1:3080/` 后 Playwright 确认 pane、`.dap-scroll`、`.dap-recent-tail` 已挂载，heading 为「最近历史」，HTTP 200。
- DESIGN 对照: `PRD.md` 将 R-01-010/AC-01 收敛为当前可见非活动主会话并新增 R-01-019/AC-01～AC-04；`DESIGN.md`、`DOMAIN.md`、`README.zh-CN.md` 与 `DECISIONS.md#C-068` 同步客户端分批呈现、详情按可见批次读取、滚动触底追加和非目标边界；T-104 验证矩阵记录 UNIT/E2E/MANUAL 证据。
- commit: 6cebde5
- commit: ff11efb
- review:
  - 审核方: Standards reviewer `4f9b5f78-6d5c-4a1c-ae7a-2b662ec35c09`；Spec reviewer `63d2596e-2f17-4ce0-a6f8-39d6b575987f`。
  - 目的理解: 在不改 DSH native `session.list` 契约的前提下，取消历史时间/条数上限，以最近活动时间稳定排序，客户端首批与触底分批呈现更早的非活动主会话；详情只按可见卡加载，并保持 active/history 互斥、独立滚动、导航与桌面/移动交互。
  - 执行方式: `code-review` skill，以 `5d055a6a6dda818e0d8e98dc99c835fcbcdbd2b7` 为固定基线，审核当前工作树差异（包含未跟踪 E2E/task），Standards/Spec 双轴独立审核并由同一 reviewer 复审修复项。
  - 问题与修复: Standards 初审指出验证矩阵声称 observer fallback 但缺少可执行证据，已补充缺失 `IntersectionObserver` 的 E2E；初审指出无用 `_windowMs` 保留，已移除并更新全部调用。Spec 初审指出列表 pending 会回退首批、`rootMargin` 提前追加、移动抽屉分页缺少验证，分别改为保留已展开页、`rootMargin: "0px"` 到底触发、补充 375x700 抽屉 E2E；另将 PRD AC-01 明确为首批未撑满视口可自动补齐，消除与设计的语义张力。
  - 复审结论: Standards 0 findings；Spec 0 findings，最终通过。
