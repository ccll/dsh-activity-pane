---
doc-type: task
mutation: lifecycle
id: T-070
---

# T-070 工作区徽标色相弧收窄避开红色警戒区

状态: completed
关联: R-01-003/AC-09 → 活动状态模型
风险等级: standard

## 背景与目标

T-068 落地的 `workspaceHue` 以十二槽 30° 铺满整个色相环，必然覆盖红色区（约 330°–30° 环绕段），而红色系在窗格中已被错误状态语义占用。东家要求避开红色警戒色。需求修订（R-01-003/AC-09 改为十槽避红弧）与 DESIGN/DOMAIN/DECISIONS（C-027）演进已经两道闸口确认：槽位收窄为 40°–310° 十槽，叠加 ±10° 抖动后输出落在 [30°,320°]。

## 差距评估

- `src/core.mjs`：`workspaceHue` 槽位数 12、无偏移，输出 [0,360)。
- `scripts/check.mjs`：AC-09 锚点按全环 30° 量化断言；无红色区排除断言。
- `scripts/acceptance.mjs`：色彩区分人工步骤未含「无红色系」判定。

## 收敛方案

- `src/core.mjs`：`workspaceHue` 改为 slot = hash % 10，基色 40° + slot×30°，叠加 ±10° 抖动，输出 [30,320]；文档注释同步。
- `scripts/check.mjs`：AC-09 锚点改为十槽弧量化（(hue−40) 对齐 30° 槽位 ±10°）+ [30,320] 范围断言（红色区排除）。
- `scripts/acceptance.mjs`：人工步骤补「任何徽标都不是红色系」。
- 其余（身份归一、着色管线、几何字号）不变。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点先改（旧实现下必红），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。
- 集成：rebase 到最新 canonical main 后合并；T-ID/C-ID 冲突按未发布冲突规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：派生色相落在 [30,320]、十槽量化、不同工作区尽量分散 | `scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceHue` |
| 异常 | 适用：空身份仍返回 null，不派生色相 | `scripts/check.mjs#R-01-003/AC-08`、`src/core.mjs::workspaceHue` |
| 边界配置 | 适用：槽位端点 40°/310° 加抖动后仍在弧内；同身份恒同色不变 | `scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceHue` |
| 副作用 | 适用：着色管线、胶囊几何与既有 bundle 断言不变 | `scripts/check.mjs#R-01-003/AC-10`、`src/client.mjs::renderCardInto` |

## 终态与证据

- 实现: `src/core.mjs::workspaceHue`——slot 由 % 12 改为 % 10，基色 40° + slot×30°（槽位 40°–310°），叠加哈希低位 ±10° 抖动，输出 [30,320] 整数，红色警戒区整体排除；文档注释同步。着色管线、身份归一、胶囊几何未动。
- 测试: 测试先行——`scripts/check.mjs` AC-09 锚点先改写（避红弧 [30,320] 范围断言 + (hue−40) 对齐十槽 ±10° 量化断言），旧实现下必红（/srv/ops 旧派生恰为 0° 纯红），实现后转绿；AC-08 范围断言收敛为整数断言（区间承诺移交 AC-09）；`scripts/acceptance.mjs` 人工步骤补「任何徽标都不是红色系」。`pnpm build:client && pnpm check` 全绿（bundle 与 src 一致）；`python3 tools/agentmap_lint.py --report` 通过（22 需求 / 120 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「徽标色相不变量」「工作区归属归一」条目（十槽、40°–310° 槽位、±10° 抖动、[30,320] 输出）逐字一致；PRD R-01-003/AC-09 修订口径、DOMAIN「工作区色相」（30°–320° 含端点）、DECISIONS C-027 同口径；无差异。
- commit: e02dd8c93c9bd8424998a2573ae3c3b4b2825295
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 0cd2a769、Spec 子代理 48e05f50，code-review skill 流程）
  - 目的理解: workspaceHue 由十二槽全色相环收窄为十槽避红弧（40°–310° 槽位 + ±10° 抖动 → [30,320]），任何徽标色相不落入红色警戒区，纯函数无状态性质不变；关联 PRD R-01-003/AC-09 修订口径、DESIGN 徽标色相不变量、DECISIONS C-027（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线 `git diff main...HEAD`（评审提交 5be9b76，DOMAIN 措辞修订后为 e02dd8c93c9bd8424998a2573ae3c3b4b2825295），范围含 src/core.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN/DOMAIN/DECISIONS、tasks/T-070 与 .dsh-plugin/client.js 构建产物一致性。
  - 问题与修复: 两轴均无硬违规、无规格缺失、无 scope creep。Standards 轴判断性建议 2 项：①DOMAIN「约 30°–320°」的「约」与一词无歧义规范有张力——已采纳，改为「30°–320°，含端点」并经同一审核方复审确认；②check.mjs 槽位断言用 Math.round 略绕——保留（精确判定 (hue−40) 对齐 ±10°，改动收益低）。Spec 轴低严重度提示 1 项：输出下界 30° 与 C-027 所述红色区边界（约 330°–30°）相切——规格修订口径已定义 [30,320] 为合法域且 hsl(30°) 为橙色非红，合规不改，呈报东家定夺。
  - 复审结论: Standards 轴复审通过（DOMAIN 修订到位、无遗留问题）；Spec 轴首轮即通过，无待修复项故无需复审循环。
