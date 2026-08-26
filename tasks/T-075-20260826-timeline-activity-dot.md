---
doc-type: task
mutation: lifecycle
id: T-075
---

# T-075 时间线当前活动末行与平滑圆点修复

状态: active
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
