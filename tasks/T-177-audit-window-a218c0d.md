---
doc-type: task
mutation: lifecycle
id: T-177
---

# T-177 累计审计：T-175 复位点后窗口双轴审计

状态: completed
类型: 累计审计
触发: 自复位点（T-175）起窗口语义行 ≥ 300（CONVENTIONS「累计审计行数间隔: 300」；行数间隔先触发）。lint 实测窗口语义行 332（复位 task 证据最早被引提交 05c61da 起，11 个提交，含生成物 .dsh-plugin/client.js 59 行——见 N-3 口径漂移记录）；task 立项时按 close..HEAD 口径手工登记 321，两口径均 ≥300，触发结论不变，实测值以 lint 为准。

## 背景与目标

AgentMap 累计审计机制要求：复位点起窗口内全部累计改动（含不开 task 的短路改动）达到间隔即须开累计审计 task 做全量双轴审计，跨改动视角捕捉逐改动审核看不到的漂移；审计收尾提交在 CONVENTIONS 登记新复位点后才可关闭下一个 task（T-176 在等此门禁）。

窗口提交（a218c0d..2485f29，共 10 个）：

- b74f508 测试(activity-pane)：启动就绪等待加宽至 30 秒（短路改动）
- df7634a 测试(activity-pane): 回填竞态用例改为时序构造（短路改动）
- 7835e7d 发布(package): 对齐 v0.17.0
- 1cfda0e 发布(package): 对齐 v0.17.1
- 90b3be0 功能(tool): 升级工作系统到审核分档 v4
- 4ce78f7 功能(tool): 同步 agentmap lint 修复（lint 警示：touches code without T-ID reference or review: line）
- fc9d7c2/9152bae/884eaab/2485f29 功能(activity-pane)（T-176 四连提交）

## 差距评估

- 触发条件已由 lint 机械判定（窗口语义行 332 ≥ 300），无需评估 map 差距；审计对象是窗口内改动的 spec 符合性与 Standards 符合性。

## 收敛方案

1. 双轴独立子代理审计（code-review skill 流程），固定点 a218c0d、HEAD 2485f29。
2. Spec 轴：逐提交对照其 task/需求锚点（T-176 全链、tool 升级对应 CONVENTIONS/AGENTS 声明、发布对齐的 package 变更），重点跨改动漂移——四连提交间的口径演化（命中区 22×22→24×24）、tool 升级与 hook 行为一致性。
3. Standards 轴：CONVENTIONS 硬约束（提交体例、门禁）、代码 smell 基线、跨提交累计引入的重复/漂移（如钉版本注释与 RATIONALE C-099 一致性、bundle 同步完整性）。
4. 发现分级处置：blocking 修复循环，non-blocking 记录。

## 测试计划

- 审计 task 本身不引入产品代码变更，验证以审计发现与修复为准；若收口阶段含修复性改动（如 CONVENTIONS 参数登记），以受影响测试的复跑作为证据。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| （无产品契约变化） | 审计 task：只读审计 + 收口期非契约修复 | 不涉及 | 保留 | 窗口内改动已由其归属 task 的测试影响表承载 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口内每笔改动的 spec 符合性逐条核验 | 审计 findings 清单（逐条 file:line） |
| 异常 | 适用：窗口内异常路径改动（钉版本、门禁放宽）的正当性复核 | e2e/boot.mjs 钉版注释、C-099 对照 |
| 边界配置 | 适用：累计口径——多提交间契约一致性（SOLUTION 契约行随实现演化保持同步） | SOLUTION 374/149 行与最终代码对照 |
| 副作用 | 适用：工具链升级（90b3be0/4ce78f7）对门禁行为的影响复核 | agentmap lint 运行输出（--self-test、--report 实跑） |

## 自查清单

- [ ] 窗口完整性：a218c0d..2485f29 全部提交纳入，无遗漏（含短路改动与发布提交）。
- [ ] 跨改动视角：逐改动审核结论之外检查累计漂移（口径、重复、契约漂移）。
- [ ] 审计独立性：审核方与实现上下文分离，发现逐条带 file_path:line。

## 终态与证据

