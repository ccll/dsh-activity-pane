---
doc-type: task
mutation: lifecycle
id: T-179
---

# T-179 紧凑档胶囊移行尾固定宽并移除耗费时长

状态: completed
类型: 功能
风险等级: major
风险面: 无（纯呈现层布局演进，不触及契约、资金、数据迁移、对外接口、鉴权）
关联需求: R-01-021（AC-02、AC-09、AC-10）、R-01-025/AC-07、R-01-003/AC-06
决策依据: 东家反馈（m01472，紧凑档实用截图）——胶囊紧贴标题使标题起点随名称长短参差、空间不足；东家拍板：耗费时长移出紧凑标题行、胶囊移至行尾原耗时位置并固定宽度、超长省略（确认 84px 与文字居中，m01487）。

## 背景与目标

T-178 交付的行内胶囊（状态点与标题之间、fit-content 弹性宽）在真实使用中暴露两点：工作区名称长短不一使各卡标题起点无法对齐，观感凌乱；标题行空间被胶囊与时长同时挤占。东家决定：耗时移出紧凑标题行，胶囊移至行尾原耗时位置并固定宽度（84px）、超长省略——标题起点自然对齐，胶囊右缘成列。

## 差距评估

- PRD：R-01-021/AC-02 保留枚举仍含「行内右缘信息」、AC-09「行内右缘信息之后」、AC-10 位置句「状态点与会话标题之间」与「标题行宽度不足」弹性截断句均与新形态不符；R-01-025/AC-07 承诺「累计运行时长照常显示」与新形态冲突。
- SOLUTION：374 段胶囊句为「状态点与标题之间 + max-width 42%」旧形态；378 行「累计运行时长照常更新」需同步。
- 代码：三态骨架胶囊插位于 dot 之后（src/client.mjs:2980、3000、3031）；CSS 行内胶囊规则（src/client.mjs:658-667）为弹性收缩；e2e 位置断言（afterDot/beforeTitle）与固定宽断言缺失。
- 承诺无变化项：无归属不显示、着色字号槽位契约、双写更新、子代理卡无胶囊（R-01-012/AC-17、AC-18）。

## 收敛方案

1. 骨架顺序：三态行改为 dot → title → pill → （行尾余员）→ total-time（awaiting 完成卡确认按钮插 pill 与 total-time 之间）——胶囊紧贴行尾右缘组。
2. CSS：紧凑行内胶囊规则改 `flex: none; width: 84px; box-sizing: border-box; justify-content: center`（删 `max-width: 42%` 弹性上界与相应注释）；紧凑隐藏块加入 `.dap-total-time`（主卡与子代理卡行内时长一并隐藏，对齐所有标题行起点）。
3. 补建守卫：陈旧骨架补建位置从 dot 之后改为 total-time 之前（行尾语义），守卫条件不变。
4. 渲染层双写（querySelectorAll 循环）不依赖位置，无需改动。
5. e2e：位置断言改为 afterTitle/beforeConfirm（或 beforeTotal）、固定宽 84px 断言、文字居中断言、紧凑下耗时不可见断言、跨卡标题起点对齐断言；截断断言改固定宽口径。

## 测试计划

- e2e/specs/compact-density.mjs：AC-10 断言组改写（位置、固定宽、居中、截断、无归属兜底保留）、新增耗时隐藏与标题对齐断言；中间档互斥断言保留。
- scripts/check.mjs bundle 字面断言随 row.append 顺序同步。
- MANUAL：紧凑档多卡截图（对齐观感）+ 中间/完整档回归（耗时仍在）。
- 测试影响：PRD R-01-021/AC-02、AC-09、AC-10、R-01-025/AC-07 变更 → compact-density 锚点更新（R-01-021/AC-02 新增锚定行）。

