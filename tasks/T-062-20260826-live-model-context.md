---
doc-type: task
mutation: lifecycle
id: T-062
---

# T-062 卡片模型上下文随模型切换实时更新

状态: active
关联: R-01-012/AC-16 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家反馈：会话卡片右上角的模型信息在会话过程中切换模型后不更新，一直显示会话创建（首次读取）时所用的模型。查证确认根因：宿主 `session.selectModel` 只改内存选择、不产生任何会话事件/投影/推送帧；卡片模型来自对每个可见会话仅一次的 `session.models` RPC（`detailLoadPlan` 要求 `!detail.model`，T-016「可见期内不热重试」），会话列表行不含模型字段，因此切换后无任何通道可感知。

宿主官方 shell 的 `dsh-client-ui-model-selection` 在 root ctx 注册 `modelDirectories` 服务：per-session `ModelDirectory` 持有可订阅 store，`select()` 成功即更新 `current`——主会话窗口 `/model` 弹窗与输入框模型座位同源。经东家拍板（方案 A）：订阅该 store 获取实时选择，初值与失败语义沿用既有一次性 RPC。PRD R-01-012 追加 AC-16、DESIGN 数据源约束与模型上下文条目演进、DOMAIN 不变量补充、DECISIONS C-024，均经东家当次确认。

## 差距评估

- `src/client.mjs::loadNativeDetails` 只在 `!detail.model` 时发一次 `api.models`，无任何后续更新通道。
- `src/core.mjs::modelMetadata` 输入为 `{current, groups}` 形状；`modelDirectories` store 快照 `{current, routable, groups, failures, status, error}` 同形兼容，可直接复用。
- 目录 store 的 `load()` 会推进 generation 计数，与进行中的 `select()` 竞争会致其更新被丢弃（C-024）——本任务只订阅不 `load()`。
- 订阅生命周期需对齐详情记账：会话离开可见集合（`pruneInvisibleEntries`）与插件卸载时先 `unsubscribe` 再除名，监听器不残留。

## 收敛方案

- `src/core.mjs`：新增纯函数 `pruneSubscriptions(subscriptions, visibleIds)`（不可见 id 先 unsubscribe 再除名，unsubscribe 异常吞掉不阻断其余清理）。
- `src/client.mjs`：
  - 新增 `modelDirectorySubs`（id → unsubscribe）记账；
  - `loadNativeDetails` 对每个非子代理可见会话幂等建立目录订阅（`ctx.get("modelDirectories")` 可选获取、`directoryFor` try/catch、subagent 沿用跳过）；订阅回调读 store 快照，`current` 存在时写入 `detail.models`/`detail.model = modelMetadata(...)` 并 `queueSync`；建立订阅时若 store 已有 `current` 立即同步一次（目录已被主窗口加载时免发 RPC）；
  - 现有一次性 RPC 路径不变，仍作初值与回落；
  - 可见性清理改经 `pruneSubscriptions` 处理 `modelDirectorySubs`；卸载路径 unsubscribe 全部。
- `scripts/check.mjs`：R-01-012/AC-16 锚点——`pruneSubscriptions` 行为族 + store 形状快照经 `modelMetadata` 归一断言 + bundle 契约（`modelDirectories` 订阅、unsubscribe 清理存在）。
- `scripts/acceptance.mjs`：新增 AC-16 人工验收条目（会话中切换模型，卡片模型随之更新）。

## 测试计划

- `scripts/check.mjs`：上述锚点，锚定 R-01-012/AC-16。
- `scripts/acceptance.mjs`：上述人工步骤。
- 门禁：`pnpm build:client && pnpm check`、`python3 tools/agentmap_lint.py --report`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：store 推送驱动卡片模型更新；store 已就绪时免 RPC 同步填充 | `scripts/check.mjs#R-01-012/AC-16`、`src/client.mjs::subscribeModelDirectory`、`scripts/acceptance.mjs#R-01-012/AC-16` |
| 异常 | 适用：服务缺失/directoryFor 抛错/订阅失败时回落一次性读取；unsubscribe 异常不阻断清理 | `scripts/check.mjs#R-01-012/AC-16`、`src/client.mjs::subscribeModelDirectory` |
| 边界配置 | 适用：子代理不建目录订阅（沿用既有跳过）；store `current` 为空时不覆写既有取值 | `scripts/check.mjs#R-01-012/AC-16`、`src/client.mjs::subscribeModelDirectory` |
| 副作用 | 适用：不调用目录 `load()`（不扰动 generation 状态机）；离开可见/卸载后订阅先 unsubscribe 再除名 | `scripts/check.mjs#R-01-012/AC-16`、`src/core.mjs::pruneSubscriptions` |
| 兼容性 | 适用：`modelDirectories` 为可选软依赖，宿主无此服务时行为与现状完全一致 | `scripts/check.mjs#R-01-012/AC-16`、`src/client.mjs::subscribeModelDirectory` |

## 终态与证据

（待填写）
