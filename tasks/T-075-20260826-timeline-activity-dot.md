---
doc-type: task
mutation: lifecycle
id: T-075
---

# T-075 时间线当前活动末行与平滑圆点修复

状态: completed
关联: R-01-009/AC-09、AC-10、AC-11，R-01-012/AC-02、AC-12～AC-15，R-01-017/AC-06 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家实测发现运行卡时间线的当前活动消息可能消失，节点圆点近看由平滑正圆退化为八边形。只读查证确认两条根因链：C-023 的锚行预算以数组末三行盲裁剪，1822e9cd4f0ad021f50957d50630ab97b796019c 又在核心派生后由 client 以 history 锚行二次裁剪，真实 running 行位于四工作行首位时会被旧尾行冒充或连同蓝闪状态一起删除；84846c3 为跨 DPR 同心改成 7px 承载盒内 2.5px 硬停色 radial-gradient，实心核绕过原生圆角抗锯齿。东家已确认总计最多四行、首行指令、其后最近最多三工作行且真实当前活动必须在末行，并授权在独立 worktree 实施后合并主干。

## 差距评估

- `src/core.mjs`：`selectTimelineRows` 只按位置裁剪，`promoteRunningTail` 只改旧尾状态；live 身份不穿透折叠层，无法为真实当前活动保留名额。
- `src/client.mjs`：`withInstructionAnchor` 在 `foldedConversationTimeline` 完成后再次裁剪，且没有后续活动补偿。
- `src/client.mjs` CSS：7px 同盒内以 2.5px 硬停色 radial-gradient 绘制 5px 核心，最终轮廓阶梯化。
- `scripts/check.mjs`：锚行测试全部使用 done 行，未断言真实活动身份/文字/末行状态；圆点测试反向固化硬停色 gradient。
- `scripts/acceptance.mjs`：未要求 history 锚行下真实活动仍为末行，未要求 DPR 放大后圆点轮廓平滑。

## 收敛方案

- AgentMap：以 C-035 修订 C-023，工作行选择先保真实 live 当前活动并置末行，history 锚行并入核心单次选择；以 C-036 保留 7px 同盒但恢复实体圆角裁剪。
- `src/core.mjs`：为 partial/running call 增加内部 live 身份并穿透折叠组；`selectTimelineRows` 统一分配锚行、历史工作行与当前活动名额；`foldedConversationTimeline` 接收 history fallback anchor；只有不存在真实当前活动时才执行尾部提升。
- `src/client.mjs`：调用核心派生时传入 history anchor，删除 `withInstructionAnchor` 后置裁剪；圆点改为实体 background + border-radius + 1px border/background-clip，保留同盒圆心、外环、光晕与 pulse。
- 测试先行：先补真实 running 位于四工作行首位、history fallback、活动文字身份、等待态、多个 live 项与圆点 CSS 契约，再实现转绿。

## 测试计划

- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 通过现有 DSH Web 现场验证活动末行身份、蓝闪状态、DPR 1/1.25/1.5/2 放大圆度与圆心对齐。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。
- 集成前同步最新 canonical main；若 provisional T-ID 冲突，按并发规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：锚行 + 最近工作行总计不超过四，真实当前活动身份/文字/status 保留并位于末行 | `scripts/check.mjs#R-01-009/AC-11`、`scripts/check.mjs#R-01-012/AC-12`、`src/core.mjs::foldedConversationTimeline` |
| 异常 | 适用：history fallback 不吞 running；等待/pending 不提升；错误/停止/用户尾行不冒充活动 | `scripts/check.mjs#R-01-009/AC-10`、`scripts/check.mjs#R-01-009/AC-11`、`src/core.mjs::selectTimelineRows`、`src/core.mjs::promoteRunningTail` |
| 边界配置 | 适用：无锚最多四工作行、有锚最多三工作行；多个 live 项取最新当前活动；工作项不足时全部展示 | `scripts/check.mjs#R-01-012/AC-02`、`scripts/check.mjs#R-01-017/AC-06`、`src/core.mjs::selectTimelineRows` |
| 副作用 | 适用：折叠标题/摘要、DOM keyed 身份、竖线圆心与 pulse 保持；等待卡时间线不误蓝闪 | `scripts/check.mjs#R-01-017`、`scripts/check.mjs#R-01-016`、`src/core.mjs::foldWorkGroups`、`src/client.mjs::renderTrace` |
| 兼容性 | 适用：保留 7px 同盒与 x=3.5 圆心，不回退跨 DPR 对齐；去除硬停色 gradient | `scripts/check.mjs#R-01-009/AC-09`、`scripts/acceptance.mjs#R-01-009/AC-09`、`src/client.mjs::CSS` |

