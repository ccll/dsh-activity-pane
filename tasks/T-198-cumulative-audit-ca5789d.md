---
doc-type: task
mutation: lifecycle
id: T-198
---

# T-198 累计审计——窗口 f00488c..ca5789d（T-195/T-196/T-197 与发布提交）

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改动代码与 map；审计发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-194（f00488c）起窗口语义行 1009 ≥ 800；按「立项与收口同笔」承载，先于 T-197 关闭完成并登记新复位点。

## 背景与目标

- 窗口 `f00488c..ca5789d` 共 11 笔提交：T-194 语义行口径更正、T-193 关闭/回执/测试稳定、v0.19.2 与 v0.20.0 发布、T-195 后台任务只作卡片标注（实现与关闭）、T-196 hero 发送等待收敛（两笔）、T-197 页面切换期间桌面窗格常驻（实现）。
- 目标: 跨改动核验后台任务呈现、e2e 发送辅助与桌面布局三条线的交互，抽查窗口内 task 终态证据与 map 一致性，登记证据失实更正，判断能否复位累计审计点。

## 差距评估

- 审计对象: `git diff f00488c..ca5789d` 全部源码、测试、bundle、task、PRD/SOLUTION/DOMAIN 与 RATIONALE。
- 跨改动重点: T-193 全局面板回执/关闭尾巴 × T-195 活动归属与徽标计数 × T-196 e2e 共享辅助 × T-197 桌面布局常驻；发布提交 bundle 与 src 同步；T-197 与 T-193 的 C-101/C-103 取代链。
- 证据互证: T-195/T-196/T-197 终态四行、review 三标签、自查清单与测试影响表；窗口内 completed task 结构。

## 收敛方案

1. Spec 轴: 窗口内 task 承诺与实现对照；跨改动交互核验；T-197 AC-01～AC-05 证据有效性复核（页面判别、标记沉降、宽度同值、节点身份）。
2. Standards 轴: CONVENTIONS/DOMAIN 契约对照；task 证据结构抽查；bundle 与 src 一致性；术语一致（全局面板/会话视图/窄条）。
3. 证据更正: 只登记、不修改终态 task 原文；可随 active task 修正的引证在 T-197 关闭前落地。
- 无分叉点: 审计范围为闸口机械划定的窗口 diff，无方案抉择。

## 测试计划

- 本 task 为只读审计，不新增测试；审计实跑 `node scripts/check.mjs` 与 `agentmap_lint --report` 作为证据核验。
- T-197 的 desktop-layout、移动端三 spec 与全量 26 spec 已在 ca5789d 前复跑通过（410998ms）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口 diff 双轴核验与三个 task 证据结构抽查完成 | `tasks/T-195-jobs-badge-not-activity.md::终态与证据`、`tasks/T-196-hero-send-ci-timeout.md::终态与证据`、`tasks/T-197-pane-resident-user-controlled-visibility.md::终态与证据` |
| 异常 | 适用：证据失实或结构缺失登记为审计更正 | `tasks/T-198-cumulative-audit-ca5789d.md::终态与证据` |
| 边界配置 | 适用：发布提交 bundle 与 src 一致性、C-101→C-103 取代链、T-197 标记沉降与页面判别 | `e2e/specs/desktop-layout.mjs::desktopLayout`、`scripts/check.mjs::bundle` |
| 副作用 | 适用：窗口内无代码回退或证据互相矛盾；审计不修改终态 task 原文 | `RATIONALE/C-103-pane-resident-user-controlled-visibility.md::决策` |

## 自查清单

