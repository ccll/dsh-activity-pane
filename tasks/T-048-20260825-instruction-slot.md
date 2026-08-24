---
doc-type: task
mutation: lifecycle
id: T-048
---

# T-048 指令槽位：窗口外最近用户指令常驻时间线顶部

状态: completed
关联: R-01-018 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家验收折叠时间线时发现：时间线只显示最近 4 行（R-01-017/AC-06），用户指令一旦被滚动挤出窗口就无法再看。东家要求：时间线顶部常驻一个「用户消息槽位」——被挤出窗口的最近一条用户指令停靠其中，直到被更新的指令替换；窗口内已见该指令时不重复显示。经东家确认：折叠与逐项镜像两种呈现统一适用；槽位行与用户消息行同款样式（底部分隔线区分）；槽位不计入 4 行窗口。本需求同次演进 PRD（R-01-018）、DESIGN（契约/模块/追溯索引）、DOMAIN（「指令槽位」术语）。

## 差距评估

- PRD 无窗口外指令常驻需求 → 新增 R-01-018（本任务同次演进，东家已确认 AC 语义与适用范围）。
- DESIGN 需求追溯索引、产品契约、模块内部结构、渲染器条目 → 同次补齐。
- DOMAIN 缺「指令槽位」术语 → 同次登记。
- `src/core.mjs`：`foldedConversationTimeline` 扩窗已拿全量行（截断前），但截断后即丢，窗口外数据不可达；`conversationTimeline` 只收 limit 项，无窗口外数据；history 冷路径窗口外数据在 16 项窗口内（折叠）或全部事件项（逐项）。
- `src/client.mjs`：时间线 memo 只存行数组；渲染层 `.dap-trace` 容器由 `renderTrace` 以稳定 key 管理，槽位需独立宿主（卡片根、插于 `.dap-trace` 前）避免破坏 DOM 复用。
- `scripts/check.mjs`：无槽位用例。

## 收敛方案

- `src/core.mjs`：
  - 导出 `SLOT_SCAN_BUDGET = 64`；新增 `windowHasUser` 与内部 `slotOf(rows, keep)`：全量行按时间正序，窗口保留最后 keep 行，窗口内已含用户指令行时返回 null，否则窗口外前段逆向取最近 kind=user 行副本（含 `slot: true` 标记）。
  - 新增 `foldedTimelineWithSlot(snapshot, limit, cwd, lastUser)`：扩窗收集 → 全量 `foldWorkGroups(merged, 不限)` → `{ rows: promote(slice(-limit)), slot }`；扩窗停止条件并入槽位确定性（窗口行满 4 且窗口内含指令或已找到窗口外指令才停，否则继续扩窗直至全序兜底，保证窗口外指令只要存在就能被找到）；`foldedConversationTimeline` 改为委托其 `.rows`（行为不变）。
  - 新增 `conversationTimelineWithSlot(snapshot, limit, cwd, lastUser)`：`rawTailItems(budget = limit + SLOT_SCAN_BUDGET)` 有界收集起步，槽位未确定时同档扩窗（×8 直至全序兜底）；`conversationTimeline` 改为委托其 `.rows`。
  - `lastUser` 兜底：行内窗口外无指令且窗口内无指令行时，用最近用户指令作槽位（运行卡 ChatSnapshot 窗口不含旧指令时的槽位源）。
  - 新增 `lastUserFromEvents(events)`：从 history 事件提取最近一条用户指令全文；新增 `foldWorkGroupsWithSlot(items, limit)` 与 `historyTimelineWithSlot(history, limit, cwd)`：history 冷路径包装，返回 `{ rows, slot }`（全量 items 上派生）。
- `src/client.mjs`：
  - 热路径 memo：键增 `detail.lastUser` 引用维度；调用传 `detail.lastUser`；派生后从窗口行就近 user 行刷新 `detail.lastUser`（值相等不换引用防抖动重算）；`detail.memoTimeline = rows`、`detail.memoSlot = slot`；`entry.timeline`/`entry.slot` 随渲染派生。
  - 冷路径：改用 `foldWorkGroupsWithSlot(全量 events, 4)` / `historyTimelineWithSlot(4)`，`detail.timelineSlot` 记录；`detail.lastUser = lastUserFromEvents(events)` 在 history 就绪时提取；`entry.slot` 归一 `?? null`。
  - 运行卡槽位源：loadNativeDetails 对无 history 的运行卡轻量拉取最近一页（maxMessages 50）事件提取 `detail.lastUser`（一次、失败静默降级隐藏、不重试）。
  - 新增 `renderSlot(container, slot)`：`.dap-slot` 插于 `.dap-trace` 之前（卡片根内），内容为 user 图标 + 指令文本（单行省略）；文本经 textContent 写入、值未变不写；无槽位隐藏不占位；`renderTimelineArea` 统一入口调用。
  - CSS：`.dap-slot` 与用户行同款排版 + 底部分隔线；`[hidden]` 隐藏。
- 不新增依赖；README 来源声明不涉及。
- DESIGN 同步（已随本任务同次更新）。

## 测试计划

- `scripts/check.mjs` 新增用例（锚定 R-01-018 AC）：
  - AC-01：窗口（4 行）外存在用户指令时，`foldedTimelineWithSlot`/`conversationTimelineWithSlot` 的 slot 为该指令（文本、kind=user、slot 标记）；逐项与折叠一致。
  - AC-02：窗口内已含最近用户指令 → slot 为 null；窗口外无用户指令（纯工具流）→ slot 为 null；rows 长度仍 ≤ limit。
  - AC-03：多用户指令场景，window out 取最近一条；替换语义（新指令挤出后 slot 换成新指令）；窗口行内容不回退。
  - history 冷路径包装（foldWorkGroupsWithSlot / historyTimelineWithSlot）同语义。
  - 既有 `conversationTimeline`/`foldedConversationTimeline` 用例零改动通过（委托等价性）。
