---
doc-type: task
id: T-039
mutation: lifecycle
---

# T-039 二次激活当前卡片收起移动端抽屉

风险等级: standard
状态: active

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

（待关闭时填写）
