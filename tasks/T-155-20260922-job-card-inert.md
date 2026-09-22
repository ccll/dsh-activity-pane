---
doc-type: task
mutation: lifecycle
id: T-155
---

# T-155 撤销 job 子卡激活跳转，后台任务子卡改为纯展示

状态: completed
关联: R-01-005/AC-03（删除）、R-01-023/AC-08（新增）、R-01-023/AC-07（措辞收敛）
风险等级: standard

## 背景与目标

- 背景: T-154 将 job 子卡激活语义从「卡内展开输出」改为「跳转归属会话」（R-01-005/AC-03）；东家实际使用后反馈跳转体验不好，确认（2026-09-22）再删除该跳转——点击后台任务子卡不触发任何操作，子卡为纯展示。
- 目标: 删除 R-01-005/AC-03；以 R-01-023/AC-08 显式承载「激活后台任务子卡不发生会话切换」；代码与测试同次收敛。

## 差距评估

- 现状：job 子卡经 `navigation.mjs#activationTarget` 解析归属会话 id 后走通用跳转链；子卡带 `role="button"`、可键盘聚焦、`cursor: pointer` 与悬停高亮呈现可点形态。
- 目标：job 子卡不绑激活监听、不进入 tab 序、默认光标且无悬停/聚焦反馈；`activationTarget` 与卡上 `data-job-owner` 失去消费方，随之删除。

## 收敛方案

1. PRD：删除 R-01-005/AC-03；R-01-023/AC-07 去掉「不改变子卡的激活交互」尾句；新增 R-01-023/AC-08（激活后台任务子卡保持当前会话与窗格状态不变）。
2. SOLUTION：R-01-005 追溯行与窗格渲染器代码位置回退 `src/navigation.mjs` 增补；产品契约、活动状态模型关键结构与窗格渲染器条目中的激活跳转语义改为纯展示（R-01-023/AC-08）。
3. 代码：`src/client.mjs` job 子卡不调 `bindCardActivation`、不设 `role="button"`/`tabIndex`，CSS 默认光标并抑制悬停高亮（明暗两主题），删除 `dataset.jobOwner` 赋值；`src/navigation.mjs` 删除 `activationTarget`。
4. 测试：check.mjs 删除 `activationTarget` 单测与 bundle 断言，新增「job 子卡不绑激活」bundle 契约（锚 R-01-023/AC-08）；e2e background-jobs 把跳转断言反转为「点击后主会话保持不变」；acceptance.mjs 人工步骤同步。

## 测试计划

- `pnpm verify:fast`；`pnpm verify` 全量（重点 background-jobs spec）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-005/AC-03 | 删除 AC | E2E/UNIT | remove | 跳转行为撤销：check.mjs `activationTarget` 单测与 bundle 断言移除；e2e 跳转断言移除 |
| R-01-023/AC-08 | 新增 AC | E2E/UNIT | add | check.mjs bundle 契约（job 子卡不绑激活）；e2e background-jobs 浏览器断言（点击 job 子卡后主会话保持不变）；acceptance.mjs 人工步骤 |
| R-01-023/AC-07 | 措辞收敛（去掉「不改变子卡的激活交互」尾句），可判定语义不变 | none | none | 措辞澄清，卡面底色区分语义与既有 E2E 不变 |
| SOLUTION | 激活跳转语义改写为纯展示；R-01-005 追溯行与窗格渲染器代码位置回退 | UNIT | update | `python3 tools/agentmap_lint.py --report` 全通过 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：点击 job 子卡不切换会话，其余卡片激活跳转不受影响 | `e2e/specs/background-jobs.mjs#R-01-023/AC-08`、`e2e/specs/navigation.mjs#R-01-005/AC-01`、`package.json::verify` |
| 异常 | 适用：job 子卡不绑激活监听，不存在误用复合 id 调 sessions.open 的路径 | `scripts/check.mjs#job 子卡为纯展示`、`package.json::verify` |
| 边界配置 | 适用：子卡无 `role="button"`/`tabIndex`、默认光标、无悬停/聚焦反馈（明暗两主题） | `scripts/check.mjs#job 子卡为纯展示`、`scripts/acceptance.mjs#R-01-023/AC-08`、`package.json::verify` |
| 副作用 | 适用：R-01-023 其余呈现语义（两行结构、底色区分、时长推进）不变 | `e2e/specs/background-jobs.mjs#R-01-023/AC-05`、`package.json::verify` |

