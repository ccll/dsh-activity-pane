---
doc-type: task
mutation: lifecycle
id: T-047
---

# T-047 折叠时间线：检测到 dsh-auto-collapse 生效时同步其折叠分组呈现

状态: completed
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

- 实现: src/core.mjs 重构 conversationTimeline 为 rawTailItems/mergeLiveItems/promoteRunningTail 内核（可观察行为经既有断言与新增 livePlusTail 等价性断言钉住），新增 AUTO_COLLAPSE_STYLE_ID、foldWorkGroups（vendor 自 dsh-auto-collapse@0.1.3 findBlocks/updateChip 语义：用户/正文硬边界、reasoning 前置并入、context 连续段独立成组、标题优先级 正在运行→正在思考→编辑了文件/运行了命令→上下文注入→已思考、状态聚合 running>error>stopped>done、组摘要携带推理文本）与 foldedConversationTimeline（指数扩窗 ×3→×8→全序 + live 合并 + 尾部提升，组 id 稳定为首成员键）；src/client.mjs 增加 autoCollapseActive 只读探测（并入 memo 键）、history 冷路径折叠并记录 timelineFold、渲染期 else 分支折叠翻转重算（等待/上下文卡热装切换）、nativeWorkItemRow 对 fold 行显式短路、fallbackTraceIcon 折叠类别图标；scripts/check.mjs 新增 R-01-017 锚点用例（AC-02 硬边界/混排、AC-03 标题优先序含双运行、AC-04 推理文本、AC-05 聚合与提升、AC-06 limit/顺序/稳定 id）；scripts/acceptance.mjs 补装卸对比人工清单；PRD R-01-017（AC-04 措辞细化为「无执行中工具调用时」——本任务关闭汇报请东家追认）、DESIGN、DOMAIN、DECISIONS C-016、README 来源声明同步。
- 测试: pnpm build:client && pnpm check 全绿（R-01-017 新增用例 + 既有 100 验收点全量锚定）；python3 tools/agentmap_lint.py --report 通过（requirements=21 / acceptance-criteria=100 / design-covered=21 / test-anchored=100）；git diff --check 干净；提交时 pre-commit 钩子（20-agentmap-lint、30-dsh-activity-pane-check）重放通过。GUI 现场验收（装/卸 dsh-auto-collapse 对比两种呈现）由东家按 scripts/acceptance.mjs 人工核验。
- DESIGN 对照: 折叠时间线产品契约、检测只读探测与 memo 键、指数扩窗内核、fold 行短路原生行匹配、冷路径 16 项窗口与热装翻转重算、归属约束与 C-016 均与实现一致；PRD R-01-017/AC-04 措辞细化已同步（见上）。
- commit: 7676b34
- review:
  - 审核方: 双轴独立子代理（Standards 轴 f2dc4ed2、Spec 轴 6b58a62a）。
  - 目的理解: 东家要求时间线在 dsh-auto-collapse 生效时同步其折叠分组呈现（组标题+推理文本，无需展开）；运行时调用不可行（导出面仅 apply/inject/name、平台禁跨插件 import），采用 vendor 数据层移植；检测失败须优雅回退 R-01-012 逐项镜像。
  - 执行方式: code-review skill 双轴并行审核，基线 e324150，diff=`git diff e324150`；Spec 轴逐段比对 vendor lib/client.js 的 findBlocks/deriveBlockInfo/updateChip/thinkSummary 与 PRD AC 及 DESIGN 契约；修复后同审核方逐条复审。
  - 问题与修复: Standards 轴——1) 硬违例：nativeWorkItemRow 函数行缩进丢失 → 恢复 tab（并清理一次误写为字面 \t 的文件字节）；2) 等价性：promote 守卫由 liveItems.length===0 收紧为 !some(running) → 补 livePlusTail 断言钉住可达语义（live 项恒 running，等价性注释锚定）；3) 气味（判断性）：分组 id 含成员数致流式 DOM 键漂移 → 改为首成员键稳定 id；魔数 3/8、16/4 与布尔 fold 标记维持现状（DESIGN 承载、短路配套、实现自由）。Spec 轴——1) bundle 陈旧 → 重建后全绿；2) 冷卡热装不切换（AC-06）→ history 加载记录 timelineFold + 渲染期 else 分支翻转重算；3) 分组 id 不稳定 → 同 Standards 修复；4) AC-03/AC-04 张力 → PRD AC-04 措辞细化（无执行中工具调用时），补 bothRunning 用例；5) 16 项窗口为计划内取舍。
  - 复审结论: Standards 轴——无残留硬违例、无新增问题，原判断性气味均已处置或有据保留，通过。Spec 轴——全部 6 项修复逐条确认，两条非阻塞备注（无 id 成员的理论 id 前缀重合不可达；AC-04 措辞演进需东家闸口追认——见上），通过。
