---
doc-type: task
mutation: lifecycle
id: T-031
---

# T-031 母会话与子会话层级连接线

状态: active
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

待实现与验证完成后填写。
