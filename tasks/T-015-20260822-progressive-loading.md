---
doc-type: task
id: T-015
mutation: lifecycle
---

# T-015 加载过程可见与渐进呈现（R-01-014）

风险等级: standard
状态: completed

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

- 实现: map 原子演进——PRD 新增 R-01-014（AC-01~05）、DESIGN 新增加载状态模型与追溯索引、DOMAIN 新增「加载指示」术语。`src/core.mjs`：`listLoadState`（loading/error/ready 三态，error 层级经审核补齐）；`cardSignature` 并入 loadingModel/loadingTimeline/loadingPreviews。`src/client.mjs`：活动区/历史区在列表在途时显示活动图标而非空态、error 时显示「列表加载失败」；区域有条目时在途显示区头部行内 spinner；模型区/时间线区/预览行字段级加载指示（`renderTimelineArea`/`renderTraceLoading`，签名驱动就地填充不重建卡片）；补充数据逐个 promise 完成即重绘 + 注册即重绘；冷读取并发池（`LOAD_CONCURRENCY=3`，当前会话最优先）；model/history 记账 settle 即删（身份守卫）；卸载清空队列。
- 测试: `pnpm build:client && pnpm check` 通过（R-01-014/AC-01..05 锚定：listLoadState 三态、detailLoadPlan 失败重试链、10 条 bundle 契约断言）；`scripts/acceptance.mjs` 新增慢网渐进呈现（节流）与失败重试人工步骤、T-007/AC-02 旧步骤改渐进语义（本环境无浏览器 E2E 基建，人工步骤未执行）；`python3 tools/agentmap_lint.py --report` 通过（18 需求 / 61 AC，测试锚定 61/61）；`git diff --check` 通过。
- DESIGN 对照: PRD→DESIGN 双向追溯完整（R-01-014 索引行主责窗格渲染器、子系统反向承接）；DESIGN 加载状态模型与实现逐条一致（列表级/字段级/渐进/并发池/失败语义/签名并入）；AC-01~05 均有测试锚点。
- commit: 012af8c
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: T-015 为新需求 R-01-014「加载过程可见与渐进呈现」全链实现：列表在途显示加载指示而非空态、字段级指示、逐个就绪逐个显示、加载期间交互可用、失败降级可重试；关联约束 R-02-003/R-02-004 与宿主 phase 契约；验证方式为三层测试策略。
  - 执行方式: `code-review` skill；评审基线 `6f6762c`，范围 `git diff 6f6762c...HEAD`（24f1d60 实现、012af8c 修复），Standards/Spec 两轴独立审核，修复后由同一审核方复审。
  - 问题与修复: Standards 轴 2 项硬违例（bundle 断言粒度——复审按仓库三层测试约定与 T-014 先例裁定不成立；DESIGN 职责超长单行——拆嵌套列表）+ 2 项判断题（渲染分支重复——收敛 `renderTimelineArea`；ensureEmpty 命名——更名 `ensureListStatus`）；Spec 轴 3 项 finding（loads 记账 settle 未删致永久误报——settle 即删+身份守卫；区域有条目时缺头部指示——区头部行内 spinner；缺 error 层级——三态补齐+失败文案），均经 012af8c 修复。
  - 复审结论: Standards 复审全部关闭；Spec 复审三项 finding 全部关闭，确认无热循环、无新偏差。
