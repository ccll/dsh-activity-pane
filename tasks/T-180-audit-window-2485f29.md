---
doc-type: task
mutation: lifecycle
id: T-180
---

# T-180 累计审计：T-177 复位点后窗口双轴审计

状态: completed
类型: 累计审计
触发: 自复位点（T-177，2485f29）起窗口语义行 425 ≥ 300（行数间隔先触发；agentmap lint 于 b5c4979 上 verify 时报 397、b23fe4e 后实测 425）

## 背景与目标

AgentMap 累计审计机制要求：复位点起窗口内全部累计改动达到「累计审计行数间隔 300」即须开累计审计 task 做全量双轴审计，跨改动视角捕捉逐改动审核看不到的漂移；审计收尾提交在 CONVENTIONS 登记新复位点后才可关闭下一个 task。复位点 T-177（2485f29）起窗口内 git 实况 8 个提交（lint task_commit_span 口径，lint 实测窗口语义行 425）：

- 733df3f 📌 计划(activity-pane): 关闭 T-177 累计审计并登记新复位点（T-177，纯文档）
- 8aa20a2 📌 计划(activity-pane): 关闭 T-176 紧凑档确认按钮（T-176，纯 task）
- 253aa8f ⭐ 功能(activity-pane): 紧凑档标题行内嵌工作区名胶囊（T-178 实现）
- 80f1553 🧪 测试(activity-pane): 审核收口——无归属兜底与截断断言及 42% 取舍补记（T-178）
- 9290da5 📌 计划(activity-pane): 关闭 T-178 紧凑档工作区名胶囊（T-178）
- 6b0f95e 🧪 测试(activity-pane): 复审 nit 收口——task 证据指针与断言消息插值（T-178）
- b5c4979 ⭐ 功能(activity-pane): 紧凑档工作区名胶囊移行尾固定宽并移除耗费时长（T-179）
- b23fe4e 🧪 测试(activity-pane): 审核收口——锚定口径、DOMAIN 词条与注释同步（T-179）

## 差距评估

- 窗口 8 提交中 4 笔（T-176/T-177 收口与 T-178 实现/审核收口）已有独立双轴审核收口，本轮按累计视角复核其证据引用真实性；核心审计对象为 T-178→T-179 两步演进后的口径收敛。
- 窗口语义行 425（lint 实测 2485f29..b23fe4e），其中 T-179 实现与收口为主体新增。
- 审计前已知缺口：acceptance.mjs 等非 diff 文件不在逐改动 sweep 半径内，为累计审计重点排查对象。

## 收敛方案

1. 双轴独立子代理审计（code-review skill 流程），固定点 2485f29、HEAD b23fe4e。
2. Spec 轴：逐提交对照其 task/需求锚点（T-178 关闭链与 T-179 实现），重点跨改动漂移——T-178 胶囊形态（行内弹性宽 42%）与 T-179 行尾固定宽 84px 的口径演化一致性、PRD/SOLUTION 连续演进的措辞漂移、DOMAIN 词条（工作区名胶囊）与实现一致性。
3. Standards 轴：累计重复/漂移（两轮胶囊改动的 CSS 规则演化残留、断言口径一致性）、CONVENTIONS 硬约束、bundle 同步完整性。
4. 发现分级处置：blocking 修复循环，non-blocking 记录。

## 测试计划

- 审计执行=双轴独立子代理（Spec/Standards），静态核验 + `node scripts/check.mjs` HEAD 复跑；修复后由原审核方复审 blocking 清零。
- 关闭前机械门禁：agentmap lint（复位点登记随本 task 关闭提交生效）、pnpm check、全量 pnpm verify 复跑于 T-179 关闭后。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：窗口内每笔改动的 spec 符合性逐条核验 | `e2e/specs/compact-density.mjs#R-01-021/AC-10`+`src/client.mjs::makeWorkspacePill` 断言组、`scripts/check.mjs#check: all assertions passed` |
| 异常 | 适用：累计口径下异常路径（hidden 兜底、补建守卫）跨改动一致性 | `e2e/specs/compact-density.mjs::pillHiddenGate`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：固定宽 84px 与 42% 旧口径、24×24 命中区等多版本几何承诺的文档-实现同步 | `e2e/specs/compact-density.mjs::headAckState`、`e2e/specs/compact-density.mjs::headWorkspaceState` |
| 副作用 | 适用：时长隐藏对滚动锚定与热路径的影响复核 | `e2e/specs/card-content.mjs#R-01-003/AC-03`+`e2e/specs/compact-density.mjs::compactTotalHidden`、`e2e/specs/mobile-thermal.mjs#T-127`+`src/client.mjs::renderCardInto` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION.md 核对日期与 374/250 行补记（审计发现 NB2/NB4） | DESIGN | 文档 | 登记 | `SOLUTION.md::R-01-021/AC-10` 契约段（仅枚举补列与过时句改写，随审计收口提交） |

## 自查清单

