---
doc-type: task
mutation: lifecycle
id: T-006
---

# T-006 会话卡上下文、工作项时间线与历史预览

状态: completed
关联: R-01-009 / 活动状态模型、窗格渲染器；R-01-012 / 活动状态模型；R-01-013 / 活动状态模型、窗格渲染器；R-02-004 / 窗格渲染器
风险等级: standard

## 背景与目标

东家要求活动卡与 DSH 主会话窗口在可见内容上对齐：活动卡右上角复用模型名称/reasoning level，时间线使用主窗口实际顺序的最近 4 个工作项并实时包含当前项，token 统计移到进度条下方且移除独立当前动作文案；最近历史卡按五行层次展示 workspace/model、标题、最近用户首行、最近 agent 首行与活动时间，并沿用既有 hover 反馈。

## 差距评估

- 当前 `buildEntries` / `buildRecent` 没有模型上下文、工作项时间线、用户首行或 agent 首行字段。
- 当前运行卡仍渲染 `.dap-status`，其中包含「思考中」等独立当前动作文案；token 统计也未独立放在进度条下方。
- 当前 `sessions.binding(id).session` 只归一轮内 liveness，未把 ChatSnapshot 的 display order 作为活动卡时间线数据。
- 当前历史卡只有标题与时间；冷会话需要用 native session projection/history/model 读取补齐，缺失值必须优雅降级。
- 现有 `src/navigation.mjs`、生成 bundle、测试与 `TODO.md` 有并发未提交改动，实施时只做局部合并，不回滚无关内容。

## 收敛方案

- 在 `src/core.mjs` 增加 `firstPhysicalLine`、工作项/消息预览提取、模型 metadata 归一与 `runtimeStats`；`buildEntries` / `buildRecent` 保持现有过滤排序并附加新字段。
- 优先从 `ConversationSnapshot.chat.order` / `chat.nodes` 提取工作项；运行中快照由原生 `session.subscribe` 推送驱动；冷会话以 native `sessions.history` 的一次性读取降级补齐，禁止第三方状态路由与状态轮询。
- 运行卡骨架改为 workspace + model 元信息、标题、最近 4 个工作项、进度条、token/rate 底行；历史卡改为五行预览并保留卡片样例 hover。
- 保持现有 DOM textContent 安全写入、卡片签名去重、订阅生命周期、桌面/移动布局与导航回归改动。

## 测试计划

- `scripts/check.mjs`：以 `R-01-009/AC-02`、`R-01-009/AC-05`、`R-01-012/AC-01..04`、`R-01-013/AC-01..06` 锚定纯函数、bundle 结构、文本顺序与实时订阅契约。
- `pnpm build:client && pnpm check`：生成 bundle 并运行现有 Node assertion suite。
- `python3 tools/agentmap_lint.py --report`：校验 PRD/DESIGN/DOMAIN/T-006/测试追溯。
- `scripts/acceptance.mjs`：补充 GUI 手工检查；如无自动浏览器驱动，诚实记录 GUI 未自动化执行。
- 独立 `code-review` skill：固定实现基线，分别审核 Standards 与 Spec，修复后复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：活动卡显示 model/reasoning、最近 4 项、token 底行；历史卡五行可读 | `scripts/check.mjs#R-01-012/AC-01`、`scripts/check.mjs#R-01-013/AC-01`、`src/core.mjs::conversationTimeline`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：缺少 chat/model/projection/history 时不抛错且字段为空 | `scripts/check.mjs#R-01-012/AC-01`、`src/core.mjs::modelMetadata`、`src/client.mjs::loadNativeDetails` |
| 边界配置 | 适用：工作项少于 4、空白物理行、超长预览、历史排序与 24h 窗口 | `scripts/check.mjs#R-01-012/AC-02`、`scripts/check.mjs#R-01-013/AC-03`、`src/core.mjs::firstPhysicalLine`、`src/core.mjs::buildRecent` |
| 副作用 | 适用：原生订阅更新当前项、无独立动作文案、token 位置与现有导航/卸载不回归 | `scripts/check.mjs#R-01-009/AC-02`、`scripts/check.mjs#R-02-004/AC-01`、`src/client.mjs::syncLiveness` |
| 安全 | 适用：消息、详情、模型名均通过 `textContent` 写入，工具参数仍白名单摘要 | `scripts/check.mjs#R-01-009/AC-04`、`src/client.mjs::renderCardInto` |
| 兼容性 | 适用：没有可选 history/model/projection 数据时仍显示基础卡片 | `scripts/check.mjs#R-02-001/AC-01`、`src/core.mjs::buildEntries` |

## 终态与证据

- 实现: `src/core.mjs` 增加物理首行、模型 metadata、ChatSnapshot/history 工作项时间线、消息预览与运行统计；`src/client.mjs` 使用 native `session.subscribe` 实时更新、native `sessions.models/history` 冷会话读取，运行卡移除独立动作行并将 token 统计置于进度条后，历史卡完成五行骨架；`scripts/check.mjs` 与 `scripts/acceptance.mjs` 同步 AC 证据；`.dsh-plugin/client.js` 已生成。
- 测试: `pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过（17 requirements、51 AC、51 test anchors）；`git diff --check` 通过；`curl -fsS -I http://127.0.0.1:3080/` 返回 HTTP 200。GUI 视觉/交互未自动化执行，因当前环境没有可用 Playwright/Puppeteer，保留 `scripts/acceptance.mjs` 人工清单。
- DESIGN 对照: PRD/DESIGN/DOMAIN 已同步 R-01-012/R-01-013；C-008 记录 native snapshot/history/model 选型；不引入第三方状态路由、状态轮询或新依赖；保留既有导航工作流改动。
- commit: 9a99bb3
- review:
  - 审核方: Standards 子代理 `3bb1a60b-b8c1-4655-b66e-a84be4d191e9`；Spec 子代理 `58a525ed-9ec4-41d5-8aa5-46afe9fcfb0b`。
  - 目的理解: 审核活动/历史卡是否复用主会话 model/reasoning 与 ChatSnapshot 实际顺序，是否包含当前实时工作项、物理首行预览、token 底行、缺失值降级和无独立动作文案，并检查原生订阅、AgentMap 与项目规范。
  - 执行方式: `code-review` skill；固定基线 `045f1953e2409e8b1f1b20ce44a6dec155da151c`，范围为 `git diff HEAD --` 对应工作树；Standards/Spec 双轴并行，修复后复审。
  - 问题与修复: 首轮发现常驻 `events.mux`、空 catch、live 项挤占 order 尾部、history 窗口偏小、token/order/物理首行证据不足；已移除 mux，改用 native `session.subscribe`，增加显式读取失败降级、提升 history 到 50、增加 live 槽位边界/DOM 顺序/物理首行/缺失值断言。既有导航单例 `globalThis[INSTANCE_KEY]` 属于并发导航工作流，按约束保留。两轴均仅剩非阻断的 Fowler `Duplicated Code`/`Data Clumps` 判断意见，无 Spec 阻断 finding。
  - 复审结论: Standards 通过（无 hard finding）；Spec 通过修复后仅剩非阻断判断意见，活动/历史卡需求与当前 map/测试门禁一致。
