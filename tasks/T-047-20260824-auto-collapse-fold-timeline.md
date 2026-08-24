---
doc-type: task
mutation: lifecycle
id: T-047
---

# T-047 折叠时间线：检测到 dsh-auto-collapse 生效时同步其折叠分组呈现

状态: active
关联: R-01-017 → 活动状态模型
风险等级: standard

## 背景与目标

东家安装 dsh-auto-collapse 后，主会话窗口把工具卡片与思考块折叠成一行行摘要，信息密度显著高于活动卡时间线的逐项镜像；窗格显示的最后 4 条工作项多为 bash/grep/think 逐条罗列，看不出"干了什么、干得怎么样"。东家要求：检测到该插件存在并生效时，时间线同步为其折叠分组的样子；不需要展开能力，只要折叠后的组标题与推理输出的文本内容。经查证（C-016）：运行时调用不可行（导出面仅 apply/inject/name）、读其 DOM 仅覆盖当前选中会话且耦合私有类名，故采用 vendor 数据层移植。

## 差距评估

- PRD 原无折叠呈现需求 → 新增 R-01-017（本任务同次演进）。
- DESIGN 需求追溯索引、产品契约、关键机制、模块职责/结构、横切约束归属 → 同次补齐。
- DOMAIN 缺「折叠时间线」「工作项分组」术语与硬边界不变量 → 同次登记。
- `src/core.mjs`：`conversationTimeline` 只做尾部逐项收集 + live 合并 + 尾部提升，无分组能力；分组所需原始数据（kind/toolName/summary/detail/status）已齐备。
- `src/client.mjs`：时间线 memo（`detail.memoTimeline`）固定调 `conversationTimeline(snapshot, 4, cwd)`；history 冷路径 `conversationTimelineFromHistory(events, 4, cwd)` 同为逐项；渲染层 `renderTrace` 对未知 id 的项自动走 fallback 图标路径，但 think 组图标需小幅扩展 `fallbackTraceIcon`。
- `scripts/check.mjs`：无任何分组用例。
- auto-collapse 检测点：其样式标记 `#dshcf-style[data-dshcf-state="active"]` 为唯一公开生效信号。

## 收敛方案

- `src/core.mjs`：
  - 把 `conversationTimeline` 的尾部收集与 live 合并重构为内部内核 `rawTailItems` / `mergeLiveItems`（行为逐字保留，既有单测回归锚定）。
  - 新增纯函数 `foldWorkGroups(items, limit)`：移植 findBlocks 块识别 + updateChip 标题/摘要优先级——用户输入项与含正文 assistant 项为硬边界；含正文 assistant 的 reasoning 先并入当前分组（splitThinkByBody 前置语义）；连续 context 独立成组；组标题优先级 正在运行→正在思考→运行了命令/编辑了文件（任一 Edit/Write）→上下文注入（全 context）→已思考；AC-04 要求组摘要携带推理文本内容（完成态取最后一条思考的文本首行截断），这是对 auto-collapse「收起后不显示内容」的有意偏离（东家显式要求）；状态聚合 running>error>stopped>done；组行带 `fold: true` 标记、不携带 callId/toolName 匹配键。
  - 新增 `foldedConversationTimeline(snapshot, limit, cwd)`：指数扩窗（limit×3 → ×8 → 全序）收集 + live 合并 + 分组，不足 limit 组继续扩窗；尾部提升规则作用于分组行。
  - 导出 `AUTO_COLLAPSE_STYLE_ID = "dshcf-style"` 常量供渲染层探测共用。
- `src/client.mjs`：
  - 时间线 memo 键增加检测结果维度（`memoTimelineFold`）；每渲染遍读取一次 `document.getElementById(AUTO_COLLAPSE_STYLE_ID)?.getAttribute("data-dshcf-state") === "active"`，生效时 memo 改调 `foldedConversationTimeline`。
  - history 冷路径在检测生效时改为 `foldWorkGroups(conversationTimelineFromHistory(events, 16, cwd), 4)`（先取 16 项再折叠成最多 4 组）。
  - `fallbackTraceIcon` 对 `fold` 组行给类别图标：think 组用思考图标、context 组用浏览图标、tool 组按末位工具成员 icon 兜底。
- 不新增依赖、不加 CSS（复用 `.dap-trace-item` 结构）、不改宿主 DOM 写入面。
- README 来源声明补一行（dsh-auto-collapse 分组语义改编）。

## 测试计划

- `scripts/check.mjs` 新增用例（锚定 R-01-017 AC）：
  - AC-02：工具+思考混排合并为一组；用户输入与正文打断分组（硬边界两侧各成组）。
  - AC-03：running tool → 「正在运行」+该成员摘要；running think → 「正在思考」+最新行；完成态 运行了命令/编辑了文件/上下文注入/已思考 判定。
  - AC-04：含思考分组的 summary 为推理文本内容；流式 running 思考取最新行。
  - AC-05：状态聚合（error/stopped/done 组合）；尾部提升在分组行上适用。
  - AC-06：limit=4 截断与顺序；`conversationTimeline` 既有全部用例零改动通过（重构等价性）。
  - AC-01：GUI 探测行为入 scripts/acceptance.mjs 人工清单（装/卸插件对比两种呈现）。
- `pnpm build:client && pnpm check` 全绿；`python3 tools/agentmap_lint.py --report` 追溯完整；`git diff --check` 干净。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：检测生效时四类组标题/摘要/状态正确产出 | `src/core.mjs::foldWorkGroups`、`scripts/check.mjs#R-01-017 折叠时间线`、GUI 现场验收 |
| 异常 | 适用：插件未装/标记缺失/非 active 态一律回退逐项镜像；空窗口返回空数组 | `scripts/check.mjs#conversationTimeline` 既有回归、`scripts/acceptance.mjs#R-01-017/AC-01` 装卸对比、`src/core.mjs::conversationTimeline` |
| 边界配置 | 适用：硬边界（正文/用户项）切组、reasoning+正文同行拆分、context 连续段、limit 截断、指数扩窗 | `scripts/check.mjs#R-01-017/AC-02` 边界用例、`src/core.mjs::foldedConversationTimeline` |
| 副作用 | 适用：conversationTimeline 重构等价、签名去重与 DOM 复用不回归、bundle 契约不变 | `scripts/check.mjs#conversationTimeline` 全量既有断言、`src/core.mjs::conversationTimeline` |

## 终态与证据

- 实现: 待填
- 测试: 待填
- DESIGN 对照: 待填
- commit: 待填
- review:
  - 审核方: 待填
