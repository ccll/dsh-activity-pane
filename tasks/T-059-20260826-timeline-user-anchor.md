---
doc-type: task
mutation: lifecycle
id: T-059
---

# T-059 时间线指令锚行与用户行下划线收窄改实线

状态: completed
关联: R-01-012 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家使用反馈两点：

1. 时间线用户消息行的下划线贯穿整行——消息较短时右侧大片空白也带线；且虚线观感偏碎。要求：只覆盖图标和文字的宽度，并改为实线。
2. 时间线只显示最近 4 个显示行，本轮指令被新动作挤出窗口后，活动卡失去「正在做什么」的语境。要求：时间线最上面固定显示该轮之前最近的用户消息内容，不随新行动上移/挤出。

经东家三项选择确认：锚行内容=本轮指令（窗口之前最近一条用户输入行）；形态=钉为时间线首行（从滚动行中提取，下方照旧最多 4 行）；去重=挤出后才出现（仍在窗口内时不单独显示）。

map 演进同次完成并经东家确认：PRD R-01-012 新增 AC-12/AC-13/AC-14；DOMAIN 登记「指令锚行」术语与不变量；DESIGN 三处同步（需求追溯索引落点、折叠时间线模块派生规则、用户行标识条目改实线+内容宽度）；DECISIONS 追加 C-022（含被否方案：复活槽位/sticky 吸顶/下方缩 3 行/始终显示）；TODO 移除已升级的「常驻显示用户最新消息」需求候选。

## 差距评估

- `src/core.mjs`：`foldedConversationTimeline` 尚无锚行派生；`rawTailItems` 取够条数即停，找不到窗口前的用户节点。
- `src/client.mjs`：`.dap-trace-item[data-icon="user"] .dap-trace-main` 下划线为整行宽 `repeating-linear-gradient` 虚线（深浅两处）。
- `scripts/check.mjs`：虚线下划线 bundle 断言需替换；无锚行单测。
- `scripts/acceptance.mjs`：R-01-012/AC-05 验收点为虚线口径；无 AC-12～AC-14 验收点。

## 收敛方案

单提交收敛：实现（src/core.mjs + src/client.mjs CSS + 重建 `.dsh-plugin/client.js`）+ 测试（check.mjs、acceptance.mjs）+ map（PRD/DOMAIN/DESIGN/DECISIONS/TODO）同次入库。

实现要点：

- `rawTailItems(snapshot, want, cwd, continueToUser)`：取够 `want` 个可转换项后，以廉价 kind 检查（不逐节点转换分配）继续前走至最近一个未收集的用户节点（kind=user/steering、非 hidden、有文本），命中才转换并入队首；order 耗尽即止。`conversationWorkItems` 不启用该阶段（行为不变）。
- `foldedConversationTimeline`：折叠后取窗口起点之前最近一条 kind=user 行标记 `anchor: true` 前置返回；无则不前置。渲染层零改动——锚行就是带标记的普通用户行，复用现有 DOM 复用（traceKey）、图标、下划线与圆点/竖线几何。
- client CSS：深色主题 `linear-gradient(rgba(139, 152, 165, .55), rgba(139, 152, 165, .55))` 实线 + `width: fit-content; max-width: 100%`；浅色主题覆盖块同改实线（alias 变量色）。保留背景渐变绘制方式（不占盒高、不破坏 14px 行高几何）。

## 测试计划

- `pnpm build:client && pnpm check` 全绿：新增锚行单测（挤出出现且内容正确、窗口内不出现、长回合 ×3 扩窗不足时前走命中、steering 归一、hidden 排除、无前驱不出现、既有用例回归）；bundle 断言替换（实线渐变 + fit-content 正向、整行虚线渐变反向）。
- `python3 tools/agentmap_lint.py --report` 追溯完整（21 需求 / 106 AC 全锚定）。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 人工核验（下划线实线与宽度、锚行出现时机、深浅主题）。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：指令移出窗口后锚行出现在时间线首行，图标/标签/文字/下划线与普通用户行一致 | `scripts/check.mjs#R-01-012/AC-12`、`src/core.mjs::foldedConversationTimeline` |
| 异常 | 适用：会话无窗口前用户输入行时不出锚行；hidden 用户节点不入锚 | `scripts/check.mjs#R-01-012/AC-12`（负向用例）、`src/core.mjs::rawTailItems` |
| 边界配置 | 适用：steering 消息按用户行归一入锚；锚行不占 4 行窗口名额（窗口仍为最近 4 显示行）；`conversationWorkItems` 不受前走阶段影响 | `scripts/check.mjs#R-01-012/AC-12`、`scripts/check.mjs#R-01-017/AC-06`、`src/core.mjs::rawTailItems` |
| 副作用 | 适用：下划线不再贯穿整行且无虚线残留；14px 行高几何不变（背景绘制不占盒高）；渲染层 DOM 复用路径未改，锚行出现/消失仅触发容器重建一次 | `scripts/check.mjs#R-01-012/AC-05`、`src/client.mjs::.dap-trace-item[data-icon="user"]`、`src/client.mjs::renderTrace` |
| 性能 | 适用：找锚只做廉价结构检查前走至最近用户节点，不做全序转换，不回归 T-017 尾部窗口约束 | `scripts/check.mjs#R-01-012/AC-12`（×3 扩窗不足用例）、`src/core.mjs::rawTailItems` |

