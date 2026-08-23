---
doc-type: task
mutation: lifecycle
id: T-031
---

# T-031 母会话与子会话层级连接线

状态: completed
关联: R-01-003/AC-01、R-01-003/AC-04 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

TODO 中提出：仅靠缩进不足以直观表达母会话与子会话的层级关系，需要在活动区卡片之间增加连接线。

目标：

- 保留现有 `depth` 缩进与卡片顺序。
- 在子代理卡片的缩进槽内绘制母会话到直属子代理的竖线与横向接入线。
- 多个同级子代理之间保持连续轨道，末级节点在自身中心收口。
- 连接线不覆盖卡片内容，不改变点击、键盘激活与卡片布局宽度。

## 差距评估

- `src/core.mjs` 活动条目只有 `depth`，渲染层无法稳定识别直属母会话来处理同级末节点。
- `src/client.mjs` 当前仅以 `marginLeft` 表达层级，没有连接线样式或层级关系标记。
- `scripts/check.mjs` 与 `scripts/acceptance.mjs` 尚无 R-01-003/AC-04 的执行证据。
- TODO 条目尚未迁移为当前需求与 task。

## 收敛方案

- `src/core.mjs`：活动条目保留 `parentId`，并将其纳入 `cardSignature`，确保层级归属变化会触发重绘。
- `src/client.mjs`：
  - 以 `data-connector` 标记子代理卡片；
  - 用卡片 `::before` 绘制缩进槽竖线，用 `::after` 绘制接入母会话的横线；
  - 根据后续 preorder 条目中的 `depth` 与 `parentId` 判断同级末节点，跨过孙级节点保持母会话的同级轨道连续；
  - 伪元素设置 `pointer-events: none`，不进入卡片内容与交互区域。
- `scripts/check.mjs`：新增 R-01-003/AC-04 bundle 契约断言与 `parentId` 纯数据断言。
- `scripts/acceptance.mjs`：新增母子会话、多级层级与交互不回归的 GUI 人工验收步骤。
- 同步 PRD、DESIGN、DOMAIN，移除已迁移的 TODO 条目；不新增依赖。

## 测试计划

- `node scripts/check.mjs`：核心条目归属、bundle 合法性、连接线 CSS/DOM 契约。
- `pnpm build:client && pnpm check`：生成并校验 `.dsh-plugin/client.js`。
- `python3 tools/agentmap_lint.py --report`：校验 PRD/DESIGN/DOMAIN、task 与 strict 测试追溯。
- `git diff --check`：检查空白错误。
- `node scripts/acceptance.mjs`：确认人工验收清单包含 R-01-003/AC-04。
- 独立 `code-review` skill：Standards/Spec 双轴审核并在修复后复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：直属子代理卡片显示与缩进对齐的连接线，同级轨道连续、末级收口 | `scripts/check.mjs#R-01-003/AC-04`、`src/client.mjs::CSS`、`scripts/acceptance.mjs#R-01-003/AC-04` |
| 异常 | 适用：无子代理时不产生连接线；子代理归属缺失时不误标连接线；空态不受影响 | `scripts/check.mjs#R-01-003/AC-01`、`src/core.mjs::buildEntries`、`src/client.mjs::renderCardIntoList` |
| 边界配置 | 适用：多级子代理、多个同级子代理、末级节点与卡片复用 | `scripts/check.mjs#R-01-003/AC-04`、`src/core.mjs::isLastChildEntry`、`scripts/acceptance.mjs#R-01-003/AC-04` |
| 副作用 | 适用：连接线不覆盖内容、不改变卡片点击/键盘激活和既有布局；重绘签名随归属变化更新 | `scripts/check.mjs#R-01-005/AC-01`、`scripts/check.mjs#R-02-003/AC-01`、`src/core.mjs::cardSignature` |

## 终态与证据

- 实现: `src/core.mjs` 活动条目保留 `parentId`，`isLastChildEntry` 按 preorder 后续条目的深度与直属归属判断末级；`src/client.mjs` 以 `data-connector`/`data-last-child` 和 CSS 伪元素绘制缩进槽竖线、卡片中心横线，连接线不拦截交互；同步 `.dsh-plugin/client.js`、PRD/DESIGN/DOMAIN、测试与人工验收清单。
- 测试: `pnpm build:client && pnpm check` 通过；`node scripts/check.mjs` 覆盖唯一子代理、P→A→G→B 多级同级轨道、几何 CSS 契约与 `parentId` 归属；`python3 tools/agentmap_lint.py --report` 通过（18 需求 / 73 AC / 73 测试锚点）；`git diff --check` 通过；`scripts/acceptance.mjs` 已加入 R-01-003/AC-04 GUI 步骤；`curl http://127.0.0.1:3080/` 返回 HTTP 200。真实页面视觉与键盘/点击回归仍需按该人工步骤验收。
- DESIGN 对照: PRD R-01-003 新增 AC-04；DESIGN 的活动条目结构、`isLastChildEntry` preorder 末级判断、窗格渲染器连接线契约与实现位置已同步；DOMAIN 新增母会话/层级连接线术语与跨模块不变量；R-01-003 追溯行保持准确。
- commit: b2a7739
- review:
  - 审核方: Standards 子代理 `bf12c9d1-edbe-430c-a48d-9b5470746450`；Spec 子代理 `a0a2712e-d15a-45df-aea4-8ffdbfc958f0`。
  - 目的理解: T-031 实现 R-01-003/AC-04，在保持 `depth` 缩进、卡片点击/键盘激活和布局宽度不变的前提下，用连接线表达母会话与直属子会话层级，并支持多级树同级轨道连续。
  - 执行方式: `code-review` skill；固定基线 `0c827b7`，范围为 `git diff 0c827b7...HEAD` 及 T-031 工作单元；Standards/Spec 双轴初审，修复后由同一审核方复审。
  - 问题与修复: Spec 初审发现 `isLastChildEntry` 只看下一条 entry 会误判 P→A→G→B 中 A 为末级；改为扫描后续 preorder，跨过 descendants，仅遇到同深度同 `parentId` sibling 才保持轨道，并新增可执行断言。复审未发现确定性实现问题；几何精确位置和真实交互属于现有 GUI 人工验收边界，已补 CSS 契约与验收步骤。
  - 复审结论: Standards 通过；Spec 通过，无遗留确定性 finding。