- `pnpm build:client && pnpm check` 全绿；`python3 tools/agentmap_lint.py --report` 追溯完整；`git diff --check` 干净。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：两模式窗口外最近指令正确产出槽位；渲染层显示/隐藏/替换正确 | `src/core.mjs::slotOf`、`src/core.mjs::foldedTimelineWithSlot`、`scripts/check.mjs#R-01-018 指令槽位`、GUI 现场验收 |
| 异常 | 适用：窗口内已含指令、窗口外无指令一律隐藏；空快照/空 history 返回空 | `scripts/check.mjs#R-01-018/AC-02`、`src/core.mjs::conversationTimeline` 与 `scripts/check.mjs#conversationTimeline` 既有回归 |
| 边界配置 | 适用：limit=0（不显示槽位）、多指令替换、history 窗口与折叠扩窗差异路径 | `scripts/check.mjs#R-01-018/AC-03` 边界用例、`src/core.mjs::foldWorkGroupsWithSlot` |
| 副作用 | 适用：时间线函数委托后返回数组语义不变、memo 键不含新维度（复用既有）、DOM 稳定性不受槽位影响（独立宿主） | `scripts/check.mjs#conversationTimeline` 与 `scripts/check.mjs#foldedConversationTimeline` 全量既有断言、`src/client.mjs::renderSlot` |

## 终态与证据

- 实现: src/core.mjs 新增 windowHasUser/slotOf/fallbackSlot（行内窗口外最近用户指令查找与 lastUser 兜底）、lastUserFromEvents（history 最近用户指令提取）与 timelineWithSlot 家族——foldedTimelineWithSlot/conversationTimelineWithSlot/foldWorkGroupsWithSlot/historyTimelineWithSlot 返回 { rows, slot }（折叠/逐项/冷 history 四路径语义一致；扩窗停止条件并入槽位确定性：窗口含指令或已找到窗口外指令即止，否则 ×8/全序兜底，保证存在即找到）；conversationTimeline/foldedConversationTimeline 委托 .rows 语义不变；src/client.mjs 新增 renderSlot（.dap-slot 插于 .dap-trace 前、用户行同款+底部分隔线、hidden 不占位、文本 textContent 写入）、热路径 memo 键扩展 memoTimelineUser + 行内刷新 lastUser（值相等不换引用防抖动）、冷路径全量页内事件派生（timeline/timelineSlot/lastUser）、运行卡一次性轻量 history 拉取（lastUserLoad 记账、失败静默降级）、深浅主题 CSS 覆盖；scripts/check.mjs 新增 R-01-018 全 AC 锚定用例（停靠/隐藏/替换/委托等价/预算外扩窗档/兜底/提取）+ bundle TDZ 防回归断言；PRD/DESIGN/DOMAIN 同次演进（R-01-018、指令槽位术语、契约与追溯索引）。
- 测试: pnpm build:client && pnpm check 全绿（103 验收点全量锚定，requirements=22）；python3 tools/agentmap_lint.py --report 通过；git diff --check 干净；提交时 pre-commit 钩子（20-agentmap-lint、30-dsh-activity-pane-check）重放通过。GUI 现场验收受 dsh web 服务端客户端加载异常（Failed to load plugins，非本插件代码问题）影响未能完成 headless 复验，向東家报告后以东家浏览器为准。
- DESIGN 对照: 指令槽位契约（两模式统一、槽位不计 4 行窗口、扩窗停止条件、lastUser 轻量 history 兜底源、渲染层 .dap-slot 结构）与需求追溯索引 R-01-018、活动状态模型槽位派生条目、窗格渲染器槽位行条目均与实现一致。
- commit: 035a9ff
- review:
  - 审核方: 独立子代理（subagent_fork 双轴并行审核）。
  - 目的理解: 东家要求在折叠与逐项镜像呈现下，被挤出 4 行窗口的最近一条用户指令常驻时间线顶部（被更新指令挤出时替换，窗口内已见不重复）；运行卡 ChatSnapshot 窗口裁剪后旧指令不可得，需轻量数据面补齐。
  - 执行方式: code-review skill 双轴（Standards + Spec）审核 git diff e928c10..工作区；standards 对照 AGENTS/CONVENTIONS 与既有代码风格 + Fowler 味道基线；spec 对照 PRD R-01-018 三 AC 与 T-048 方案。
  - 问题与修复: Standards——硬性 1) memo 块 const derivedTimeline 声明晚于引用（TDZ，运行卡渲染每帧抛错）→ 重排声明顺序并加 bundle 防回归断言；硬性 2) SLOT_SCAN_BUDGET JSDoc 声称「预算内未找到即无槽位」与扩窗实现矛盾 → 注释修正；判断性（性能物化量 J5、farBig 用例缺口 J8 等）→ 补预算外扩窗档用例，其余有据保留。Spec——硬性 1) 同 TDZ（P0，槽位与时间线整体崩溃）；硬性 2) api.history 响应为 {events,hasMore,projections} 对象而按数组解析 → 改 value.events 解构；硬性 3) 浅色主题 CSS 把 .dap-slot 塞进 background 选择器组（整行盖背景）→ 改 border-bottom-color 覆盖并独立声明；判断性（PRD 条目间空行 J9）→ 补空行。
  - 复审结论: 全部硬性 finding 修复并以 build/check/lint 全绿 + bundle 语法校验复核；运行卡现场复验因 dsh web 服务端客户端加载异常未能完成（环境问题），故未做 reviewer 二次独立复审，此点如实记录。