## 风险等级: major

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-020/AC-01 | 修改：补紧凑呈现例外指针（R-01-025/AC-07，N-1 审核发现） | E2E | 新增 | `e2e/specs/density-resource.mjs::totalHidden` 紧凑不可见断言 |
| SOLUTION | 方案层演进：紧凑档行尾固定宽胶囊与时长移除（374 段、378 资源纪律行）与术语统一 | E2E | update | `e2e/specs/compact-density.mjs#R-01-021/AC-10`+`src/client.mjs::makeWorkspacePill` |
| R-01-021/AC-02 | 修改：保留枚举改「状态点、会话标题与行尾的工作区名胶囊」，隐藏清单加行内右缘耗费时长 | E2E | update | compact-density 耗时不可见断言（compactTotalHidden） |
| R-01-021/AC-09 | 修改：✓ 位置句改「工作区名胶囊之后」 | E2E | 改写 | afterInlinePill 断言 |
| R-01-021/AC-10 | 修改：位置改行尾、固定宽 84px、文字居中、截断固定宽口径 | E2E | 改写+新增 | afterTitle/beforeTail、widthPx、centered、截断断言 |
| R-01-025/AC-07 | 修改：耗时句改「紧凑档不显示」 | E2E | 新增 | compactTotalHidden 断言 |
| R-01-003/AC-06、AC-07、AC-08 | 不变（无图标形态与槽位契约，胶囊复用） | E2E | 保留 | 无图标/字号/着色断言沿用 |
| R-01-012/AC-17、AC-18 | 不变 | E2E | 保留 | 子代理卡不加胶囊承诺不变 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：紧凑档胶囊行尾固定宽居中、标题起点对齐、耗时不可见 | `e2e/specs/compact-density.mjs#R-01-021/AC-10` 锚定断言组、`src/client.mjs::makeWorkspacePill` |
| 异常 | 适用：无归属会话胶囊不显示（hidden 兜底链路在行尾形态下不回归） | `e2e/specs/compact-density.mjs::pillHiddenGate`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：超长名称在固定宽内省略截断不换行、确认按钮几何不受行序调整影响 | `e2e/specs/compact-density.mjs#R-01-021/AC-10` 截断断言、`e2e/specs/compact-density.mjs::headAckState` |
| 副作用 | 适用：中间/完整档耗时呈现与标题行框不受影响；mobile 热路径预算不回退 | `e2e/specs/card-content.mjs#R-01-003/AC-03`、`e2e/specs/mobile-thermal.mjs#T-127`、`src/client.mjs::renderCardInto` |

## 自查清单

- [x] 边界：无归属会话（hidden 门控）在行尾形态下仍不显示；超长名称固定宽内省略截断——`e2e/specs/compact-density.mjs::pillHiddenGate`（hidden 兜底，compact 展示规则不压过同特异性后声明兜底）与截断断言（省略截断/nowrap/不撑破行框/行高不变）覆盖。
- [x] 异常路径：补建守卫对陈旧骨架在行尾语义下落位正确（total-time 前插入，total 缺失时 append 与既有惯例同构）；确认按钮在工作区名胶囊之后保持最右端（headAckState afterInlinePill 断言）。
- [x] 回归影响：中间/完整档行布局与耗时显示不变（card-content/midpass 断言未动）；子代理卡与后台任务卡无 :scope > .dap-workspace 误补建（kind 门控经审核核验）；T-176 确认按钮几何断言（headAckState 24×24/pseudoBox）随 compact-density 复跑通过；全量 verify 22/22 PASS（见测试行）。

## 终态与证据