- [x] 窗口完整性：2485f29..b23fe4e 全部提交纳入——git 实况 8 提交（任务书初稿列 4，Spec 轴审计按 git 实况补齐为 8 笔并逐笔轻核：733df3f T-177 收口、8aa20a2 T-176 关闭、253aa8f/80f1553 T-178 实现/收口均为纯文档或已独立双轴审核收口的提交）。
- [x] 跨改动视角：T-176/T-178/T-179 三轮同区域改动的累计漂移（几何口径 42%→84px、断言演化、CSS 演化）专项检查——Spec 轴证实六处承诺面收敛、旧口径零残留。
- [x] 审计独立性：审核方与实现上下文分离（双轴独立子代理），发现逐条带 file_path:line。

## 终态与证据

- 实现: 双轴独立子代理审计（Spec=6c4f0c31、Standards=f13cc3ba，固定点 2485f29..b23fe4e 按 git 实况 8 提交全量核验）——Standards 轴 blocking 1（F-1 acceptance.mjs:233 人工验收清单仍指示核实已撤回的紧凑档累计时长承诺，sweep 半径外文件漂移）+ non-blocking F-2（e2e 注释残留「耗时」）；Spec 轴无 blocking + non-blocking 4（NB1 density-resource.mjs:3/:80-81 注释残留 T-178 承诺、NB2 SOLUTION:374 枚举缺数量注、NB3 同 F-2、NB4 SOLUTION.md:250 窗口外既有过时描述）。全部修复落地：acceptance.mjs:233（F-1，可见信息口径+R-01-025/AC-07 指针）、compact-density.mjs:160/:201（F-2/NB3 归一 canonical）、density-resource.mjs:1-4/:80-81（NB1 数据通道口径）、SOLUTION.md:374 枚举补数量注（NB2）、SOLUTION.md:250 过时句改写（NB4）。
- 测试: node scripts/check.mjs HEAD 全过（Standards 轴审计中复跑，exit=0）；node --check 三文件过；compact-density/density-resource 单跑 PASS（b23fe4e 时点回执 21.6s/15.0s）；修复后全量 pnpm verify 复跑于关闭提交后（本 task 关闭提交与 T-179 关闭提交完成后）。
- SOLUTION 对照: 本审计为审计型 task，SOLUTION 无独立目标态——对照结论=窗口内两步演进（T-178→T-179）后 PRD/SOLUTION/DOMAIN/e2e/bundle/注释六处口径收敛一致（Spec 轴核验），SOLUTION 374/250 两处过时枚举随本轮修复（NB2/NB4）对齐现状。
- commit: b23fe4e（审计窗口端点 2485f29..b23fe4e；复位点登记随本关闭提交生效）
- review:
  - 审核方: 6c4f0c31（Spec 轴）+ f13cc3ba（Standards 轴），独立上下文，窗口 2485f29..b23fe4e
  - 目的理解: 窗口为紧凑档工作区名胶囊两步演进（T-178 行内弹性宽→T-179 行尾固定宽 84px+累计时长移出）的收口链；约束=PRD R-01-021/AC-02/AC-09/AC-10、R-01-025/AC-07、R-01-003/AC-06 紧凑例外、R-01-023/AC-10 数量注承载、DOMAIN canonical（工作区名胶囊、累计运行时长）；预期行为=行尾固定宽居中成列、标题对齐、截断不换行、无归属不显示、时长仅紧凑隐藏
  - 执行方式: code-review skill 双轴（Spec=逐提交 spec 源对照+跨改动漂移专项；Standards=CONVENTIONS/DOMAIN 术语/smell 基线+累计视角专项）；静态核验+check.mjs HEAD 复跑
  - 问题与修复: Standards F-1（acceptance.mjs:233 人工验收指示与撤回承诺矛盾）→ 一行改写；F-2=NB3 注释「耗时」归一；Spec NB1 density-resource 头注释+行内注释残留 T-178 承诺 → 改「数据通道照常推进、紧凑档不显示」口径；NB2 SOLUTION 374 枚举补「后台任务数量注」；NB4 SOLUTION 250 过时句改写（窗口外既有漂移，累计审计浮出）。F-1/F-2 经 Standards 复审逐项实码核验通过（blocking 清零、non-blocking 清零）
  - 复审结论: Standards 轴「blocking 清零，non-blocking 清零（窗口内全部解决），审计通过」（复审二轮确认）；Spec 轴「无 blocking，审计通过」——T-180 收口时四提交之外的 extra 4 笔已轻核，窗口清单按 git 实况补齐为 8 提交
- 残余风险（两轴审计记录在案）: 热更 stale 骨架胶囊滞留（补建只补缺不迁位，过渡帧瞬态）；数量注紧凑可见无 e2e 断言（既有缺口）；R-01-025/AC-07 前半句实时更新失去动态断言载体（结构同源双写承载）；几何断言仅覆盖完成卡；acceptance.mjs 无机械校验（F-1 类漂移只能靠审计发现，可考虑 R-ID 对账轻量 lint）。
