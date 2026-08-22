---
doc-type: task
id: T-016
mutation: lifecycle
---

# T-016 数据拉取与交互缺陷修复批

风险等级: standard
状态: completed

## 背景与目标

- 背景: 深度评估（2026-08-22）确认数据拉取与交互层存在一组可复现/机制明确的缺陷；均属 map 不变的缺陷修复（短路形态，C-009）。
- 目标: 修复下列 8 项缺陷并附回归测试：
  1. 打开重试链无全局取消——点卡 A 进入重试后点卡 B 成功，A 的链条仍会在数十秒后把当前会话拽回 A。
  2. jeC——`render()` 清理 `sessionDetailsById` 时不同步删 `modelLoads`/`historyLoads` 记账，会话重回可见集合后模型/历史永不重拉。
  3. 失败即永久——`api.models`/`api.history` 失败后记账终身存在，瞬时失败 = 终身空白，无重试路径。
  4. `syncLiveness` 中 `session.subscribe` 未包 try/catch（p1d），抛错会从 rAF 回调中断渲染并刷错。
  5. `cardElFor` 的 CSS 转义顺序错误（先引号后反斜杠），含引号 id 拼出非法选择器使 `querySelector` 抛错。
  6. `pane.toggleAttribute("data-collapsed", collapsed ? "true" : "false")` force 传字符串（恒 truthy），靠巧合工作。
  7. 契约死代码——`api.history` 响应没有 `partial`/`runningCalls` 字段（宿主契约为 `{events, hasMore, projections?}`），读取恒为 undefined；`projectionValues.timelineUserMessages` 是 C-007/C-008 否决项残留；子代理 `api.models` 必被 `agent-busy` 拒绝仍逐个子代理发 RPC。
  8. 计数徽标 `textContent` 每次渲染无条件重写，`aria-live="polite"` 下值未变也触发文本节点替换。
- 非目标: 不改任何 PRD/DESIGN 承诺；不改卡片视觉；不动性能结构（归 T-017）。

## 差距评估

- 现状基线:
  - `attemptOpen`/`scheduleOpenRetry` 按 sessionId 独立维护 `openRetryStates`，无跨链取消、无 current 比对（src/client.mjs 打开会话段）。
  - `sessionDetailsById` 清理循环只删详情不删 loads 记账；失败路径写入空值且记账终身保留。
  - `session.subscribe(...)`、`sessions.list.subscribe(...)` 裸调。
  - `cardElFor` 先 `replace(/"/g,'\\"')` 再 `replace(/\\/g,"\\\\")`，顺序颠倒。
  - `loadNativeDetails` 读 `value.partial`/`value.runningCalls`；`messagePreviews` 读 `projectionValues?.timelineUserMessages`；子代理 id 同样进入 `api.models`。
  - 计数写入无变化比对。
- 目标差距: 逐条对应上述 8 项修复；重试链改为「新激活/成功打开/目标已成为 current」三处取消；失败记账在会话离开可见集合时随详情同步清除（可见期内不热循环重试，重进可见时允许重试）。

## 收敛方案

1. 重试链取消（缺陷 1）: `attemptOpen` 成功时取消全部其它链条；`bindCardActivation` 回调激活新卡片时取消其它链条；`render()` 中发现 `snapshot.current` 已等于某链条目标时取消该链。重试取消判定抽为 `src/core.mjs` 纯函数（如 `shouldCancelOpenRetry({targetId, currentId, lastActivatedId})`）便于锚定测试。
2. 记账同生命周期（缺陷 2、3）: 可见性清理段同步删除 `modelLoads`/`historyLoads`/`sessionOpenLoads` 中不可见 id；失败路径保持记账（避免每渲染热重试），随可见性清理一并放行。
3. 健壮性（缺陷 4）: `session.subscribe` 与列表 `subscribe` 调用包 try/catch，失败按「本次跳过、下次渲染重试」处理。
4. 转义（缺陷 5）: `cardElFor` 改用 `CSS.escape`（带 `String` 归一与降级实现）。
5. 布尔 force（缺陷 6）: `toggleAttribute(name, collapsed)` 传布尔。
6. 契约清理（缺陷 7）: 删除 `value.partial`/`value.runningCalls` 读取；删除 `messagePreviews` 的 `timelineUserMessages` 分支（含 `projectionValues` 入参）；`loadNativeDetails` 对 `isSubagentRow` 为真的 id 跳过 `api.models`。
7. 计数写入（缺陷 8）: 写入前比对 `textContent`，相同不赋值。

## 测试计划

