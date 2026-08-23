---
doc-type: task
mutation: lifecycle
id: T-032
---

# T-032 活动祖先显示与连接线间隙均匀化

状态: active
关联: R-01-003/AC-04、R-01-003/AC-05 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家实际查看连接线后反馈两项问题：

- 相邻子会话之间的卡片间隙中，连接线段发生重叠，视觉上比前后段更亮或更粗。
- 母会话自身停止活动时，活动区只剩活动子会话，层级上下文断裂；只要存在活动后代，母会话也应在活动区显示。

目标：

- 连接线在卡片间隙中保持单一、均匀的 1px 视觉强度。
- 活动会话的所有有效母会话沿 `parentId` 链出现在活动区。
- 自身非活动但因活动后代显示的条目作为 `parent` 活动层级上下文，不伪装为运行中或等待行动，不建立轮内订阅。
- 活动层级上下文不进入最近历史区，子代理结束且无其它活动后代时随渲染移除。

## 差距评估

- `src/client.mjs` 连接线非末级 `::before` 使用 `bottom: -6px`，相邻卡片的两段线在 6px 间隙内重叠。
- `src/core.mjs` 的活动显示判定只检查会话自身状态，未将活动子代理的祖先补入活动区。
- `buildRecent` 若继续使用自身状态判定，会把活动祖先错误派生到历史区，违反分区不变量。
- 卡片骨架仅覆盖 `running`、`awaiting`、`subagent`、`recent`，缺少不带自身轮内状态的 `parent` 上下文形态。

## 收敛方案

- `src/client.mjs`：非末级连接线从 `bottom: -6px` 改为 `bottom: 0`，让相邻段端点相接而不重叠；新增 `parent` 卡片的中性骨架/样式，且连接线标记覆盖 `subagent` 与 `parent`。
- `src/core.mjs`：新增 `activeSessionIds`，从自身活动会话沿有效 `parentId` 链补齐活动祖先；`buildEntries` 用自身活动状态区分普通卡片与 `parent` 上下文；`buildRecent` 复用同一活动祖先集合排除历史卡；`isLastChildEntry` 支持 `parent` 层级条目；`shouldSubscribeToSession` 明确排除 `parent` 上下文并保留运行子代理订阅。
- `scripts/check.mjs`：覆盖祖先补齐、活动祖先不入历史、`parent` 不建立运行订阅所需的条目语义，以及连接线不重叠的 CSS 契约。
- `scripts/acceptance.mjs`：增加母会话自身非活动而子会话活动时母卡仍显示的 GUI 步骤。
- 同步 PRD、DESIGN、DOMAIN；不新增依赖。

## 测试计划

- `node scripts/check.mjs`：活动祖先谱系、历史区排除、parent 条目、parent/运行子代理订阅判定与连接线几何契约。
- `pnpm build:client && pnpm check`：生成并校验 `.dsh-plugin/client.js`。
- `python3 tools/agentmap_lint.py --report`：校验 R-01-003/AC-05 的追溯与 task 矩阵。
- `git diff --check`：检查空白错误。
- `node scripts/acceptance.mjs`：确认新增活动祖先 GUI 验收步骤。
- 独立 `code-review` skill：Standards/Spec 双轴审核并在修复后复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：活动子代理存在时所有有效母会话显示为 `parent` 上下文；连接线间隙保持均匀 | `scripts/check.mjs#R-01-003/AC-05`、`src/core.mjs::activeSessionIds`、`src/client.mjs::CSS` |
| 异常 | 适用：无活动后代的非活动母会话不显示；活动祖先不进入最近历史；无效 parentId 不补祖先 | `scripts/check.mjs#R-01-003/AC-05`、`src/core.mjs::buildEntries`、`src/core.mjs::buildRecent` |
| 边界配置 | 适用：多级祖先、父级自身已活动、父级非活动、无效 parentId 关系、相邻同级子会话 | `scripts/check.mjs#R-01-003/AC-05`、`src/core.mjs::activeSessionIds` |
| 副作用 | 适用：parent 上下文不建立轮内订阅、不伪装运行态；连接线不改变卡片交互与宽度 | `scripts/check.mjs#R-01-003/AC-05`、`src/core.mjs::shouldSubscribeToSession`、`src/client.mjs::renderCardIntoList`、`src/client.mjs::syncLiveness` |

## 终态与证据

待实现与验证完成后填写。
