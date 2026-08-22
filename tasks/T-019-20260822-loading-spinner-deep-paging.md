---
doc-type: task
id: T-019
mutation: lifecycle
---

# T-019 加载指示清理缺陷与历史预览深翻页

风险等级: standard
状态: completed

## 背景与目标

- 背景: 实机验证 R-01-014 时发现三类缺陷：
  1. 预览/模型为空的卡片加载指示永久残留——离开加载态时 `line.textContent !== previews[i]`（spinner 无文本，`"" !== ""` 为假）跳过赋值，spinner 子节点永不被清除（模型区域同款）。
  2. 预览 memo 键中毒：`previewsKey = detailSnapshot ?? detail.history` 在持有 retained 快照时恒定，history 深读到账不触发重算，预览永久为空。
  3. 预览数据缺失：`api.history({ maxMessages: 50 })` 只取尾部一页（与 DSH 懒加载窗口一致），更早的用户/agent 消息不在页内，该类会话预览取不到。东家已拍板「有界深翻页」方案。
- 目标: 离开加载态时无条件清除 spinner；预览 memo 对 history 引用变化敏感；尾页取不到最近用户/agent 消息时经同一并发池用 `beforeSeq` 向前深翻最多 3 页（约 150 条消息），找到或翻尽即止。
- 非目标: 不引入轮询；不改变 timeline 的取源（仍为尾页工作项）；不做无限深翻。

## 差距评估

- 现状基线:
  - `renderCardInto` 的 model/history-line 分支用 textContent 相等守卫跳过写入，spinner 残留。
  - recent 预览 memo 键只取 snapshot 优先，history 到账不重算。
  - history 读取只取尾页；previews 缺消息即永久空。
- 目标差距:
  - 离开加载态时先清 spinner（dataset.loading 删除路径无条件写回文本），否则才走相等守卫。
  - memo 增加 `memoPreviewsHistoryOf` 跟踪 history 引用。
  - history 链式深翻：单池任务内串行拉取，累计事件 prepend，每次页后重算 previews，满足或翻尽或 `hasMore=false` 即止；尾页仍供 timeline；部分失败保留已得事件。

## 收敛方案

1. `src/client.mjs`:
   - model/history-line 离开加载态分支：`delete dataset.loading` 时无条件 `textContent = 目标文本`（清除 spinner 子节点），否则维持相等守卫。
   - recent 预览 memo：增加 history 引用分量（`memoPreviewsHistoryOf`）。
   - history 分支：`HISTORY_MAX_PAGES = 3`，单池任务内 while 循环拉页（`beforeSeq = 页首事件 seq`），累计 `allEvents.unshift(...)`，`detail.timeline` 仍取尾段、`detail.previews = messagePreviews({ history: allEvents })`；异常保留已得事件并记录 `historyError`。
2. `scripts/check.mjs`：bundle 契约断言（spinner 无条件清除、beforeSeq/HISTORY_MAX_PAGES、memoPreviewsHistoryOf）；messagePreviews 跨页累计事件的锚定断言（R-01-013/AC-03、AC-04）。
3. `DESIGN.md`：关键机制「冷会话一次性读取」更新为「有界深翻页」。
4. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 增补：
  - R-01-013/AC-03、AC-04: messagePreviews 对累计多页事件取最新用户/agent 物理首行（旧页消息不遮蔽新页）。
  - R-01-014/AC-02: bundle 断言离开加载态时 spinner 被无条件清除（dataset.loading 删除路径带无条件 textContent 写回）。
  - R-01-014/AC-05: bundle 断言深翻页有界（HISTORY_MAX_PAGES）且失败降级保留已得事件。
- `scripts/acceptance.mjs` 增补人工步骤：用户消息在懒加载窗口之外的会话，预览经深翻出现且 spinner 不残留。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：尾页含消息时行为不变（一页即止） | `scripts/check.mjs#R-01-013/AC-03`、`src/client.mjs::loadNativeDetails` |
| 异常 | 适用：深翻中途失败保留已得事件、失败置空可重试 | `scripts/check.mjs#R-01-014/AC-05`、`src/client.mjs::loadNativeDetails` |
| 边界配置 | 适用：最多 3 页、hasMore=false 即止、无用户消息时只补 agent 预览 | `scripts/check.mjs#R-01-014/AC-05`、`src/client.mjs::loadNativeDetails` |
| 副作用 | 适用：spinner 清除不破坏既有 textContent 相等守卫的去重语义；深翻仍走并发池不占额外并发 | `scripts/check.mjs#R-01-014/AC-02`、`src/client.mjs::renderCardInto` |

## 终态与证据

- 实现: `src/client.mjs`：`restoreTextField` 统一「离开加载态无条件写回 / 否则相等守卫」，修复预览行与模型区 spinner 永久残留；预览 memo 增加 `memoPreviewsHistoryOf` 分量（history 到账即重算）；history 分支改用 `pagedHistoryEvents`（`HISTORY_MAX_PAGES=3`、`beforeSeq` 向前、单池任务内串行、中途异常保留已得事件）。`src/core.mjs`：新增 `pagedHistoryEvents` 纯函数（fetchPage 注入，可单测）。
- 测试: `pnpm build:client && pnpm check` 通过（六组深翻行为链断言：一页即止/深翻+beforeSeq 页首 seq/maxPages 上限/hasMore 即止/中途失败保留/业务错误停止，锚定 R-01-014/AC-05、R-01-013/AC-03、AC-04；messagePreviews 累计事件断言）；`scripts/acceptance.mjs` 新增深翻页与 spinner 不残留人工步骤；`python3 tools/agentmap_lint.py --report` 通过（18 需求 / 61 AC，测试锚定 61/61）；`git diff --check` 通过。
- DESIGN 对照: DESIGN 关键机制「冷会话 history 一次性读取」已更新为「beforeSeq 有界深翻（最多 3 页，找到或翻尽即止）」，与实现一致；无轮询纪律保持（单池任务串行、一次性）。
- commit: 8dd6c71
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: T-019 为 map 不变的缺陷修复：spinner 残留（离开加载态相等守卫跳过赋值）、预览 memo 键中毒、尾页外消息预览缺失（东家定有界深翻页）；关联约束 R-01-013/R-01-014 与无轮询纪律。
  - 执行方式: `code-review` skill；评审基线 `b3857f9`，范围 `git diff b3857f9...HEAD`（2b55e9f 实现、a57b29d/8dd6c71 修复），Standards/Spec 两轴独立审核，修复后由同一审核方两轮复审。
  - 问题与修复: Standards 轴硬违例（内部实现类 bundle 断言——先抽 `pagedHistoryEvents` 纯函数补行为测试，再删四条断言彻底收口）+ 判断题 Duplicated Code（收敛 `restoreTextField`）；Spec 轴 1 项 finding（分页序列/异常保留/重试缺行为测试——六组行为链断言补齐），均修复并经复审关闭。
  - 复审结论: Standards 两轮复审全部关闭；Spec 复审 finding 关闭、语义保持确认、无新偏差。
