---
doc-type: task
mutation: lifecycle
id: T-072
---

# T-072 工作区徽标全弧取色与单色系协调着色

状态: completed
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

- 实现: `src/core.mjs::workspaceHue`——djb2 哈希经雪崩终混（异或右移 + `Math.imul` 乘法，每步 `>>> 0` 保持无符号；注释注明 0x45d9f3b 常数出处与普通乘法溢出 2^53 丢精度问题）后全弧均匀取色 `30 + hash % 291`，输出 [30,320]；十槽量化与抖动取消。`src/client.mjs`——`.dap-workspace` 单色系分主题校准（深色 hsl(h 70% 68%) 文字 92% 保色/底 14%/边 32%；浅色 hsl(h 72% 40%)/底 12%/边 28%），注释同步；几何字号与写入管线未动。
- 测试: 测试先行——`scripts/check.mjs` 锚点先改（旧实现下必红：样例族 210/200 间距仅 10°），实现后转绿：AC-09 全弧断言（[30,320] 范围 + 长公共前缀样例族两两相异 + 性质级聚集回归「50 个长前缀身份分散 ≥40 色相」，实测 47）；AC-11 bundle 断言（分主题 S/L、底/边透明度、92% 保色）。审核修复中将过拟合哈希配方的「≥15° 间距」断言替换为性质级断言。`pnpm build:client && pnpm check` 全绿（bundle 与 src 一致）；`python3 tools/agentmap_lint.py --report` 通过（22 需求 / 122 AC 全追溯、全锚定）；`git diff --check` 干净。GUI 现场验收由东家按 `scripts/acceptance.mjs` 清单执行。
- DESIGN 对照: 与 DESIGN「徽标色相不变量」（雪崩终混、30 + hash % 291、[30,320]）、「工作区徽标着色」产品契约（分主题 S70/L68、S72/L40 与各层透明度）、「工作区归属归一」条目逐字一致；PRD R-01-003/AC-09 修订与 AC-11、DECISIONS C-029 同口径；无差异。
- commit: 2f25e11597ddc21a723637fc41837ba4d6898f4b
- review:
  - 审核方: 独立 reviewer 双轴（Standards 子代理 cf0067d8、Spec 子代理 1931d4f1，code-review skill 流程）
  - 目的理解: 工作区徽标色相由十槽量化+抖动改为 djb2 雪崩终混后全弧均匀取色（30 + hash % 291 → [30,320]），修复多工作区同显蓝色缺陷（djb2 低位聚集 + 十槽撞槽）；并按单色系标签配色经验分主题校准前景/背景；关联 PRD R-01-003/AC-09 修订与 AC-11 新增、DESIGN 徽标色相不变量与产品契约、DECISIONS C-029（两轴均在审核前记录目的理解）。
  - 执行方式: `code-review` skill，评审基线 `git diff main...HEAD`（评审提交 6263f10，修复后 2f25e11597ddc21a723637fc41837ba4d6898f4b），范围含 src/core.mjs、src/client.mjs、scripts/check.mjs、scripts/acceptance.mjs、PRD/DESIGN/DOMAIN/DECISIONS、tasks/T-072 与 .dsh-plugin/client.js 构建产物一致性。
  - 问题与修复: Standards 轴无硬违规，判断性建议 2 项均已采纳——雪崩终混魔数 0x45d9f3b 补注出处（指向 C-029）、hueFamily 回归样本补注现场来源（T-070 复现路径形态，勿随意替换）；CSS 主题覆盖块参数差异按 YAGNI 保持不动。Spec 轴实质 finding 1 项——雪崩乘法用普通乘法超出 double 精确整数上限 2^53、低 32 位丢精度，已改用 `Math.imul` 并实测低 32 位与参考一致；连带将过拟合哈希配方的「≥15° 间距」断言改为性质级聚集断言（修复后样例族最小间距降为 5°，属哈希配方敏感性而非分散性回退）。另 Spec 轴提示 check.mjs 间距断言严于收敛方案原文，随上述替换消解。
  - 复审结论: 双轴复审均通过（Standards cf0067d8 确认两处修复到位无新问题；Spec 1931d4f1 确认 imul 修复与测试调整合理），无遗留 finding。
