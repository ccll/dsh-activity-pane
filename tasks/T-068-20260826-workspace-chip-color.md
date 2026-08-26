---
doc-type: task
mutation: lifecycle
id: T-068
---

# T-068 工作区徽标按工作区身份派生稳定色相着色

状态: completed
关联: R-01-003/AC-08、AC-09、AC-10 → 活动状态模型
风险等级: standard

## 背景与目标

活动卡与最近卡的工作区徽标（`.dap-workspace` 胶囊）目前一律继承卡片 currentColor，所有工作区同色，无法凭颜色区分归属。东家要求：同一工作区的所有胶囊颜色相同、不同工作区可区分、跨刷新稳定。需求演进（R-01-003 追加 AC-08/09/10）与 DESIGN/DOMAIN 演进已经两道闸口确认：以工作区身份（路径优先、名称兜底）为唯一输入的纯函数派生色相，无状态、无持久化。

## 差距评估

- `src/core.mjs`：条目只有 `workspaceTitle`，无工作区身份字段；无色相派生函数。
- `src/client.mjs`：`.dap-workspace` 三层配色（文字 90% / 底 11% / 描边 24%）全部基于 currentColor；渲染层不写任何色相变量。
- `scripts/check.mjs`：R-01-003 锚点仅覆盖归属判定、图标与字号，无色相断言。
- `scripts/acceptance.mjs`：无色彩区分人工验收步骤。

## 收敛方案

- `src/core.mjs`：新增 `workspaceInfoForSession`（单一路径判定归属并返回 `{ title, key }`，key = 路径优先、名称兜底；原 `workspaceTitleForSession` 随审核修复删除）；新增 `workspaceHue(key)`（djb2 哈希 → 十二槽 30° 量化 + 低位 ±10° 抖动，输出 [0,360) 整数，空身份返回 null）；`buildEntries`/`buildRecent` 条目补 `workspaceKey`（子代理随徽标隐藏置空）；`cardSignature` 并入 `workspaceKey`。
- `src/client.mjs`：`.dap-workspace` 基色改为 `hsl(var(--dap-workspace-hue) …)` 并经 color-mix 保持透明度层次，浅色主题校准基色明度；`renderCardInto` 显示徽标时写入 `--dap-workspace-hue`、隐藏时移除。胶囊几何与字号不变。
- `scripts/check.mjs`：R-01-003/AC-08/09/10 锚点（身份归一、色相纯函数性质、量化槽位、签名分量、bundle 接线）。
- `scripts/acceptance.mjs`：新增色彩区分人工验收步骤。
- 不新增依赖，不引入持久化。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点先写（旧实现下必红），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`。
- GUI 现场验收（同色一致、异色区分、刷新稳定、深浅主题协调）由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。
- 集成：完成后 rebase 到最新 canonical main 并合并；若有其它 worktree 先入主干导致 T-ID/C-ID 冲突，按未发布冲突规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：同一工作区徽标恒同色、不同工作区色相分散、深浅主题协调可辨 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceHue`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：无归属会话徽标隐藏且不写色相；空身份 `workspaceHue` 返回 null | `scripts/check.mjs#R-01-003/AC-08`、`src/core.mjs::workspaceHue` |
| 边界配置 | 适用：工作区无路径时以名称为身份兜底；cwd 匹配以路径为身份；色相量化槽位 ±10° 抖动范围 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceInfoForSession` |
| 副作用 | 适用：胶囊几何/字号/图标不变（既有 bundle 断言保持）；色相变化经签名驱动重绘、签名去重不受新分量误触发 | `scripts/check.mjs#R-01-003/AC-06`、`scripts/check.mjs#R-01-003/AC-10`、`src/core.mjs::cardSignature` |

## 终态与证据