- 实现: 双轴独立上下文审计完成（窗口 a218c0d..2485f29，10 提交，18 文件 +1225/−56）：Standards 轴 6 项 non-blocking、Spec 轴 5 项 non-blocking，无 blocking。仓内收口动作：CONVENTIONS「语义行排除路径」登记 `.dsh-plugin/`（N-3，决策记 C-100）；DOMAIN 登记「命中区」词条（窗口前既有漂移，PRD.md:83、SOLUTION.md:374/470 已在用）；T-177 触发行与提交数改按 lint 实测口径（332 行、10 提交，N-2）；N-6 box-sizing 显式声明与上游 lint 口径修复（N-1/N-2/N-3 的 tools/agentmap_lint.py 部分）记 TODO 或上游归口，不扩审计窗口。
- 测试: lint --self-test 与 node scripts/check.mjs 实跑由双轴审计方独立执行通过（报告在案）；本 task 无产品代码变更，无新增测试。
- SOLUTION 对照: 审计确认窗口内 SOLUTION 演进（T-176 契约行、核对日期 2026-10-22）与实现一致、无漂移；本审计未改 SOLUTION。
- commit: 2485f29（审计窗口端点 a218c0d..2485f29；复位点登记随本关闭提交生效）
- review:
  - 审核方: 独立子代理双轴——Spec 轴（逐提交 spec 符合 + 语义行独立复测）、Standards 轴（CONVENTIONS/DOMAIN/smell 基线 + 跨改动累计视角）
  - 目的理解: 窗口含 e2e 稳定性修复、发布对齐、AgentMap v4 工具升级与 T-176 四连提交五类目的；预期=各提交符合其归属 spec、跨改动无漂移、计量口径可复现
  - 执行方式: 双轴并行独立子代理（固定点 a218c0d..2485f29）；spec 源=逐提交归属 task/PRD/SOLUTION 契约落点；standards 源=CONVENTIONS、DOMAIN 术语表、client.mjs 模块风格、12 条 Fowler smell 基线、吞错/缺失校验专项
  - 问题与修复: 合计 11 项 non-blocking（无 blocking）——①1cfda0e 发布声明「包内容与 v0.17.0 相同」后半句不实（scripts/check.mjs ±1 行随包发布；记录在案，不重写历史）；②T-176 语义行数 132/235 不复现（自述口径实测 126/284，lint 228）→ 关单时改记 lint 口径；③lint task_commit_span 对多提交 task 只量至最早被引提交、复位窗口基点含复位 task 收尾提交（方向保守多计）——归口上游 canonical（skills 仓）修复，本仓不单独改避免漂移；④4ce78f7 短路缺 review: 行属实——豁免判断=canonical 同步提交（对齐 skills 仓 16727f9、不重写历史），记录于本终态，不补提交；⑤C-099 提及 boot.mjs 路径属 append-only 写作灰点——既有条目不改，后续条目遵守；⑥N-3 生成物双计——CONVENTIONS 排除路径登记 `.dsh-plugin/`（本提交，C-100）；⑦「命中区」DOMAIN 词条窗口前已漂移——本次登记；⑧N-6 box-sizing 依赖 UA 默认——记 TODO.md 维护想法，不改码（三重防线已钉死）；另「共 9 个」笔误已改 10。
  - 复审结论: 双轴均无 blocking；窗口内改动 spec 符合、T-176 终态自洽、发布与钉版决策留痕完整；non-blocking 集中于 v4 工具度量口径漂移（task_commit_span 多提交低估、窗口基点含复位 task 自身收尾提交、生成物未排除）与文书数字未对齐 lint 实测——上游项建议随 skills 仓修复，仓内项已于本提交收口
- 4ce78f7 豁免判断（N-4）: v4 短路纪律要求的 review: 行缺失属实（lint warning 非误报）；豁免理由=该提交为 skills 仓 canonical 16727f9 的同步（行为对齐上游、非仓内独立决策），system-managed 路径语义行计 0；按不重写历史原则处置，后继同类同步提交正文补 review: 行。
- 语义行数: 窗口 332（lint 实测，含生成物 59 行——登记 `.dsh-plugin/` 排除后新窗口统计不再含生成物）