## 终态与证据

- 实现: `src/core.mjs` 为 partial/running call 记录并穿透 live 身份，`selectTimelineRows` 单点分配指令锚行、最近历史工作行与最新当前活动末行；`src/client.mjs` 将 history anchor 作为核心输入并移除后置裁剪，时间线圆点改为 7px border-box 内的实体背景、1px border、`border-radius: 50%` 与 `background-clip: padding-box`；`.dsh-plugin/client.js` 已重建。
- 测试: `pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过（requirements=22、acceptance-criteria=127、test-anchored=127）；`git diff --check` 通过；`node scripts/acceptance.mjs` 可生成完整 92 项验收清单。Chrome CDP 在 DPR 1/1.25/1.5/2 的独立光栅夹具中确认原生圆角边缘存在连续混合像素且 10× 放大无硬停色八边形；合入实现并刷新现有 `http://127.0.0.1:3080/` 后，目标活动卡实测恰为 4 行，首行为用户指令，末行为真实 `running` 调用文字，蓝点计算样式为 7×7 border-box、`background-image: none`、`border-radius: 50%`、`animation-name: dap-pulse`。
- DESIGN 对照: `DESIGN.md` 的工作项时间线呈现与折叠时间线均已收敛到 C-035 的单次名额选择与真实活动末行不变量；圆点呈现收敛到 C-036 的同盒实体圆角裁剪，未新增独立 DOM core，跨 DPR 圆心几何保持不变。
- commit: f46965baa5704f33efdfa768cfed9a1a846df251
- review:
  - 审核方: Standards reviewer `21c978a8-fe56-48a2-9127-376e19cb8b8b`；Spec reviewer `3dac37f1-8194-4454-87fa-a57276b64d0a`
  - 目的理解: 在总行数不超过 4 的契约内固定首行指令，保留最新真实当前活动的身份、文字与 `running` 状态并置于末行，仅无真实活动时提升旧尾；保留 7px 同盒圆心并以原生圆角恢复 5px 视觉核的平滑正圆。
  - 执行方式: 调用 `code-review` skill，Standards/Spec 双轴并行审核；初始固定范围 `0292fed562b7ef0794d8677fde1592884d113d64...f6b2afd`，canonical main 前进后对最终 `dc4c87823798bfceada84430dddaa782f593d2a9...f46965baa5704f33efdfa768cfed9a1a846df251` 及 C-ID 冲突消解再次复审。
  - 问题与修复: Standards 无 finding；Spec 初审指出缺少多个 live 项选择最新活动的回归测试，随后在 `scripts/check.mjs` 增加 partial + runningCalls 共存用例，断言 live 身份穿透、四行预算及最新 live 分组 id/summary/status 位于末行；同一 Spec reviewer 复审确认 finding 关闭。rebase 时 canonical C-034 已被占用，本任务决策顺延为 C-035/C-036并同步全部引用，两名 reviewer 再次确认无问题。
  - 复审结论: 两轴最终通过；无未解决 hard violation、smell、Spec 缺失、scope creep 或逻辑错误。
