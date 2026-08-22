---
doc-type: task
id: T-017
mutation: lifecycle
---

# T-017 渲染管线性能收敛批

风险等级: standard
状态: active

## 背景与目标

- 背景: 深度评估确认渲染管线在长会话 + 流式高频推送下按 O(会话数 × chat 全长) 每帧重算：同一快照在一次渲染中被 `conversationTimeline`/`messagePreviews` 全序扫描 3 遍以上；`buildTrace` 被 timeline 遮蔽仍每次 O(窗口节点) 计算（C-010 已定删除）；`nativeWorkItemRow` 每个工作项全量物化 DOM 查询数组。行为不变的性能收敛（短路形态，C-009）；无基线不动手，先建合成基线。
- 目标: 相同输入下渲染可见结果逐字节不变（签名不变），单次渲染归一化耗时相对基线显著下降；删除死计算。
- 非目标: 不改卡片视觉与交互；不改加载语义（归 T-015）；不引入新依赖。

## 差距评估

- 现状基线:
  - 订阅回调每次推送算一遍 `conversationTimeline`；`render()` 对有快照的条目再算一遍 + `messagePreviews` 内部第三遍（`Number.MAX_SAFE_INTEGER` 全序）。
  - `conversationTimeline` 从头遍历全部 `chat.order` 仅取尾部 4 项。
  - `buildTrace` 每次渲染对每个 running/subagent 条目全滤 `snapshot.nodes`，结果恒被 `timeline` 遮蔽。
  - `nativeWorkItemRow` 每项 `[...querySelectorAll(...)]` 物化全量行数组，每卡最多 4 项、每渲染执行。
  - `cardSignature` 含 `trace` 分量（死字段）。
- 目标差距:
  - 基线脚本 `scripts/bench.mjs`（合成快照：N 会话 × M 节点，统计归一化函数耗时），先量后改。
  - `conversationTimeline` 改尾部反向收集，取够上限即停；live 项合并语义不变。
  - 按快照引用 memo：订阅回调产出的 timeline/previews 以快照引用为键缓存，`render()` 命中即用；预览只为 recent/awaiting 卡计算。
  - 删除 `buildTrace`、`entry.trace` 与签名 `trace` 分量（C-010）；R-01-009/AC-07、AC-09 锚点测试改写为时间线语义（原 AC-07 断言 buildTrace，随删除同步替换）。
  - `nativeWorkItemRow`：每次渲染对会话区一次 `querySelectorAll` 建 key→row 索引，供当次全部工作项共用。

## 收敛方案

1. `scripts/bench.mjs` 新建：构造合成 ChatSnapshot/list 快照，对 `buildEntries`/`buildRecent`/`conversationTimeline`/`messagePreviews`/`cardSignature` 计时，输出 before/after 对比（纯 Node，不作 AC 锚点，作 task 证据）。
2. `src/core.mjs`:
   - `conversationTimeline` 反向遍历 `order`，从尾部收集有效项至上限，再并入 live 项；保持既有 id/合并/截断语义。
   - `messagePreviews` 接受预算上限或基于反向扫描；不再全序物化。
   - 删除 `buildTrace`、`TRACE_MAX_ITEMS`（若无其它引用）；`cardSignature` 移除 `trace` 分量。
3. `src/client.mjs`:
   - `sessionDetailsById` 详情项记录 `timelineOf/previewsOf` 的来源快照引用，render 命中跳过重算；仅 recent/awaiting 条目计算 previews。
   - 渲染层移除 `entry.trace` 赋值与 `renderTrace` 的 trace 回退（timeline 为唯一来源）。
   - `nativeWorkItemRow` 索引化（每次渲染一次扫描 + Map 查询）。
4. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 既有全部锚点必须保持绿色（行为不变的第一证据）。
- R-01-009/AC-07、AC-09 锚点改写：断言工作项时间线条目的状态/耗时/白名单摘要与竖线圆点呈现契约（替换原 buildTrace 断言）。
- R-01-012/AC-02、AC-03：`conversationTimeline` 反向取尾语义（顺序、上限、当前执行项并入）增补边界断言。
- 基线对比：`node scripts/bench.mjs` before/after 数据写入终态证据。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：全部既有锚点不变即行为不变 | `scripts/check.mjs#R-01-009/AC-07`、`src/core.mjs::conversationTimeline` |
| 异常 | 适用：空 order/缺节点/坏节点输入下语义一致 | `scripts/check.mjs#R-01-012/AC-02`、`src/core.mjs::conversationTimeline` |
| 边界配置 | 适用：order 不足 4 项、live 项并入、limit=0 | `scripts/check.mjs#R-01-012/AC-02`、`src/core.mjs::conversationTimeline` |
| 副作用 | 适用：签名分量变化只在 trace 删除一处，卡片 DOM 输出不变 | `scripts/check.mjs#R-02-003/AC-01`、`src/core.mjs::cardSignature` |
| 性能 | 适用：本任务即性能收敛；基线对比 before ~36–38.5ms/遍 → after ~0.09–0.66ms/遍 | `scripts/bench.mjs::renderPass`、`scripts/check.mjs#R-02-003/AC-01`、`src/core.mjs::cardSignature` |

## 终态与证据

（待关闭时填写：实现 / 测试 / DESIGN 对照 / commit / review）
