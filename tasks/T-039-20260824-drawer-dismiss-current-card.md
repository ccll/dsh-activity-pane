---
doc-type: task
id: T-039
mutation: lifecycle
---

# T-039 二次激活当前卡片收起移动端抽屉

风险等级: standard
状态: completed

## 背景与目标

- 背景: 移动端抽屉打开时，点击当前会话对应的卡片是「死点击」——`sessions.open(currentId)` 为 no-op，抽屉保持打开且无任何反馈，用户只能另找 × 或遮罩返回会话。东家确认设计：二次激活当前会话卡片直接收起抽屉，快速回到原生会话页面（PRD R-01-008/AC-06）。
- 目标: 移动断点内抽屉打开且激活目标已是当前会话时，激活转为收起抽屉，不发起会话切换；click 与 Enter/Space 同路径；桌面形态、抽屉未打开、非当前卡片的既有行为不变。
- 非目标: 不改变非当前卡片激活后抽屉保持展开的现行行为（TODO 已另记需求候选）；不改变桌面贴边列与折叠交互；不修改 DSH 宿主。

## 差距评估

- 现状基线:
  - 卡片激活统一走 `bindCardActivation` 回调 → `attemptOpen(sessionId, 0)`；目标已是当前会话时 `shouldCancelOpenRetry` 取消重试链，`openSession` 成功后无任何可见效果。
  - 抽屉开合已有 `togglePane` 单点写入；移动断点判定已有 `window.matchMedia(max-width: 767px)` 先例（`onHeaderActivate`）。
  - 活动区与历史区卡片共用同一激活回调（`renderCardIntoList`），行为天然覆盖两区。
- 目标差距:
  - 缺「激活目标 == 当前会话 且 移动断点 且 抽屉打开」的判定与分流。
  - 分流后直接进入 `togglePane(false)`，不得进入打开重试链（避免无意义 `sessions.open` 与 `data-opening` 闪烁）。

## 收敛方案

1. `src/navigation.mjs` 新增纯函数 `shouldDismissDrawerOnActivation({ targetId, currentId, mobile, drawerOpen })`：仅当 `mobile === true && drawerOpen === true` 且 `targetId` 为非空字符串并等于 `currentId` 时返回 true；无 DOM 假设，可 Node 单测。
2. `src/client.mjs` 卡片激活回调分流：先更新 `lastActivatedId` 并取消过期打开重试链（任何新激活意图均生效，含收起分支，防止挂起链条稍后拽回会话，R-01-005），再经该纯函数判定（`currentId` 取 `getSnapshot(sessions, "list")?.current`，`mobile` 取 matchMedia 移动断点，`drawerOpen` 取窗格 `data-open`），命中则 `togglePane(false)` 并 return；未命中走既有 `attemptOpen`。
3. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 锚定 R-01-008/AC-06：命中（当前卡+移动+抽屉开）返回 true；非当前卡、桌面断点、抽屉未打开、无当前会话（currentId 为 null）均返回 false。
- `scripts/acceptance.mjs` 增加人工步骤：移动视口打开抽屉点击/键盘激活当前会话卡片收起抽屉且不切换会话；非当前卡片仍切换且抽屉行为不变；桌面宽度点击当前卡片不收起窗格。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：移动断点抽屉打开时激活当前卡收起抽屉是主路径 | `scripts/check.mjs#R-01-008/AC-06`、`src/navigation.mjs::shouldDismissDrawerOnActivation`、`src/client.mjs::togglePane` |
| 异常 | 适用：无当前会话（currentId 为 null）不得误判收起 | `scripts/check.mjs#R-01-008/AC-06`、`src/navigation.mjs::shouldDismissDrawerOnActivation` |
| 边界配置 | 适用：桌面断点与抽屉未打开两种边界不得改变既有行为 | `scripts/check.mjs#R-01-008/AC-06`、`scripts/acceptance.mjs#R-01-008/AC-06`、`src/client.mjs::MOBILE_BREAKPOINT` |
| 副作用 | 适用：非当前卡片切换路径与打开重试链不得受影响；分流不得触发 `data-opening` | `scripts/check.mjs#R-01-005/AC-01`、`scripts/check.mjs#R-01-005/AC-02`、`src/client.mjs::attemptOpen`（既有回归全量重跑） |

