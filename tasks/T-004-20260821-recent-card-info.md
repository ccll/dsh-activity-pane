---
doc-type: task
mutation: lifecycle
id: T-004
---

# T-004 最近卡片信息增强（工作区徽标 + 最后活动概览）

状态: completed
关联: R-01-010 → 活动状态模型；R-01-010 → 窗格渲染器；R-01-003/AC-03 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家反馈 activity-pane 历史会话（最近历史区）卡片信息不够全面：需要补上工作区名称与「最后做的事情」。现状 `buildRecent` 已计算 `workspaceTitle`，但最近卡骨架（`cardChildren("recent")`）未渲染工作区徽标元素；「最后做的事情」无数据源。决策见 C-006。

## 差距评估

- 最近卡骨架 `[row, note]`：无 `.dap-workspace` 徽标（awaiting/running 有、recent 没有）→ R-01-003/AC-03 对最近主会话卡片的承诺未兑现。
- 最近卡 note 仅 `fmtRecentTime(updatedAt)`，无消息级内容。
- 非活动会话 `binding().session` 为 cold（窗口未开，nodes 空），无法不经打开就读最近消息 → 需走列表快照投影。
- `projectionValues.timelineUserMessages`（第三方时间轴插件注册，本环境已装）：最后一条含 `text`（用户消息）与 `reply`（回复预览），存量数据可用。
- `cardSignature` 未纳入 `lastActivity` → 预览变化不会触发重绘。
- 已授权差距：工作区徽标 + 最后活动概览（R-01-003/AC-03、R-01-010/AC-05、AC-06，见 PRD 与 DESIGN）。

## 收敛方案

- `活动状态模型`（src/core.mjs，纯函数）：
  - 新增 `lastActivityPreview(projectionValues)`：取 `timelineUserMessages` 最后一条的 `text`（用户消息文本），缺失回退 `reply`（回复预览），经 `cleanPreview` 截断；投影不可得/为空/不可解析返回 null。
  - `buildRecent` 条目新增 `lastActivity: lastActivityPreview(row.projectionValues)`（`workspaceTitle` 已有）。
  - `cardSignature` 纳入 `entry.lastActivity`（R-02-003）。
- `窗格渲染器`（src/client.mjs）：
  - 最近卡骨架补 `.dap-workspace` 元素（复用 await/running 的通用渲染逻辑）；新增一行 `.dap-lastact` 预览（隐藏当其为空），时间行保留。
  - 文案一律 `textContent` 写入。
- 测试/文档：`scripts/check.mjs` 新增 R-01-003/AC-03、R-01-010/AC-05、AC-06 锚点；`scripts/acceptance.mjs` 补人工验收；README「卡片信息」同步。

## 测试计划

- 核心（Node，`scripts/check.mjs`）：`lastActivityPreview`（有投影取 text、text 缺失回退 reply、投影缺失/空/非数组返回 null、超长截断）；`buildRecent` 条目含 `workspaceTitle` 与 `lastActivity`（有/无投影两种）；`cardSignature` 在 lastActivity 变化时必变；bundle 契约不变（仍无 `fetch(`，仍含 `ctx.get("sessions")`/`workspaces`）。
- GUI（人工，`scripts/acceptance.mjs`）：最近卡显示工作区徽标与最后活动概览；无归属时不显示徽标；投影缺失时仅时间；随会话更新刷新。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：工作区徽标与最后活动概览正常呈现 | `scripts/check.mjs#R-01-003/AC-03`、`scripts/check.mjs#R-01-010/AC-05`、`scripts/acceptance.mjs#R-01-010/AC-05`、`src/core.mjs::lastActivityPreview`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：投影缺失/格式异常应优雅降级 | `scripts/check.mjs#R-01-010/AC-05`、`src/core.mjs::lastActivityPreview` |
| 边界配置 | 适用：超长预览截断、无归属无徽标 | `scripts/check.mjs#R-01-010/AC-06`、`src/core.mjs::cleanPreview`、`src/core.mjs::workspaceTitleForSession` |
| 副作用 | 适用：lastActivity 并入签名，变化触发重绘且不泄露隐私 | `scripts/check.mjs#R-02-003/AC-01`、`src/core.mjs::cardSignature` |
| 兼容性 | 适用：未装 timeline 插件时最近卡仅时间、整体可用 | `scripts/check.mjs#R-02-001/AC-01`、`src/core.mjs::lastActivityPreview`、`src/client.mjs::renderCardInto` |

