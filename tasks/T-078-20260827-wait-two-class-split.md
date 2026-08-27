---
doc-type: task
mutation: lifecycle
id: T-078
---

# T-078 等待双类差异化呈现

状态: active
关联: R-01-002/AC-03、AC-04、AC-06、AC-08、AC-09、AC-10 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

C-037 落地后两类等待卡视觉几乎同构（琥珀卡面 + 标题区圆点/徽标同频脉冲），无法一眼分辨「提问等回答」（需立即响应）与「完成轮次等指示」（不必抢答）两种语义。东家重新定义契约并经确认（C-040）：紧迫度改由色彩承载——阻塞等待保持琥珀催促、完成提醒改绿色成功语义；闪烁载体统一移至卡片末行提示文字，标题圆点不再闪；完成提醒卡去掉「已完成」徽标、末行提示改为「本轮任务已完成，请给出新的指令，或将会话移入历史」、按钮文案改「移入历史」；待回复卡末行改为第一条提问的标题（header 优先，回落正文首行）；计数徽标底色动态跟随等待构成（有阻塞=琥珀，全为完成提醒=绿）。

## 差距评估

- `src/core.mjs`：`ROUND_DONE_NOTE` 为旧文案；`awaitNoteText("blocked","question",…)` 带「等待你回答：」前缀；`askQuestionPreview` 只取问题正文首行、无 header 字段；`awaitBadgeFlash("done")` 返回 true。
- `src/client.mjs`：awaiting 卡类型徽标位于标题行、相位重启目标为标题圆点；三类卡面共享琥珀 CSS；`.dap-confirm` 文案「知道了」；三处数量徽标无 tone 区分。
- `scripts/check.mjs`：R-01-002 锚点断言固化旧行为（含 header 忽略断言）。
- map 层已先行演进：PRD R-01-002 陈述与 AC 改写、R-01-010/AC-06 与 R-01-016/AC-01 措辞同步；DESIGN 等待双类呈现/徽标计数/数据流图等段落重写；DOMAIN 阻塞等待/完成提醒/确认按钮词条与不变量改写；DECISIONS 追加 C-040。

## 收敛方案

- `src/core.mjs`：
  - `askQuestionPreview` 改为 `questions[0].header` 物理首行优先，缺失回落 `question` 正文首行；
  - `ROUND_DONE_NOTE` 换新文案「本轮任务已完成，请给出新的指令，或将会话移入历史」；
  - `awaitNoteText("blocked","question")` 去前缀直出提问标题/正文首行；
  - `awaitBadgeFlash` 收窄为仅 blocked；
  - 新增纯函数 `awaitBadgeTone(entries)` → `'done'|'blocked'`（有 blocked 即 blocked，否则 done），供三处徽标共用。
- `src/client.mjs`：
  - awaiting 卡骨架把类型徽标自标题行迁入 `.dap-note-row` 行尾（提示文字 flex:1、徽标随行）；相位重启目标由标题圆点改为末行元素；
  - 完成（done）态新增绿色系卡面规则（深色静态暗绿底 + 绿描边光晕 + 状态点绿；浅色主题覆盖取 `--dsw-alias-state-success-tertiary` 别名），阻塞琥珀不动；
  - `.dap-confirm` 文案改「移入历史」；
  - 三处数量徽标按 `awaitBadgeTone` 写 tone 属性，浅色主题下两态分别复用 warn/success 别名底色。
- host.mjs 与 ack 协议零改动。
- 测试先行：先改写 check.mjs 断言为新契约失败态，再实现转绿。

## 测试计划

- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 刷新现场验证：构造待回复 / 已完成两种会话核对双色卡面、末行闪烁位置、按钮行为。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：done 卡绿色卡面与新末行文案+「移入历史」按钮；blocked 卡琥珀保留且末行为动作说明/提问标题；徽标移至末行行尾且与文字同闪；两类标题圆点静止 | `scripts/check.mjs#R-01-002/AC-08`、`scripts/check.mjs#R-01-002/AC-09`、`scripts/acceptance.mjs#R-01-002/AC-08`、`src/client.mjs::cardChildren` |
| 异常 | 适用：提问无 header 回落正文首行、均不可得回落动作说明；未知阻塞种类中性兜底不变 | `scripts/check.mjs#R-01-002/AC-09`、`src/core.mjs::askQuestionPreview` |
| 边界配置 | 适用：全 done 构成时计数徽标绿底、含任一 blocked 时琥珀底；无等待不脉冲不变 | `scripts/check.mjs#R-01-002/AC-06`、`src/core.mjs::awaitBadgeTone` |
| 副作用 | 适用：ack 写回、跨端同步、FLIP 迁移动画不受影响；签名去重对 noteText/waitClass 已覆盖 | `scripts/check.mjs#R-01-002/AC-10`、`scripts/check.mjs#R-01-002/AC-11`、`src/host.mjs::apply` |

## 终态与证据

（关闭时填写）