## 终态与证据

- 实现: `src/navigation.mjs` 新增纯函数 `shouldDismissDrawerOnActivation`（移动断点 + 抽屉打开 + 目标即当前会话才命中）；`src/client.mjs` 卡片激活回调先更新 `lastActivatedId` 并取消过期打开重试链（任何新激活意图单点作废挂起链条），命中分流则 `togglePane(false)` 收起抽屉直达会话、不发起切换，未命中走既有 `attemptOpen`；click 与 Enter/Space 同路径；活动区与历史区卡片共用同一回调天然覆盖；`.dsh-plugin/client.js` 已同步。
- 测试: `pnpm build:client && pnpm check` 通过（全部断言，含 `scripts/check.mjs#R-01-008/AC-06` 六条：命中/非当前卡/桌面断点/抽屉未打开/无当前会话/空目标 id）；`python3 tools/agentmap_lint.py --report` 通过（19 需求 / 84 AC 全部设计覆盖，测试锚定 84/84）；`git diff --check` 通过；`scripts/acceptance.mjs` 增补 AC-06 人工步骤（点击与键盘收起、非当前卡仍切换、桌面不收起、慢列表先点未就绪卡再收抽屉不被拽走的回归场景；本环境无可用真机，人工步骤未执行）。
- DESIGN 对照: DESIGN 窗格渲染器抽屉开合条目与实现一致——`shouldDismissDrawerOnActivation` 纯函数判定、命中转 `togglePane(false)`、分流前按最新激活意图取消过期重试链（R-01-005）、桌面/未打开/非当前卡维持既有行为；PRD R-01-008/AC-06 由纯函数、分流与测试锚点覆盖。
- commit: 75865b7 dc052e6（实现与审核修复两提交）
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: 移动端抽屉打开时点击当前会话卡片原为无反馈死点击，本次将其转为收起抽屉直达原生会话页面（东家确认的交互设计，R-01-008/AC-06）；约束为桌面形态、抽屉未打开、非当前卡片与 R-01-005 跳转/重试链行为不得回归，行为变化须留可执行证据。
  - 执行方式: `code-review` skill；固定基线 `84846c3`；评审范围 `git diff 84846c3...HEAD`（75865b7 实现、dc052e6 修复），Standards/Spec 两轴独立审核，修复后由同一审核方复审。
  - 问题与修复: Spec 轴 2 项 finding 经 dc052e6 修复并由原审核方复审通过；Standards 轴两轮均无硬违例。逐项明细如下：
    - [Spec/中] 分流分支在 `lastActivatedId` 更新与 `cancelStaleOpenRetries` 之前 return，先点未就绪卡再收抽屉时挂起重试链不取消、稍后会话被拽回旧目标（R-01-005 回归）→ 修复为把两行上提至分流之前单点表达，两路径共用（dc052e6）。
    - [Spec/低] DESIGN 同句顺手改写与 AC-06 无关的 touch 事件文案 → 逐字还原基线原文（dc052e6）。
    - [Standards/判断题] `shouldDismissDrawerOnActivation` 四原始参数的 Primitive Obsession → 刻意镜像既有 `shouldCancelOpenRetry` 形状且为纯函数测试边界，按「遵循现有约定 + KISS/YAGNI」抑制，不成立。
    - [Standards/判断题] 装配时序无法被纯函数 harness 断言 → 由 acceptance.mjs AC-06 慢列表回归步骤承载，属已登记锚点路径，可接受。
  - 复审结论: Spec 复审确认两项 finding 全部关闭、无新偏差；Standards 复审确认修复提交无硬违例、无新气味。双轴通过。