- 实现: 行尾固定宽工作区名胶囊（东家反馈 m01472 标题起点不对齐、耗时移出腾位）——三态骨架 row.append 顺序 dot→title→pill→（jobs-chip/confirm）→total-time（recent/awaiting/running，src/client.mjs:2985/3006/3038）；补建守卫改 total-time 前插（:3576-3585，守卫条件不变）；CSS compact 行内胶囊 display:flex;flex:none;width:84px;box-sizing:border-box;justify-content:center（:666-668，删 42% 口径）、紧凑隐藏块加 .dap-total-time（:287-299）；bundle 同步（.dsh-plugin/client.js:3481-3484）。PRD 四处（AC-02 枚举+数量注、AC-09、AC-10 重写、R-01-025/AC-07）、SOLUTION 两处、DOMAIN:46 词条、R-01-020/AC-01 紧凑例外指针（N-1 审核发现）。
- 测试: e2e compact-density 改写（固定宽 84±0.5/居中/跨卡 title 左缘偏差 ≤0.5/compactTotalHidden/截断固定宽口径/pillHiddenGate/pillTruncate，21.6s PASS）+ density-resource 新增 totalHidden 不可见断言（R-01-025/AC-07，锚 R-01-020/AC-01 例外指针，15.0s PASS）+ card-content/mobile-thermal/density-resource 回归 PASS + 全量 verify 22/22（b5c4979 上 lint 因累计审计触发停 dispatcher，e2e 全绿于 T-178 复审轮 80f1553 且复跑于关闭后）+ MANUAL 探针四卡 titleLefts=[314,314,314,314] 全对齐、pillWidth=84、centered=true、totalDisplay=none（截图 /tmp/t179-manual/1-compact-aligned.png，/tmp 易失留痕）；check.mjs 全过。
- SOLUTION 对照: SOLUTION.md:374（胶囊句：行尾、固定宽 84px border-box、文字居中、东家反馈理由）、:378（标题行可见信息照常更新；累计运行时长在紧凑档随标题行裁剪不再显示）、:327 追溯索引与 PRD 四处（AC-02/AC-09/AC-10、R-01-025/AC-07）对照一致；核对日期 2026-10-22。
- commit: b5c4979（实现）、b23fe4e（审核收口——锚定口径、DOMAIN 词条与注释同步）
- 语义行数: 367
- 语义行数口径: 367 为实现者实测（git diff -M 8aa20a2..b23fe4e 剥注释空行、排除 .dsh-plugin/，含 T-178 关闭与 nit 两个相邻提交的文档改动）；lint task_commit_span 口径（b5c4979..b23fe4e）以 lint 实测为准，两口径均 >50，major 定档不变。
- review:
  - 审核方: a260aa4a（Spec 轴）+ b028c17e（Standards 轴），独立上下文，固定点 6b0f95e..b5c4979（复审覆盖至 b23fe4e）
  - 目的理解: 紧凑档工作区名胶囊由状态点后内嵌改行尾固定宽 84px（东家 m01472 反馈标题起点不齐）、耗时移出紧凑标题行（R-01-025/AC-07 不显示），PRD 四处/SOLUTION 两处/DOMAIN 词条同步演进；约束=标题起点跨卡对齐、截断不换行、槽位着色与 10.5px 字号契约保持、R-01-020/AC-01 显示承诺的紧凑例外须显式指针
  - 执行方式: code-review skill 双轴（Spec 轴对照 task/PRD AC-02/AC-09/AC-10/R-01-025/AC-07 与 SOLUTION 374/378/327；Standards 轴对照 CONVENTIONS 提交体例/AC 同次触碰、DOMAIN 术语表、smell 基线 12 条 judgement call）；修复 b23fe4e 后双方复审
  - 问题与修复: Spec 轴 4 项 non-blocking（N-1 R-01-020/AC-01 例外指针缺位→补指针+锚点；N-2 AC-02 枚举缺数量注→补列；N-3 重复键删；N-4 titleLeft 死字段删）+ Standards 2 blocking（F1 density-resource AC-07 锚定宣称漂移→补 totalHidden 不可见断言、F2 DOMAIN 词条陈旧+「耗费时长」同义新词全仓归 canonical）+ F5 注释残留+bundle 同步、F6 titleLeft（与 N-4 同位）——全部修复于 b23fe4e，复审通过
  - 复审结论: Spec 轴「四项全闭环，通过（blocking 0）」；Standards 轴「F1-F6 全部解决，blocking 清零，复审通过」；双方均声明未复跑浏览器端 e2e（静态核验+执行方单跑回执），关闭前全量 verify 按流程复跑；复审以 b23fe4e 实码逐项对照核验（非采信自述），F1-F6/N-1~N-4 全部解决，两轴 blocking 清零
- 残余风险（审核记录在案 non-blocking）: 热更 stale 骨架胶囊滞留行中（守卫只补缺不迁位，瞬态纯观感）；胶囊右缘成列无跨卡直接断言；紧凑档数量注无断言（R-01-023/AC-10 既有缺口）；titleAlignment 对齐断言取前两张 done 卡（同工作区夹具下机制正确性由固定宽+位置断言承载）；total 隐藏节点每帧仍写（三档同码惯例，AC-05 不违约）；mobile MANUAL 截图未补（桌面 MANUAL 已录 /tmp/t179-manual/）。
