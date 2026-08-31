---
doc-type: task
mutation: lifecycle
id: T-104
---

# T-104 历史会话无限滚动分页

状态: active
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
| 成功 | 适用：首批 10 条、触底追加 10 条并可继续浏览所有候选 | `package.json::check`、`scripts/check.mjs#R-01-019/AC-01` |
| 异常 | 适用：详情读取失败仍降级并在卡片重新可见时重试；观察者缺失不阻断窗格 | `package.json::check`、`scripts/check.mjs#R-01-014/AC-05`、`scripts/check.mjs#R-01-019/AC-02` |
| 边界配置 | 适用：0 条、少于 10 条、恰好 10/11 条、相同 activityAt、首批未撑满视口 | `package.json::check`、`scripts/check.mjs#R-01-019/AC-01`、`scripts/check.mjs#R-01-019/AC-03` |
| 副作用 | 适用：active/recent 不重复，追加不改变主会话滚动，回顶与移动抽屉保持可用 | `package.json::check`、`scripts/check.mjs#R-01-019/AC-04` |
| 性能 | 适用：未展示历史卡不发 models/history 读取；现有并发池上限保持 3 | `package.json::check`、`scripts/check.mjs#R-01-014/AC-02` |
| 恢复 | 适用：列表刷新/窗格重挂载后分页状态与卡片缓存收敛，不残留 observer/listener | `package.json::check`、`scripts/check.mjs#R-01-019/AC-04` |

## 终态与证据

待实现。
