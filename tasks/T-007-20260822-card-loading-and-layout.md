---
doc-type: task
mutation: lifecycle
id: T-007
---

# T-007 修复卡片加载、badge 布局与非当前会话时间线

状态: completed
关联: R-01-012 / 活动状态模型、窗格渲染器；R-01-013 / 活动状态模型、窗格渲染器；R-02-003 / 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈三类回归：workspace badge 横向拉伸到模型名称；模型 metadata 在全部卡片上先消失再逐卡出现；刷新后只有切换为当前会话的卡片才出现工作项时间线。需要确认 DSH 会话窗口是否 lazy load，并用 native history/model 读取与批量刷新让非当前活动卡稳定显示。

## 差距评估

- `.dap-card-head .dap-workspace` 当前使用 `flex: 1`，使 badge 占满剩余行宽。
- `loadNativeDetails` 为每个 session promise 单独 `queueSync`，模型返回顺序直接暴露为逐卡闪现。
- 运行中 session 的 snapshot 可能存在但仍处于 cold/lazy 状态；当前逻辑只判断 snapshot 是否存在，导致不再调用 native `sessions.history`。
- 当前 T-006 的纯函数/Bundle 测试没有覆盖批量模型刷新和 cold snapshot history fallback 的运行时协调行为。

## 收敛方案

- 让 workspace badge 保持内容宽度，仅允许内容自身在极窄卡片中收缩；模型保持右对齐。
- 对同一轮可见 session 的 model/history 请求批量等待后只触发一次重绘；保留原生 API 失败的显式空字段降级。
- 对 cold/空 chat snapshot 调用 native `sessions.history`，用 tail events 构建时间线与物理首行；已有 open snapshot 优先使用 `chat.order`/`chat.nodes`，运行中仍由 `session.subscribe` 推送更新。
- 不新增全局 mux、第三方路由、状态轮询或宿主状态；继续使用 textContent 和现有 card signature。

## 测试计划

- `scripts/check.mjs`：增加 badge flex contract、批量请求单次 queueSync、cold snapshot history fallback 与多卡模型字段归一断言。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`。
- `scripts/acceptance.mjs`：增加刷新后非当前会话时间线、badge 宽度、模型批量出现与冷加载观察项。
- 重新执行独立 `code-review` skill，固定 T-007 实现前基线并修复所有 hard findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：活动卡 badge 自适应、模型同批次出现、刷新后非当前卡显示时间线 | `scripts/check.mjs#R-01-012/AC-01`、`src/client.mjs::loadNativeDetails`、`src/client.mjs::cardChildren` |
| 异常 | 适用：history/models 失败或 snapshot cold 时字段为空或从 history 补齐，不抛错 | `scripts/check.mjs#R-01-012/AC-01`、`src/client.mjs::loadNativeDetails` |
| 边界配置 | 适用：空 chat、少于 4 项、窄卡片、多个并发 session | `scripts/check.mjs#R-01-012/AC-02`、`src/core.mjs::conversationTimelineFromHistory` |
| 副作用 | 适用：批量刷新不改变 session 顺序，不新增状态轮询或全局 mux | `scripts/check.mjs#R-02-004/AC-02`、`src/client.mjs::render` |
| 兼容性 | 适用：open snapshot 继续优先于 history，历史卡时间/缺失值不回归 | `scripts/check.mjs#R-01-013/AC-03`、`src/client.mjs::renderCardInto` |

## 终态与证据

- 实现: `src/client.mjs` 取消 workspace badge 的 flex 拉伸、合并可见 session 的 model/history 请求后单次重绘，并在读取 liveness snapshot 后对 cold/空 chat 调用 native history；`src/core.mjs` 提供 `needsHistorySnapshot`；空 snapshot 不再覆盖已从 history 得到的 timeline/preview；`.dsh-plugin/client.js` 已生成。
- 测试: `pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过；`git diff --check` 通过；`scripts/check.mjs` 增加空/open snapshot、批量重绘契约、badge 布局与 history fallback 断言；`curl -fsS -I http://127.0.0.1:3080/` 返回 HTTP 200。GUI 视觉/交互仍需按 `scripts/acceptance.mjs` 人工检查，当前环境没有可用 Playwright/Puppeteer。
- DESIGN 对照: 按既有 R-01-012/R-01-013 设计执行：cold session 使用 native `sessions.history`，运行中 session 保持 `session.subscribe`，不调用 `sessions.open`、不增加 mux/轮询/第三方路由；模型/history 缺失保持空字段。
- commit: 69ef831
- review:
  - 审核方: Standards 子代理 `0ed85df2-8145-48df-a4dc-882953ff4ea6`；Spec 子代理 `7c721f06-855a-4fcf-a56c-7bc406f56ed3`。
  - 目的理解: 验证 workspace badge 自适应、模型/history 批量加载、刷新后非当前 cold session 的时间线补齐，以及不破坏运行中原生订阅。
  - 执行方式: `code-review` skill；固定基线 `d665b08`，范围为 `git diff d665b08...HEAD` 对应 T-007 工作单元；Standards/Spec 双轴复审。
  - 问题与修复: Spec 初审指出 badge flex 风险与 snapshot 判定使用旧 detail；确认基础 workspace 样式已有 overflow/ellipsis/nowrap，并保留 head override 的 `flex: 0 1 auto`；随后将 `needsHistorySnapshot` 提升到 core、读取 `livenessById` 最新 snapshot 并补充空/open snapshot 测试。运行时协调测试受 GUI harness 不可用限制，保留 bundle 契约与人工 acceptance 证据，不虚报 E2E。
  - 复审结论: 无新的功能性 finding；仅提示批量 Promise/订阅时序缺少真实 DOM harness 证明，作为非阻断验证限制记录。
