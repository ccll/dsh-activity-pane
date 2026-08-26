---
doc-type: task
mutation: lifecycle
id: T-072
---

# T-072 工作区徽标全弧取色与单色系协调着色

状态: active
关联: R-01-003/AC-09、AC-11 → 活动状态模型
风险等级: standard

## 背景与目标

T-070 后东家实测：几个不同工作区徽标同显蓝色。根因有二：djb2 低位分布聚集（slot = hash % 10 只取低位，长公共前缀路径挤进相邻槽位）；十槽仅 10 个取值，少量工作区撞槽概率不低。同时东家提出新需求：前景与背景配色符合美术选色经验、协调好看。需求演进（AC-09 改全弧均匀取色、新增 AC-11 单色系协调）与 DESIGN/DOMAIN/DECISIONS（C-029）演进已经两道闸口确认。

## 差距评估

- `src/core.mjs`：`workspaceHue` 仍为十槽量化 + 抖动，哈希无雪崩终混。
- `src/client.mjs`：CSS 基色 S/L 与混白比例（文字 88%）未按单色系标签配色分主题校准。
- `scripts/check.mjs`：AC-09 锚点为十槽口径；无 AC-11 锚点。
- `scripts/acceptance.mjs`：无协调配色人工判定。

## 收敛方案

- `src/core.mjs`：`workspaceHue` 改为 djb2 + 雪崩终混（`hash ^= hash >>> 16`、`hash *= 0x45d9f3b`、每步 `>>> 0` 保持无符号）后 `30 + hash % 291`，输出 [30,320]；注释同步。
- `src/client.mjs`：`.dap-workspace` 深色基色 hsl(h 70% 68%)、文字 mix 92%、底 14%、边 32%；浅色基色 hsl(h 72% 40%)、底 12%、边 28%。
- `scripts/check.mjs`：AC-09 锚点改全弧（[30,320] 范围 + 291 取色模 + 现实长前缀键两两可区分回归）；新增 AC-11 bundle 断言（分主题 S/L 与透明度层次）。
- `scripts/acceptance.mjs`：人工步骤补「同色相单色系、前景背景协调可辨」判定。
- 其余（身份归一、写入管线、几何字号）不变。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点先改（旧实现下必红），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。
- 集成：rebase 到最新 canonical main 后合并；T-ID/C-ID 冲突按未发布冲突规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：全弧 [30,320] 均匀取色、现实长前缀键两两可区分、分主题单色系着色 | `scripts/check.mjs#R-01-003/AC-09`、`scripts/check.mjs#R-01-003/AC-11`、`src/core.mjs::workspaceHue`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：空身份仍返回 null | `scripts/check.mjs#R-01-003/AC-08`、`src/core.mjs::workspaceHue` |
| 边界配置 | 适用：输出域恰为 [30,320] 闭区间（模 291）；红色区排除；同身份恒同色 | `scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceHue` |
| 副作用 | 适用：胶囊几何/字号/图标与写入管线不变（既有断言保持） | `scripts/check.mjs#R-01-003/AC-07`、`src/client.mjs::renderCardInto` |

## 终态与证据
