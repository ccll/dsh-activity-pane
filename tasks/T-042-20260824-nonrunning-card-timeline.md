---
doc-type: task
mutation: lifecycle
id: T-042
---

# T-042 非运行活动卡保留时间线，parent 卡显示不确定态进度条

状态: active
关联: R-01-016 → 活动状态模型
风险等级: standard

## 背景与目标

东家观察到：近期刚完成的会话（awaiting「需要响应」等待卡）与启动了子代理但自身不活动的会话（parent 活动层级上下文卡）仍显示在「活动会话」区，但卡片没有时间线，无法看出这些会话近期做了什么。东家裁定（PRD 闸口、DESIGN 闸口均已确认）：

- 全部等待卡（需要响应、待确认、待审查、待回复）保留最近工作项时间线（最多 4 项，语义同运行卡时间线）。
- parent 卡同样显示最近工作项时间线，另显示不确定态进度条（满宽轨道 + 条纹滚动动画、无百分比文本），表示仍有活动后代在工作。
- 数据链路零新增：渲染循环已对全部活动条目算出 `entry.timeline`；parent 卡仍不建立轮内订阅（R-02-004 纪律不变）。

## 差距评估

- `src/client.mjs::cardChildren`：`awaiting` 骨架仅 head + row(dot/title/badge) + note，无 `.dap-trace` 容器；`parent` 骨架仅 head + row(dot/title)，无 trace、无进度条。
- `src/client.mjs::renderCardInto`：`parent` 分支直接 return；`awaiting` 只写 note，均不渲染时间线。
- 时间线数据：`render()` 已对全部活动条目赋值 `entry.timeline`（快照 memo / history 冷读取），`entry.loadingTimeline` 亦已通用计算——无需改动。
- CSS：无 parent 进度条规则；`dap-stripes` 条纹动画已存在（运行卡流式阶段使用）。
- `src/core.mjs`：`cardSignature` 已含 `timeline` 分量与 `kind`；`buildEntries` 对 awaiting/parent 条目已携带 `timeline` 字段——零改动。
- `scripts/check.mjs` / `scripts/acceptance.mjs`：无 R-01-016 锚点，需新增。

## 收敛方案

- `src/client.mjs::cardChildren`：`awaiting` 骨架在 row 与 note 之间插入 `.dap-trace`；`parent` 骨架追加 `.dap-trace` 与 `.dap-track > .dap-fill`（无 pct、无 token-stats）。
- `src/client.mjs::renderCardInto`：`parent` 分支渲染时间线区后 return；`awaiting` 分支渲染时间线区后沿用既有 note 逻辑；均复用 `renderTimelineArea` 与 `nativePresentationSessionId`。
- `src/client.mjs` CSS：新增 `[data-kind="parent"] .dap-fill` 满宽 + `dap-stripes` 条纹滚动动画（不确定态进度条，纯 CSS 驱动、不新增状态字段）。
- `scripts/check.mjs`：新增 R-01-016/AC-01..04 锚点（core 单测 + bundle 契约断言）。
- `scripts/acceptance.mjs`：补充 R-01-016 人工验收点。
- PRD 新增 R-01-016；DOMAIN 登记「不确定态进度条」；DESIGN 同步 5 处（不变量、parent 条目改写、产品契约、双职责承接、追溯索引）——同一次变更内级联。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`：空白检查。
- GUI 现场验收（等待卡/parent 卡显示最近工作项时间线；parent 卡条纹滚动无百分比）由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：awaiting/parent 卡显示最近工作项时间线（≤4 项）；parent 卡显示条纹滚动的不确定态进度条 | `scripts/check.mjs#R-01-016/AC-01`、`scripts/check.mjs#R-01-016/AC-02`、`scripts/check.mjs#R-01-016/AC-03`、`scripts/acceptance.mjs#R-01-016/AC-01`、`scripts/acceptance.mjs#R-01-016/AC-02`、`src/client.mjs::cardChildren`、`src/client.mjs::renderCardInto`、GUI 现场验收 |
| 异常 | 适用：时间线数据在途时显示加载指示而非空白；无数据时时间线区为空（`:empty` 隐藏） | `scripts/check.mjs#R-01-016/AC-04`、`scripts/acceptance.mjs#R-01-016/AC-04`、`src/client.mjs::renderTimelineArea` |
| 边界配置 | 适用：当前会话的 awaiting/parent 卡沿用原生行呈现（`nativePresentationSessionId` 仅放行当前会话）；会话从 running 转为 awaiting/parent 时骨架经签名重绘切换 | `scripts/check.mjs#R-01-016/AC-01`、`src/client.mjs::cardChildren`、`src/client.mjs::renderCardIntoList` |
| 副作用 | 适用：parent 卡仍不建立轮内订阅（订阅数 == 运行中会话数）；运行卡、子代理卡、最近卡呈现不受影响；进度条无百分比文本 | `scripts/check.mjs#R-01-003/AC-05`、`scripts/check.mjs#R-02-004/AC-01`、`src/core.mjs::shouldSubscribeToSession` |

## 终态与证据