- `scripts/check.mjs` 增补锚定：
  - R-01-005/AC-02: 重试链取消判定（目标已成为 current / 新激活取代 / 成功打开时他链取消）纯函数断言。
  - R-01-012/AC-01: 子代理不发起 models 读取、models 失败后重回可见集合可重试（以注入假 api 的方式驱动 `loadNativeDetails` 等价逻辑）。
  - R-01-009/AC-04: history 读取不再依赖 `partial`/`runningCalls` 字段（事件流输入下时间线正确）。
  - R-02-003/AC-02: 卸载与可见性清理同步清空 loads 记账（随卸载清理断言）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：修复后正常打开/加载路径不回归 | `scripts/check.mjs#R-01-005/AC-01`、`src/client.mjs::attemptOpen` |
| 异常 | 适用：subscribe 抛错、api 失败、非法选择器 id 不再中断渲染或抛错 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::syncLiveness` |
| 边界配置 | 适用：子代理不发 models RPC、含引号 id 经 CSS.escape 安全 | `scripts/check.mjs#R-01-012/AC-01`、`src/client.mjs::loadNativeDetails` |
| 副作用 | 适用：重试取消不得误取消本链；记账清理不得影响可见会话 | `scripts/acceptance.mjs#R-01-005/AC-02`、`src/client.mjs::cancelOpenRetry` |

## 终态与证据

- 实现: `src/core.mjs` 新增 `escapeCssString`（先反斜杠后引号、换行/回车/换页码位转义、NUL 替换）、`shouldCancelOpenRetry`、`pruneInvisibleEntries`、`detailLoadPlan` 四个纯函数；`messagePreviews` 移除 `projectionValues`/`timelineUserMessages` 分支（C-007/C-008 残留清理）；`conversationTimelineFromHistory` 简化为 `(history, limit)`（不再读取 history 响应中不存在的 `partial`/`runningCalls` 字段）。`src/client.mjs`：重试链经 `cancelStaleOpenRetries` 在新激活/打开成功/render 中 current 比对三处取消；可见性清理经 `pruneInvisibleEntries` 同步删除 `sessionDetailsById`/`modelLoads`/`historyLoads`/`sessionOpenLoads`（jeC）；`loadNativeDetails` 改用 `detailLoadPlan`（子代理跳过 models、失败置空不热重试、清理后重回可重试）；`session.subscribe` 与列表 `subscribe` 包 try/catch；`cardElFor` 统一经 `escapeCssString`；`toggleAttribute` 传布尔；计数写入前比对文本。
- 测试: `pnpm build:client && pnpm check` 通过（新增 R-01-005/AC-02 取消判定与转义锚定、R-01-012/AC-01 子代理边界与 `detailLoadPlan` 行为链锚定、R-02-003/AC-02 `pruneInvisibleEntries` 行为锚定，及 6 条 bundle 契约断言）；`python3 tools/agentmap_lint.py --report` 通过（17 需求 / 56 AC，测试锚定 56/56）；`git diff --check` 通过。
- DESIGN 对照: DESIGN 失败语义已补充「重试链在目标已成为当前会话、用户激活其它卡片或任一打开成功时立即取消」条款；契约清理后实现与 DESIGN「冷会话 history 一次性读取」「不写回宿主」「无自有轮询」一致；R-01-005/AC-02「不影响其它卡片」由取消机制兑现。
- commit: 4a5abf8
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: T-016 为 map 不变的缺陷修复批（8 项：重试链拽回会话、jeC 记账不清理、失败无重试、subscribe 裸调、转义顺序、toggleAttribute 字符串 force、history/timelineUserMessages/子代理 models 契约死代码、计数文本重写）；关联约束 PRD R-01-005/AC-02、R-01-012/AC-01、R-02-003 与 DECISIONS C-002/C-005/C-007/C-008；验证方式为 check.mjs 纯函数锚定 + bundle 契约断言。
  - 执行方式: `code-review` skill；评审基线 `c1cde8b`，范围 `git diff c1cde8b...HEAD`（ec4fee2 实现、fba73d4/4a5abf8 修复），Standards/Spec 两轴独立审核，修复后由同一审核方两轮复审。
  - 问题与修复: Standards 轴 0 硬违例、3 项判断题 smell——重复的重试链取消遍历经 `cancelStaleOpenRetries` 收敛（fba73d4），Feature Envy 与 Primitive Obsession 两项弱 smell 经复审裁定按 KISS/聚焦修改不修；Spec 轴 3 项 finding——escapeCssString 控制字符边界（补 \\n/\\r/\\f 码位转义与 NUL 替换及断言）、loads 记账缺行为链验证（抽 `detailLoadPlan` 纯函数并补行为链断言）、isSubagentRow 父级缺失边界（补断言）均经 fba73d4/4a5abf8 修复。
  - 复审结论: Standards 复审三项全部关闭；Spec 两轮复审后 (a)(b)(c) 全部关闭，确认抽取未改变判定语义、无新增偏差。