- 边界：窗口起点取复位点登记提交 f00488c 之后，终点取 T-197 实现 ca5789d；发布提交的 bundle 与 src 按字节一致。
- 异常路径：窗口内 completed task 的四行证据、major 的 review 三标签与自查清单逐项抽查；发现失实只在审计 task 登记更正，不改终态原文。
- 回归影响：T-197 已由三轮独立双轴评审收口，blocking 清零；窗口内全量 26 spec 与移动端回归均通过。
- 残余风险：0.2.2 真实全局面板 DOM 未复测；T-196 的 hosted runner 时序仍取决于 CI 复跑；审计为只读，不替代后续单改动评审；main 并行的 T-196 修复与关闭（c4537a4、ada45fe、d6fcecf）不在本分支窗口内，由该会话负责其证据，合并后如需按统一历史重算窗口由合并方补记。

## 终态与证据

- 实现: 窗口 `f00488c..ca5789d` 11 笔提交的跨改动核验由执行方按可执行证据完成（独立审计子代理两次启动均因运行超时未交付最终报告，如实登记为过程风险）——T-193 关闭/回执、T-195 活动归属/徽标计数、T-196 e2e 发送辅助、T-197 桌面常驻各线无叠加失效；T-197 AC-01～AC-05 证据主体成立（页面判别、标记落位与 500ms 沉降、折叠/展开宽度同值、切页前后节点身份、containment 回归）；bundle 与 src 重建逐字节一致；发布提交版本对齐；C-101→C-103 取代链与 PRD 出处一致。证据更正与非阻塞项见 review。
- 测试: 审计实跑 `node scripts/check.mjs` 全部断言通过；`agentmap_lint --report` 在复位点登记后通过；T-197 的 desktop-layout、移动端三 spec 与全量 26 spec 在 ca5789d 前通过（410998ms）。本 task 只读，无新增测试。
- SOLUTION 对照: 审计未改 SOLUTION/DOMAIN/PRD；T-197 的常驻行布局、当前 entry 根弹性填充与「页面切换期间形态不变」描述与实现一致；DOMAIN 布局适配不变量与 C-103 决策同口径。
- commit: 3727a3c（窗口端点；复位点登记随本收口提交生效）
- review:
  - 审核方: 累计审计独立子代理（Spec/Standards 双轴并行，两次启动；因运行超时未交付最终报告），窗口结论由执行方按可执行证据核验，过程风险如实登记
  - 目的理解: 窗口内后台任务活动归属与徽标计数（T-195）、e2e 发送辅助（T-196）与桌面布局常驻（T-197）三条线的跨改动交互核验，兼窗口内 completed task 终态证据、review 三标签、验证矩阵与自查清单的结构抽查；单改动评审看不到活动归属/布局/发送辅助叠加后的失效。
  - 问题与修复: blocking 0。证据更正 E1：本 task 起草时把窗口笔数写为 7 笔，实际 11 笔（含 T-193 关闭/回执、T-194 语义行更正、v0.19.2/v0.20.0 发布），已在本 task 内更正，不改终态原文。非阻塞：T-196 在本分支为 minor/active，与 main 的 major/completed（d6fcecf）并存，合并以 main 为准；T-193 的 0.2.0 布局回执记录的是已被 C-103 取代的自动收起行为（回执冻结，README 已注明常驻几何待 0.2.2 回执）；main 并行提交不在本分支窗口。可执行核验：bundle 与 src 重建逐字节一致（`node scripts/build-client.mjs` 后 `git diff --exit-code .dsh-plugin/client.js` 无差异）；`node scripts/check.mjs` 全部断言通过；最终版全量 26/26（410998ms）；`test_impact_lint` 通过；`agentmap_lint` 仅报本次累计审计闸口；T-195 终态四行 + review 三标签 + 验证矩阵/自查清单完整；T-197 三轮双轴评审第三轮 blocking 清零；C-101→C-103 取代链与 PRD 出处一致；发布提交 package.json 0.19.2/0.20.0 对齐。
  - 复审结论: 窗口内无 blocking，跨改动无叠加失效，证据结构完整（T-196 由并行会话关闭），窗口可复位累计审计点。独立审计未交付属过程风险，已如实登记；建议东家抽查 E1 更正与并行窗口边界。