## 终态与证据

- 实现: `src/core.mjs`（`rawTailItems` 新增 continueToUser 前走段——`isUserChatNode` 廉价结构检查（非 hidden 的 user/steering 且含非空文本块）命中且转换成功才并入队首、分叉时继续前走；`chatNodeAt` 提取共用；`foldedConversationTimeline` 在窗口起点之前反向扫描最近一条非空文本用户行标记 `anchor: true` 前置返回）；`src/client.mjs`（用户行下划线改 1px 实线渐变 + `width: fit-content; max-width: 100%`，深浅主题同步）；`.dsh-plugin/client.js` 同步重建；`scripts/check.mjs`（锚行单测族：挤出出现/窗口内不出现/AC-14 取代切换/×3 扩窗不足前走命中/steering 归一/hidden 排除/空文本不作锚 + bundle 断言替换为实线与 fit-content 正向、整行虚线反向）；`scripts/acceptance.mjs`（AC-05 人工点改实线内容宽口径、新增 AC-12～AC-14 人工点）；PRD（AC-12～AC-14）/DOMAIN（指令锚行术语+不变量、模型上下文词条恢复）/DESIGN（索引落点、折叠时间线条目、用户行标识条目）/DECISIONS（C-022）/TODO（候选升级迁出）同次演进。评审修复：DOMAIN 模型上下文词条恢复、AC-14 取代分支补测、有文本口径三处同口径落实与前走防提前终止、chatNodeAt 重复声明消除、rawTailItems 注释与 DOMAIN 措辞对齐「廉价结构检查/非空文本」。
- 测试: `node scripts/build-client.mjs && node scripts/check.mjs` 全绿；`python3 tools/agentmap_lint.py --report` 通过（21 需求 / 108 AC 全锚定、R-01-012/AC-12～AC-14 已锚定）；pre-commit 门禁（agentmap lint + 重建重检）通过。GUI 人工验收点见 `scripts/acceptance.mjs`（下划线实线与内容宽度、锚行出现/切换/不重复，深浅主题各验），由东家按单核验。
- DESIGN 对照: 折叠时间线条目（非空文本锚行派生、廉价结构检查前走、渲染层零分支）、用户行标识条目（实线、fit-content 内容宽、背景渐变不占盒高）、需求追溯索引 R-01-012 落点含指令锚行，与实现逐项一致；DOMAIN「指令锚行」术语与不变量同口径。
- commit: 6945908fb0eae61cb55e0e773bba02232aed7f60
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴、Spec 轴）
  - 目的理解: T-059 交付两点——时间线用户消息行下划线改为实线且仅覆盖图标+文字内容宽度（修订 C-019 整行虚线呈现）；新增指令锚行——窗口之前最近的非空文本用户输入行移出窗口后固定钉在时间线首行（不随新行动上移/挤出、不占 4 行名额、窗口内不重复），关联 PRD R-01-012/AC-12～AC-14、DESIGN 折叠时间线模块与用户行标识条目、DOMAIN 指令锚行、C-022；验证方式为 check.mjs 锚点 + agentmap lint + acceptance.mjs 人工验收。
  - 执行方式: `code-review` skill，评审基线 a2a6a666916de99a6982af0be4835c8aa1d5049d（实现提交 6945908fb0eae61cb55e0e773bba02232aed7f60，含修复后两轮 amend），范围为 map 五文档/src/scripts/bundle/task 全量变更；Standards 对照 AGENTS/CONVENTIONS 与 Fowler 味道基线，Spec 对照 T-059 收敛方案与 PRD/DESIGN/DOMAIN/DECISIONS 演进原文。
  - 问题与修复: Standards 轴——DOMAIN 术语表误删「模型上下文」词条（已恢复为独立保留行，指令锚行独立新增；复审核验全仓引用有定义可依）；两项判断题（廉价谓词与转换构造的轻微形状重复、anchor 内部标记断言）经裁量维持现状，复审接受。Spec 轴——AC-14「被更近用户行取代」分支缺测试锚点（已补取代切换用例）；「有文本」口径未落实（isUserChatNode 增加非空文本块检查、前走循环改为转换成功才 break、前缀扫描同口径、DESIGN/DOMAIN 同步措辞、新增空文本负向用例）。修复过程中自伤的 chatNodeAt 重复声明（SyntaxError）已消除并由复审核验 src 与 bundle 各仅一份。
  - 复审结论: Standards 轴复审通过、Spec 轴复审通过（两轴修复逐项核对，无新问题）。
