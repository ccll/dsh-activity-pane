---
doc-type: task
mutation: lifecycle
id: T-063
---

# T-063 迁移动画双向化与受影响卡片 FLIP 过渡

状态: completed
关联: R-01-010 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

现状（T-037 引入）：会话卡由活动区迁入历史区时，迁移卡本身以克隆 ghost FLIP 动画呈现，但同一帧内位置受影响的其它卡片（活动区下移/上移的卡、整个历史区）瞬间跳变，视觉突兀；历史区→活动区方向（历史会话重新活动）完全无动画，卡片瞬时出现且其余卡片瞬时让位。

东家确认的验收口径（PRD R-01-010/AC-07 改写、AC-10 新增，DESIGN 同步演进）：

- 迁移双向化：活动区↔历史区任一方向的迁移都播放 ghost FLIP 动画，可感知来源与去向。
- 迁移帧内所有位置受影响的卡片（含「最近历史」段头）以 FLIP 平移平滑过渡到新位置，不瞬间跳变。
- `prefers-reduced-motion` 或矩形不可量取时维持直接落位降级。

## 差距评估

- `src/core.mjs`：仅有 `movedToRecentIds`（活动→历史）单向检测，无历史→活动方向纯函数。
- `src/client.mjs`：
  - `prevRenderedRecentIds` 未记账，反向迁移无法判定。
  - `prepareMoveGhosts`/`runMoveGhosts` 源/目标卡池硬编码为 活动卡池→历史卡池，不支持反向。
  - 无任何针对「非迁移卡位置变化」的 FLIP 机制，位置变化卡片瞬移。
- `scripts/check.mjs`：R-01-010/AC-07 锚点只覆盖单向；AC-10 无锚点。
- `scripts/acceptance.mjs`：人工验收步骤只描述单向动画。

## 收敛方案

- `src/core.mjs`（纯函数，可单测）：
  - 新增 `movedToActiveIds(prevRecentIds, active, recent)`：id 在上一帧历史区、本帧离开历史区且出现于活动区 → 判定一次反向迁移（彻底消失不判定），与 `movedToRecentIds` 镜像对称。
- `src/client.mjs`：
  - 渲染器补记 `prevRenderedRecentIds`（与 `prevRenderedActiveIds` 同生命周期：签名提交时更新、窗格重建时重置）。
  - 迁移计划泛化：两方向各自产出 `{ id, from, to }`（源/目标卡池），`prepareMoveGhosts` 从 `from` 池量取源矩形克隆 ghost，`runMoveGhosts` 在 `to` 池量取目标矩形启动 FLIP；ghost 挂载、形变、淡出、真卡淡入、`transitionend` 收口语义两方向一致。
  - 受影响卡片 FLIP：存在迁移计划时，DOM 写入前量取两卡池全部现存卡片与历史区段头（`.dap-recent-head`）的当前视觉矩形；DOM 写入后对仍连接且位置变化的元素施加反向位移（`translate(dx, dy)`，无过渡），强制 reflow 后挂 `dap-shift`（`transition: transform 0.3s ease`）并清除内联 transform，平滑归位；`transitionend`（once）移除类。平移中再次迁移：以当帧视觉矩形为起点重算反向位移，先取消旧平移（移除类与监听）再重启，无叠加漂移。元素被 prune 或卸载时同步取消其平移状态。
  - 降级路径不变：`prefers-reduced-motion` 时 `prepareMoveGhosts` 返回空，FLIP 量取整体跳过，全部直接落位。
- `scripts/check.mjs`：
  - `movedToActiveIds` 纯函数锚点（镜像用例：反向迁移判定、彻底消失不判定、上一帧不在历史区不判定、仍在历史区不判定）。
  - bundle 契约锚点：反向检测接线（`movedToActiveIds(`）、反向 ghost 目标池（活动卡池）、`.dap-shift` 过渡样式、FLIP 反向位移与 reflow 重启、`transitionend` 收口复用、reduced-motion 门控。
- `scripts/acceptance.mjs`：AC-07 步骤补双向与受影响卡片观察、新增 AC-10 步骤。

## 测试计划

