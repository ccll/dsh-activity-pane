---
doc-type: task
mutation: lifecycle
id: T-078
---

# T-078 等待双类差异化呈现

状态: completed
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
  - 删除 `awaitBadgeFlash` 与 `ROUND_DONE_LABEL`（done 无徽标文案、闪烁改纯 CSS 属性驱动）；
  - 新增纯函数 `awaitBadgeTone(entries)` → `'done'|'blocked'|null`（有 blocked 即 blocked，否则 done），供三处计数徽标共用。
- `src/client.mjs`：
  - awaiting 卡骨架把类型徽标自标题行迁入 `.dap-note-row` 行尾（提示文字 flex:1、徽标随行）；闪烁由 `data-wait` 属性驱动的 CSS 规则承载，原地跨类转换（done↔blocked）时渲染层检测属性变化将末行文字与徽标动画一并同步重启；
  - 完成（done）态新增绿色系卡面规则（深色静态暗绿底 + 绿描边光晕 + 状态点绿光晕；浅色主题覆盖取 `--dsw-alias-state-success-tertiary` 别名），阻塞琥珀不动；两类状态点静止不闪、着色同强度仅换色相；
  - `.dap-confirm` 文案改「移入历史」；done 卡 aria 追加 noteText 播报（补回删除「已完成」徽标后的状态可访问性），blocked 卡 aria 维持 pendingText 口径不变；
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

- 实现: `src/core.mjs`——`askQuestionPreview` 取首问 header 优先、回落正文物理首行；`ROUND_DONE_NOTE` 新引导文案；`awaitNoteText("blocked","question")` 去前缀直出；删除 `awaitBadgeFlash` 与 `ROUND_DONE_LABEL`；新增 `awaitBadgeTone` 纯函数（有 blocked 即 blocked，全 done 则 done）。`src/client.mjs`——类型徽标自标题行迁入 `.dap-note-row` 行尾；双类卡面 CSS（深色琥珀/暗绿静态值、浅色 warn/success 别名覆盖），状态点两类静止且着色/光晕同强度仅换色相；末行脉冲由 data-wait 属性驱动，原地跨类转换时渲染层同步重启 note+badge 动画对齐相位；「移入历史」按钮文案与条件呈现（done 独有）；三处计数徽标 data-tone 跟随等待构成；done 卡 aria 追加 noteText 播报。host.mjs 与 ack 协议零改动。
- 测试: 测试先行（先红后绿）；`scripts/check.mjs` R-01-002 锚点按新契约重写并新增 awaitBadgeTone/双类卡面/末行闪烁/跨类重启锚点，`scripts/acceptance.mjs` 人工条目全部同步并补原地翻转验收点；三轮 `pnpm build:client && pnpm check` 全绿；`agentmap_lint passed`（22/22 需求、127/127 验收点锚定）；`git diff --check` 干净。GUI 目验项（双色卡面、末行同闪、「移入历史」行为）由东家现场验收。
- DESIGN 对照: DESIGN 产品契约「等待双类呈现」（C-040 版：双色语义、末行脉冲载体、data-wait 驱动 + 跨类转换一次性同步重启）、核心数据不变量「等待优先」、徽标计数段与实现一致；DOMAIN 阻塞等待/完成提醒/确认按钮词条已改写互洽；复审修复后无 DESIGN-实现偏差。
- commit: 07012fab24ad66c008c46da8c833e3e86a70818d
- commit: 8dd67c49e0a5e5caa6a50bd238fa0ff3fd88e591
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴 401a244d、Spec 轴 b89a72ba）
  - 目的理解: 两轴 reviewer 均先读取 PRD R-01-002（演进后）、DECISIONS C-040、DESIGN 等待双类呈现契约、DOMAIN 词条与本任务文件，明确被审代码目的为「把两类等待语义以色彩（琥珀催促/绿色成功）区分、闪烁载体移至卡片末行、完成提醒改新引导文案与『移入历史』按钮、计数徽标底色跟随等待构成」，预期行为与验证方式（check.mjs 锚点断言、acceptance 人工条目）记录于各自首轮报告。
  - 执行方式: `code-review` skill 双轴并行子代理审核，评审基线 a358f39f1779ae5e07b18024351697812a2e5707，范围为 07012fab24ad66c008c46da8c833e3e86a70818d + 8dd67c49e0a5e5caa6a50bd238fa0ff3fd88e591 全量 diff；两轮提交由同一审核方分别复审。
  - 问题与修复: Standards 轴首轮 1 项硬违规（DESIGN 残留旧相位重启描述与实现对冲——8dd67c49e0a5e5caa6a50bd238fa0ff3fd88e591 改写为实际机制）+ 3 项判断项（T-078 收敛方案与实际不符——已同步；PRD AC-08 悬空措辞——已重写；core JSDoc 过时——已同步）；Spec 轴首轮 1 项实现缺口（原地 done↔blocked 转换时徽标经 display 切换归零而提示文字中程续跑致永久失相——8dd67c49e0a5e5caa6a50bd238fa0ff3fd88e591 实现跨类转换时 note/badge 动画一并同步重启并补 check 锚点）+ 2 项范围蔓延判断（aria noteText 全 awaiting 追加——收窄为仅 done 播报；done 状态点缺光晕——补齐与琥珀侧同强度仅换色相）；复审遗留弱建议 2 条（DESIGN 超长句拆子列表、acceptance 补原地翻转验收点——均已在关闭提交落掉）。复审结论均无新增问题。
  - 复审结论: 双轴复审均通过，四项 Standards findings 与三项 Spec findings 全部闭环。
