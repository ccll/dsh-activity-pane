---
doc-type: task
id: T-015
mutation: lifecycle
---

# T-015 加载过程可见与渐进呈现（R-01-014）

风险等级: standard
状态: active

## 背景与目标

- 背景: 刷新页面后窗格框架先出现但长期无数据填充，慢网下尤甚。根因：宿主 `sessions.list` 快照自带 `phase: 'pending' | 'ready'` 生命周期，插件未读取——列表在途时活动区直接显示空态「暂无活动会话」（空态冒充加载态）；卡片补充数据（model/history）与运行会话开窗在途时对应位置空白且无指示；冷数据读取无并发控制，刷新后 20 张历史卡的 history/models 与运行会话 open() 互相挤占，全部一起慢、一起出现。PRD 演进（R-01-014，5 条 AC）已经东家确认（闸口通过）；DESIGN 演进草案待东家确认后与实现同提交落地（原子级联：PRD/DESIGN/代码/测试同次变更）。
- 目标: 实现 R-01-014「加载过程可见与渐进呈现」：列表在途显示加载指示而非空态；卡片字段级加载指示、就绪就地填充；分区/分卡渐进出现互不等待；加载期间全部既有交互可用；失败降级为空字段并允许重回可见时重试。
- 非目标: 不改变数据获取通道（仍为订阅 + 一次性 native 读取，无轮询）；不改变卡片视觉语言（加载指示除外）；不做会话级操作。

## 差距评估

- 现状基线:
  - `render()` 不读列表 `phase`/`state`：`buildEntries` 对空快照产出空数组 → `ensureEmpty` 立即显示「暂无活动会话」；历史区 `recentSection.hidden = recent.length === 0` 同理。
  - `loadNativeDetails` 在途无任何 UI 表达；数据到达后 `queueSync` 就地填充（机制已是异步，缺的是加载态表达与渐进编排）。
  - 冷读取全量并发：可见会话的 models/history 一次性全部发出，慢网下挤占列表/mux 通道。
  - 运行会话 `session.open()` 尾页拉取在途时运行卡时间线为空。
- 目标差距:
  - 加载状态三级模型：列表级（`phase==='pending'` 或首次 `state==='loading'` → 活动区/历史区各显示加载指示，禁止空态；`state==='error'` → 加载失败文案）；卡片级（model/history 在途 → 模型区与时间线/预览区行内加载指示）；运行卡级（`session.open()` 在途 → 时间线区加载指示）。
  - 冷读取并发池（上限 3，活动区优先于历史区、区内按显示顺序、当前会话最优先），在途记账与详情同生命周期（T-016 缺陷 2/3 先行）。
  - 加载状态并入 `cardSignature`（指示翻转经签名驱动重绘，不重建卡片）。

## 收敛方案

1. map 原子演进：PRD 增加 R-01-014（草案已确认）；DESIGN 增加「加载状态模型」设计落点与需求追溯索引行（主责：窗格渲染器）；DOMAIN 增加「加载指示」术语。
2. `src/core.mjs`：
   - 列表加载态归一纯函数 `listLoadState(snapshot)` → `'loading' | 'ready' | 'error'`（读 `phase`/`state`，无快照视为 loading）。
   - 条目级 `loadingFlags` 派生（哪些字段在途）并入签名。
3. `src/client.mjs`：
   - 活动区/历史区各加加载指示节点（复用 `dap-empty` 容器 + 活动图标），`phase` 未 ready 时代替空态；error 时显示失败文案。
   - 卡片骨架增加行内加载指示元素（模型区/时间线区/预览区），按在途状态显隐。
   - 冷读取并发池 + 优先级排序；在途/失败记账与详情同生命周期。
4. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 锚定 R-01-014/AC-01～AC-05：列表 pending → 加载指示且不显示空态；ready 后空态才出现；卡片字段在途指示与就地填充；失败降级 + 重回可见重试；并发池上限与优先级。
- `scripts/acceptance.mjs` 增补人工步骤：慢网（节流下）刷新后各区显示加载指示、卡片逐个出现、加载期间滚动/折叠/抽屉/点击可用。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：列表就绪后正常双区渲染不回归 | `scripts/check.mjs#R-01-001/AC-01`、`src/client.mjs::render` |
| 异常 | 适用：列表 error/补充数据失败降级为空字段且可重试 | `scripts/check.mjs#R-01-010/AC-01`、`src/client.mjs::loadNativeDetails` |
| 边界配置 | 适用：pending 期禁止空态、并发池上限与优先级 | `scripts/check.mjs#R-01-001/AC-02`、`src/client.mjs::ensureListStatus` |
| 副作用 | 适用：加载指示不重建卡片、不破坏既有交互与签名去重 | `scripts/check.mjs#R-02-003/AC-01`、`src/client.mjs::renderCardIntoList` |

## 终态与证据

（待关闭时填写：实现 / 测试 / DESIGN 对照 / commit / review）