- 纯函数单测（`node scripts/check.mjs`）：`movedToActiveIds` 四用例。
- bundle 契约断言：上述锚点经 `pnpm build:client && pnpm check` 全绿。
- 人工验收（`node scripts/acceptance.mjs` 清单）：
  - 活动→历史迁移：迁移卡 ghost 动画不变；其余活动卡、历史卡与段头平滑滑动到位。
  - 历史→活动迁移（历史会话重新运行/变为等待）：历史卡 ghost 飞入活动区目标卡位置，真卡淡入；活动区卡片平滑下移让位，历史区平滑上收。
  - prefers-reduced-motion：两个方向均直接落位。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：双向迁移 + 受影响卡 FLIP 为核心行为 | `scripts/check.mjs#R-01-010/AC-07`、`scripts/check.mjs#R-01-010/AC-10`、`scripts/acceptance.mjs#R-01-010/AC-07`、`scripts/acceptance.mjs#R-01-010/AC-10`、`src/core.mjs::movedToActiveIds`、`src/client.mjs::runShiftAnimations` |
| 异常 | 适用：卡片渲染抛错帧不提交签名、迁移判定按上一帧已提交集合重算（既有语义不变） | `scripts/check.mjs#R-01-013/AC-02`、`src/client.mjs::pruneCards` |
| 边界配置 | 适用：reduced-motion、矩形不可量取、上一帧集合为空均直接落位 | `scripts/check.mjs#R-01-010/AC-07`、`src/client.mjs::prefersReducedMotion` |
| 副作用 | 适用：动画不阻塞渲染循环、不引入定时器；ghost/平移状态在 prune 与 dispose 时清理 | `scripts/check.mjs#R-01-010/AC-10`、`src/client.mjs::cancelShift` |
| 并发 | 适用：动画期间新渲染到达——同 id 旧 ghost 移除重判、平移中卡片以视觉矩形为起点重启 | `scripts/check.mjs#R-01-010/AC-10`、`src/client.mjs::runShiftAnimations` |

## 终态与证据

- 实现: `src/core.mjs::movedToActiveIds`（反向迁移检测纯函数）；`src/client.mjs` 迁移计划泛化 `{ id, from, to }` 双向源/目标卡池、`prevRenderedRecentIds` 记账、`snapshotShiftRects`/`runShiftAnimations`/`cancelShift` 受影响卡片 FLIP、`.dap-shift` 过渡样式；清理路径覆盖 prune/dispose/窗格重建/平移重启。
- 测试: `node scripts/check.mjs` 全绿——`movedToActiveIds` 四用例（R-01-010/AC-07），bundle 契约锚点覆盖反向接线、段头量取、FLIP 反向位移与 reflow 重启、transitionend 冒泡过滤、清理接线（R-01-010/AC-07、AC-10）；`scripts/acceptance.mjs` 补双向迁移与受影响卡片人工验收步骤。
- DESIGN 对照: DESIGN「响应保持与迁移动画」关键机制、「迁移动画并发语义」（含冒泡过滤与重建清理）、产品契约「迁移动画」、窗格渲染器「响应保持登记与迁移检测」与 DOMAIN 生命周期行均已同步双向 + 受影响卡 FLIP 语义，与实现一致；需求追溯索引 R-01-010 行落点不变。
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards / Spec）
  - 目的理解: 会话卡跨区迁移动画双向化（历史→活动补 ghost 动画）且迁移帧内所有位置受影响卡片（含历史区段头）FLIP 平滑过渡而非瞬间跳变；关联 PRD R-01-010/AC-07（改写双向）、AC-10（新增）与 DESIGN 迁移动画各段；预期 reduced-motion 直接落位、动画不阻塞渲染循环；验证方式为 check.mjs 纯函数 + bundle 契约锚点与 acceptance 人工步骤。
  - 执行方式: `code-review` skill，评审基线 `git diff main...HEAD`（fixed point=main，实现提交 64f583a），Standards 轴对照 AGENTS.md/CONVENTIONS.md + Fowler 气味基线，Spec 轴对照本任务书与 PRD/DESIGN。
  - 问题与修复: Standards 轴 0 项硬性违规（3 项弱建议属沿用仓库既有约定，不处理）；Spec 轴 2 项——①transitionend 冒泡（.dap-fill width 过渡）空耗 once 监听致平移提前收口、卡片瞬时跳到终点（违背 AC-10）→ 修复为 target+propertyName 双过滤、命中后手动移除监听（316aa5f）；②窗格重建分支未清理 shiftCleanups → 修复为重建时逐元素 cancelShift（316aa5f）。
  - 复审结论: 同一 Spec 轴审核方复审 316aa5f，两项发现均已消除、未引入新问题，复审通过。
- commit: 70eec76c72986a1323d8aba465a96f9a9547ce30
- commit: b4213af8e419f7424a294d5d54dd4d2d255563dd
（70eec76c72986a1323d8aba465a96f9a9547ce30 为实现与 map 演进，b4213af8e419f7424a294d5d54dd4d2d255563dd 为审核修复）
