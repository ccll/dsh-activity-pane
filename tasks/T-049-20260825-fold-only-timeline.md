---
doc-type: task
mutation: lifecycle
id: T-049
---

# T-049 时间线只保留折叠分组呈现，移除逐项镜像与检测切换

状态: active
关联: R-01-017 → 活动状态模型、窗格渲染器；R-01-009、R-01-012（AC 语义同次改写）
风险等级: standard

## 背景与目标

折叠时间线（T-047，C-016 vendor 数据层移植）经东家实际使用确认效果良好，逐项镜像呈现不再被需要。东家决定：完全移除旧的逐项同步显示模式，未来只支持折叠输出模式——时间线无条件折叠分组，不再探测 dsh-auto-collapse。经评估确认连带收益：逐项路径专属的宿主 DOM 匹配/图标克隆呈现机器（约 150 行）失去全部消费者，同次清除。本变更为需求变更（改变可观察行为），走全链：PRD（R-01-009/R-01-012/R-01-017/R-01-018 AC 措辞）、DESIGN（契约/模块/追溯索引）、DOMAIN（术语与不变量）、DECISIONS C-017 同次演进。

## 差距评估

- PRD：R-01-017 为条件切换语义、R-01-012 AC-02/AC-03 为逐项保真语义、R-01-009 AC-01/AC-02 等以单工作项为主语 → 已同次改写为分组行语义。
- DESIGN：检测探测契约条目、`conversationTimeline` 双来源描述、指令槽位双路径派生、原生行匹配/fallback 描述 → 已同次改写。
- DOMAIN：「折叠时间线」词条条件化、两条不变量含「未检测到即回退逐项」 → 已同次改写。
- DECISIONS：无否决史冲突；新增 C-017 记录本决策与被否方案。
- `src/core.mjs`：逐项家族 `conversationTimeline`/`conversationTimelineWithSlot`/`historyTimelineWithSlot`/`SLOT_SCAN_BUDGET` 与 `AUTO_COLLAPSE_STYLE_ID`、`mergeTraceStatus`、`nativePresentationSessionId` 可删；共享内核 `rawTailItems`/`mergeLiveItems`/`promoteRunningTail`/`foldWorkGroups` 保留；需新增 `conversationWorkItems` 扁平内核导出供折叠输入与成员级测试观察。
- `src/client.mjs`：`autoCollapseActive` 探测、memo 键 fold 维度、冷卡翻转重算块、原生行索引/匹配/图标克隆/缓存记账可删；渲染层直接采用核心派生状态。
- `scripts/check.mjs`：约 49 处以 `conversationTimeline` 作条目构造器的用例换内核入口；逐项槽位用例删除；`mergeTraceStatus`/`nativePresentationSessionId` 断言删除；bundle 契约断言更新并补负向守卫。
- `scripts/bench.mjs`：基准入口换折叠函数。

## 收敛方案

- `src/core.mjs`：
  - 删除 `AUTO_COLLAPSE_STYLE_ID`、`conversationTimeline`、`SLOT_SCAN_BUDGET`、`conversationTimelineWithSlot`、`historyTimelineWithSlot`、`mergeTraceStatus`、`nativePresentationSessionId`。
  - 新增 `conversationWorkItems(snapshot, limit, cwd)`：rawTailItems + live 合并 + 尾部提升的扁平窗口，作为折叠分组输入内核与分组成员级观察接缝。
  - `foldedTimelineWithSlot` 成为渲染层唯一时间线来源（签名与扩窗语义不变）；`conversationTimelineFromHistory` 收敛为 history 事件→扁平工作项映射器。
- `src/client.mjs`：
  - 删除 `autoCollapseActive` 与热/冷路径的全部检测分支：热路径 memo 键收敛为 快照引用+cwd+lastUser，单调用 `foldedTimelineWithSlot`；冷卡历史加载时一次性按折叠派生，删除 `detail.timelineFold` 记账与翻转重算。
  - 删除原生行呈现机器：`nativeRowIndex`/`disclosureRowSummary`/`matchNativeThinkRow`/`matchNativeContextRow`/`nativeWorkItemRow`/`cloneNativeIcon`/`nativeIdleIcon`/`findNativeActionIcon`/`tintSvgCurrentColor`/`nativeWorkItemPresentation`/`nativeIconsByTraceKey` 记账；`renderTrace` 去除 presentation 分支，行状态直接取核心派生值；图标一律 canonical 自绘。
- 测试迁移：条目级用例换 `conversationWorkItems` 入口（断言语义不变）；槽位用例保留折叠与 history 路径；bundle 断言更新 + 新增负向守卫（无 dshcf/autoCollapseActive/nativeWorkItemRow 残留）；bench 换折叠入口；acceptance 的装/卸对比步骤改为无条件折叠验收。
- 不新增依赖；README 来源声明保留（vendor 归属不变）。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（迁移后全量锚定断言通过）。
- 新增负向 bundle 守卫：bundle 不含 `dshcf` 探测、`autoCollapseActive`、`nativeWorkItemRow`、`cloneNativeIcon` 标识。
- `python3 tools/agentmap_lint.py --report` 追溯完整（PRD→DESIGN 双向、全 AC 锚定）。
- `git diff --check` 干净；提交时 pre-commit 钩子重放通过。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：未装 dsh-auto-collapse 时时间线同样折叠分组，组标题/摘要/状态正确 | `scripts/check.mjs#R-01-017 折叠时间线`、`scripts/check.mjs#R-01-009/AC-10 尾部提升作用于折叠分组行`、`src/core.mjs::foldedTimelineWithSlot` |
| 异常 | 适用：空快照/空 history 返回空行空槽位；插件缺失不降级不报错 | `scripts/check.mjs#limit=0 返回空时间线`、`scripts/check.mjs#空 order 返回空时间线`、`src/client.mjs::renderTraceLoading` |
| 边界配置 | 适用：长会话扩窗兜底、槽位确定性、lastUser 兜底、history 冷路径折叠 | `scripts/check.mjs#R-01-018 指令槽位`、`src/core.mjs::foldedTimelineWithSlot` |
| 副作用 | 适用：删除面无残留引用、检测与原生行机器零残留、bundle 契约全量通过 | `scripts/check.mjs#无 dsh-auto-collapse 探测残留`、`scripts/check.mjs#原生行匹配/图标克隆机器无残留`、`src/client.mjs::foldedTimelineWithSlot` |

## 终态与证据

（实现完成后填写）
