---
doc-type: task
mutation: lifecycle
id: T-200
---

# T-200 累计审计——窗口 2abd3bd..41d0017（T-197 关闭、v0.21.0、e2e 稳定性与 T-199）

状态: active
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改动代码与 map；审计发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-198（登记提交 2abd3bd）起窗口语义行 843 ≥ 800；按「立项与收口同笔」承载，先于 T-199 关闭完成并登记新复位点。

## 背景与目标

- 窗口 `2abd3bd..41d0017` 共 11 笔提交：T-197 关闭、T-197/T-198 证据哈希修复、v0.21.0 发布、四笔 e2e 稳定性修复（紧凑档等待按会话 id、侧栏选中后再断言滚动、移动挂起丢弃重试、宿主 --no-open 与 headless 资源）、e2e flake 纪律文档、T-199 实现与两笔评审修复。
- 目标: 跨改动核验「T-197 常驻 × e2e 稳定性修复 × T-199 视觉/激活 × 发布 bundle」四条线的交互；抽查窗口内 task 终态证据与 map 一致性；登记证据失实更正；判断能否复位累计审计点。

## 差距评估

- 审计对象: `git diff 2abd3bd..41d0017` 全部源码、测试、bundle、task、PRD/SOLUTION/DOMAIN 与 RATIONALE，以及窗口内 11 笔提交的正文与文件面。
- 跨改动重点: e2e 稳定性修复是否以放宽断言换绿（对照失败判据与超时口径）；T-197 常驻与 T-199 `data-foreground`/后台态的叠加（`data-current` 语义不变、滚动锚定与轨道测量不受外环影响）；v0.21.0 发布提交的 bundle 与 src 一致性；T-199 对等待三类卡的降权是否与 AC-08 强度一致、与徽标底色联动。
- 证据互证: T-197/T-198/T-199 终态四行、review 三标签、验证矩阵与自查清单；窗口内全量 e2e 结论与本次环境复跑结果。

## 收敛方案

1. Spec 轴: 窗口内 task 承诺与实现对照；跨改动交互核验；T-199 AC-03～AC-06 证据有效性复核（面板判别、前台/后台态数值、点击回前台、侧栏返回）。
2. Standards 轴: CONVENTIONS/DOMAIN 契约对照；task 证据结构抽查；bundle 与 src 一致性；e2e 修复是否引入吞错、放宽或环境依赖。
3. 证据更正: 只登记、不修改终态 task 原文；可随本审计收口修正的引证在本 task 内落地。
- 无分叉点: 审计范围为闸口机械划定的窗口 diff，无方案抉择。

## 测试计划

- 本 task 为只读审计，不新增测试；审计实跑 `node scripts/check.mjs`、`pnpm verify:fast` 与窗口相关 e2e spec 作为证据核验。
- 全量 e2e: 记录本次环境下的通过/失败清单；失败项以改动前 bundle 复跑对照，区分窗口回归与环境漂移。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口 diff 双轴核验与三条 task 证据结构抽查完成 | `tasks/T-197-pane-resident-user-controlled-visibility.md::终态与证据`、`tasks/T-198-cumulative-audit-ca5789d.md::终态与证据`、`tasks/T-199-foreground-background-visual-priority.md::终态与证据` |
| 异常 | 适用：证据失实或环境依赖登记为审计更正 | `tasks/T-200-cumulative-audit-window.md::终态与证据` |
| 边界配置 | 适用：发布提交 bundle 与 src 一致性、`data-current` 语义不变、等待三类强度一致 | `scripts/check.mjs::data-foreground`、`scripts/check.mjs::三类等待卡描边统一` |
| 副作用 | 适用：窗口内 e2e 修复未放宽断言；审计不修改终态 task 原文 | `e2e/specs/compact-density.mjs::DONE_CARD`、`RATIONALE/C-104-visual-priority-current-foreground.md::决策` |

## 自查清单

- 边界：窗口起点取复位点 T-198 登记提交之后，终点取 T-199 最后一笔修复 41d0017；发布提交的 bundle 与 src 按字节一致。
- 异常路径：窗口内 completed task 的四行证据、major 的 review 三标签与自查清单逐项抽查；发现失实只在审计 task 登记更正，不改终态原文。
- 回归影响：T-199 两轮独立双轴评审 blocking 清零；窗口内受影响 spec 全绿；全量失败项与改动前基线一致，按环境漂移登记。
- 残余风险：0.2.2 真实全局面板与移动壳层的部分路径未在本次环境复测；全量 e2e 的 5 个环境漂移失败仍阻断 pre-push，需另行修复 harness/宿主对齐；审计为只读，不替代后续单改动评审。

## 终态与证据