## 终态与证据

- 实现: 最近卡补工作区徽标（骨架增 `.dap-workspace`，复用通用渲染；R-01-003/AC-03 缺口收口）+ 最后活动概览行（新增核心纯函数 `lastActivityPreview`，取 `projectionValues.timelineUserMessages` 中 `seq` 最大条目的 `text`、缺失回退 `reply`、`cleanPreview` 截断；投影缺失/空/非数组返回 null → 卡片仅显示时间；`buildRecent` 条目新增 `lastActivity`；`cardSignature` 并入 `lastActivity` 触发去重重绘）；文案一律 `textContent` 写入；新增 `.dap-lastact` CSS（缺失整行隐藏只留时间）。审核修复：DESIGN 契约 null/undefined 表述矛盾收敛为 null、核心结构去掉 `?` 可选标注；防御性按 `seq` 取最大而非数组末位；client 冗余 `kind` 三元化简；PRD 措辞向 DOMAIN 规范词「最后活动概览」收敛。
- 测试: `node scripts/check.mjs` 全过（新增 R-01-003/AC-03 最近卡工作区归属、R-01-010/AC-05 lastActivityPreview 取 text/回退 reply/空投影/缺 key/无 projectionValues/超长截断/乱序按 seq 取最大、buildRecent 携带 lastActivity、cardSignature 随 lastActivity 变化）；GUI 人工实测确认最近卡显示工作区徽标 + 最后活动概览 + 时间行（headless Chrome 实测）；`agentmap_lint` 全绿（15 需求 / 43 AC / 锚定 43 / design-covered 15）。
- DESIGN 对照: 核心数据 `lastActivity`（恒写入、缺失为 null）、产品契约（buildRecent 输出 + lastActivityPreview 契约）、子系统（活动状态模型 helper + 渲染器最近卡骨架）、分区不变量、关键机制（数据源与降级）、追溯索引均已同步；DESIGN 与实现对照无差异。
- commit: 886d1ad
- review:
  - 审核方: Standards 子代理（kimi-coding/k3）/ Spec 子代理（kimi-coding/k3）
  - 目的理解: 审核 T-004 实现相对 PRD R-01-003/AC-03、R-01-010/AC-05、AC-06 与 DESIGN 契约、DECISIONS C-006、R-02-003 签名去重、横切约束（textContent 防注入、core 纯函数）的符合度，及仓库标准（AGENTS.md、CONVENTIONS）遵循。
  - 执行方式: code-review skill 双轴（Standards+Spec）并行子代理，评审基线 b2b416f（含并发 T-003 已提交部分），审核快照 /tmp/t004.diff + /tmp/t004_task.diff；子代理后端改用 kimi-coding/k3（opencode-go 额度受限）。
  - 问题与修复: Standards — DESIGN 契约「缺失为 undefined」与实现返回 null 不符 → 收敛为 null 并去 `?` 标注；renderCardInto 冗余 `kind==="recent"` 三元（Speculative Generality）→ 化简为 `entry.lastActivity ?? ""`；术语漂移（PRD「最后做的事情概览」vs DOMAIN「最后活动概览」）→ PRD 向规范词收敛。Spec — DESIGN 契约段两处取值表述冲突 → 同 Standards 修复；「最后一条」依赖数组顺序的隐含约定 → 防御性改为按 `seq` 取最大条目（check.mjs 补乱序断言锁定）。
  - 复审结论: 修复后重跑 `node scripts/check.mjs` 全过、`agentmap_lint` 全绿；残留为判断性提示（renderCardInto `workspaceTitle !== ""` 若上游传 undefined 会写 "undefined"——当前 buildRecent/buildEntries 均保证字符串、无触发路径，仅记录；`.dap-lastact` 缩写轻度 Mysterious Name）。