## 终态与证据

- 实现: PRD 删除 R-01-005/AC-03、R-01-023/AC-07 去尾句、新增 R-01-023/AC-08；SOLUTION 同步（R-01-005 追溯行与窗格渲染器代码位置回退、产品契约/活动状态模型关键结构/交互面/渲染器条目改写为纯展示语义）。代码：`src/client.mjs` job 子卡创建时 `entry.kind === "job" ? null : bindCardActivation(...)` 不绑激活（附 job 复合 id 空间隔离 → 不跨 kind 复用的不变量注释）、kind 骨架分支移除 `role`/`tabIndex`、CSS 默认光标与明暗两主题 hover 复位、删除 `dataset.jobOwner` 赋值；`src/navigation.mjs` 删除 `activationTarget`。`.dsh-plugin/client.js` 同次重建。
- 测试: `pnpm verify` 两轮全绿（实现 b8314b6 工作树与修复 cea2c2b 工作树各一轮，19/19 E2E，415–421s）；`pnpm verify:fast` 多轮通过（agentmap lint 27 需求/170 AC 全锚定、test impact 记账 +R-01-023/AC-08、~AC-07、-R-01-005/AC-03、check.mjs 全部断言）。R-01-023/AC-08 经真实浏览器断言验证：切到新会话后点击 job 子卡，主会话保持不变且子卡无按钮语义（e2e/specs/background-jobs.mjs）。
- SOLUTION 对照: 27 条需求追溯一一对应；无 R-01-005/AC-03 与 activationTarget 残留（tasks/ 与 RATIONALE 审计历史除外）；SOLUTION 契约与实现无差异（非 job 卡激活路径与 T-154 前逐句等价，bundle 契约钉住绑定条件与按钮语义移除）。
- commit: b8314b6 实现与 map 演进；cea2c2b 双轴审核修复
- review:
  - 审核方: code-review skill（Standards reviewer 与 Spec reviewer 双轴并行独立）
  - 目的理解: 在东家确认下撤销 T-154 引入的 job 子卡激活跳转（R-01-005/AC-03）——实际使用后跳转不好用，点击后台任务子卡应不触发任何操作；约束为 R-01-023 其余呈现语义不变、非 job 卡激活路径不变、变更以 R-01-023/AC-08 显式入 map 防止后续被当缺口补回，代码/测试/map 同次收敛。
  - 执行方式: code-review skill 双轴评审；Standards 轴对照 AGENTS.md/CONVENTIONS.md + Fowler 气味基线，Spec 轴对照 tasks/T-155-20260922-job-card-inert.md 与 PRD/SOLUTION 约束；评审基线 `git diff 73b5270...b8314b6`，复审范围 `git diff b8314b6..cea2c2b`，两轴独立并行后聚合、修复后同一审核方复审。
  - 问题与修复: ① check.mjs bundle 契约正向半边锚定注释措辞（改写即误报、措辞改回即静默通过）→ 改锚绑定条件单行与 `removeAttribute("role")` 代码结构，保留 `!includes("activationTarget")` 反向断言；② e2e 负向断言仅靠固定 1.5s 窗口 → 补「job 子卡无按钮语义」结构断言并注释窗口依据（无激活绑定、无重试链延迟路径）；③ 创建时按 entry.kind 一次性决定绑定与 reuse 路径的隐性耦合 → 补不变量注释（job 复合 id 空间隔离、reuseMap 按 id 复用不跨 kind）；④ 明暗成对 hover 复位规则为仓库既有布局，评审确认不构成违规、不改动。①②③均经同一审核方复审确认消失。
  - 复审结论: 通过。残余风险与测试缺口：无；说明——「不发生会话切换」本质是负向断言，e2e 以结构断言（无按钮语义）+ 有界时间窗联合承载，激活绑定缺失由 bundle 契约机械钉住。
