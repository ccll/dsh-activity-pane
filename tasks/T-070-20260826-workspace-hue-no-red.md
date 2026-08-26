---
doc-type: task
mutation: lifecycle
id: T-070
---

# T-070 工作区徽标色相弧收窄避开红色警戒区

状态: active
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