- 实现: `src/core.mjs`——新增 `workspaceInfoForSession`（单一路径判定归属并返回 `{ title, key }`，key 路径优先、名称兜底，cwd 匹配同口径；`workspaceTitleForSession` 薄封装经审核删除）与 `workspaceHue`（djb2 哈希 → 十二槽 30° 量化 + 低位 ±10° 抖动，[0,360) 整数，空身份 null）；`buildEntries`/`buildRecent` 条目补 `workspaceKey`（子代理置空）；`cardSignature` 并入 `workspaceKey`。`src/client.mjs`——`renderCardInto` 显示徽标时写入、隐藏时移除 `--dap-workspace-hue`；`.dap-workspace` 基色改 `hsl(var(--dap-workspace-hue, 210) …)` 并经 color-mix 三层（文字 88% 混入 currentColor / 底 13% / 描边 30%）呈现，浅色主题校准基色明度（72%/40%）；胶囊几何、字号、图标未动。
- 测试: 测试先行——`scripts/check.mjs` 先写 R-01-003/AC-08/09/10 锚点（旧实现下 SyntaxError 必红），实现后转绿：身份归一 deepEqual（路径优先/名称兜底/cwd 匹配/无归属皆空）、`workspaceHue` 纯函数性质（同身份恒同色、[0,360) 整数、空身份 null、两示例工作区可区分）、十二槽 ±10° 量化断言、条目携带 `workspaceKey`（活动/最近/子代理置空）、签名分量判别、bundle 接线与 CSS 层次断言；`scripts/acceptance.mjs` 新增色彩区分人工步骤。`pnpm build:client && pnpm check` 全绿；`python3 tools/agentmap_lint.py --report` 通过（22 需求 / 119 AC 全追溯、全锚定）；`git diff --check` 干净。集成按未发布冲突规则 rebase 至 canonical d1271eab0fcd48fdef7cbe7370c0bd786e5206ed，任务号由 T-065 重排为 T-068，重建 bundle 无漂移（与 T-066 条纹化合并后 check 全绿）。GUI 现场验收由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「徽标色相不变量」「核心结构（workspaceKey）」「工作区归属归一」「工作区徽标着色」产品契约条目、窗格渲染器工作区徽标条目及需求追溯索引（R-01-003 → 活动状态模型）逐条一致；PRD R-01-003/AC-08～AC-10、DOMAIN「工作区色相」同口径；选型记录于 C-026，无差异。
- commit: 0545fb750aac86d63d10b32b8490f134baab7513
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 572af4b4、Spec 子代理 f861972f，code-review skill 流程）
  - 目的理解: 活动卡/最近卡工作区胶囊由一律继承 currentColor 改为按工作区身份（路径优先、名称兜底）纯函数派生稳定色相着色——同一工作区恒同色、不同工作区经十二槽量化尽量分散、跨刷新稳定、深浅主题经 color-mix 层次协调、胶囊几何字号不变；关联 PRD R-01-003/AC-08～AC-10、DESIGN 徽标色相不变量与产品契约、DECISIONS C-026（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线 `git diff main...HEAD`（merge-base 56b298d8738c445484d75c9572102d97c7ed009a；评审提交 de72528，修复后 73d8b0a，集成 rebase 重排后为 0545fb750aac86d63d10b32b8490f134baab7513，内容仅 T-ID 重排与 DESIGN 冲突收敛），范围含 src/core.mjs、src/client.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN/DOMAIN/DECISIONS、tasks/T-068 与 .dsh-plugin/client.js 构建产物一致性。
  - 问题与修复: Standards 轴硬违规 1 项——DESIGN 核心结构条目「子代理继承母会话取值」与实现/测试/task 三处置空矛盾，已修正 DESIGN 为「无归属或子代理（徽标隐藏）为空」；判断性建议 2 项均已采纳修复——Middle Man（删除仅剩测试引用的 `workspaceTitleForSession` 薄封装，断言改用 `workspaceInfoForSession(...).title`）、Speculative Generality（删除渲染层 `workspaceKey ?? workspaceTitle` 兜底）。Spec 轴同一 DESIGN 矛盾（同源修复）+ 轻微 scope creep 观察（CSS 默认色相 210 为防御性写法，保留）。复审追加观察 2 项均已处理——task 收敛方案措辞同步删除薄封装、DESIGN 徽标色相不变量补 C-026 链接；终态 T-004 历史证据锚点随函数删除失效，属审计记录按纪律不动。
  - 复审结论: 修复后双轴复审均通过（Standards 572af4b4、Spec f861972f 各自复核确认），无遗留 finding。
