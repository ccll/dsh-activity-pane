---
doc-type: task
mutation: lifecycle
id: T-179
---

# T-179 紧凑档胶囊移行尾固定宽并移除耗费时长

状态: active
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
| SOLUTION | 方案层演进：紧凑档行尾固定宽胶囊与耗时移除（374 段、378 资源纪律行） | E2E | update | `e2e/specs/compact-density.mjs` 胶囊断言组改写 |
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

- [ ] 边界：无归属会话（hidden 门控）在行尾形态下仍不显示；超长名称固定宽内省略截断。
- [ ] 异常路径：补建守卫对陈旧骨架在行尾语义下落位正确（total-time 前插入）；确认按钮在工作区名胶囊之后保持最右端。
- [ ] 回归影响：中间/完整档行布局与耗时显示不变；子代理卡与后台任务卡不受胶囊规则影响（无 :scope > .dap-workspace 误补建）；T-176 确认按钮几何断言复跑通过。

## 终态与证据

- 实现: 待填
- 测试: 待补
- SOLUTION 对照: 待补
- commit: 待补
