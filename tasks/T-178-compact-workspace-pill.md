---
doc-type: task
mutation: lifecycle
id: T-178
---

# T-178 紧凑档标题行内嵌无图标工作区名胶囊

状态: completed
关联: R-01-021、R-01-003、R-01-025
风险等级: major
风险面: 无（升档依据：语义行数超过阈值，见终态证据语义行数行）

## 背景与目标

东家使用反馈（2026-10-22）：紧凑档仅凭标题有时无法辨识会话归属哪个工作区，但行内空间不足以再开一行。东家拍板形态（对话定案）：标题行内嵌与其它显示档位视觉一致的工作区名胶囊，去掉内部文件夹图标以节省空间；胶囊自带分隔，无需额外连字符。PRD 四处演进（R-01-021/AC-02 改写、新增 AC-10、R-01-003/AC-06 紧凑图标豁免、R-01-025/AC-07 枚举扩充）与 SOLUTION 演进均经东家批准后落笔（2026-10-22）。

承接上下文：T-176 刚为同标题行加入 `.dap-confirm-icon`（行尾图标确认按钮，命中盒 24×24、视觉盒 20×18、行框 16→20px，见 C-098/C-100 关联的收口记录）；本 task 的胶囊插在标题行 `.dap-row` 内状态点与会话标题之间，不触碰确认按钮几何。

## 差距评估

- PRD：R-01-021/AC-02 保留内容枚举无胶囊、AC-10 尚不存在（已演进）。
- SOLUTION：374 行紧凑呈现段、453 行徽标结构段、追溯索引 R-01-021 行已同步胶囊承诺。
- 代码：`src/client.mjs` 三态卡标题行骨架（running 2995-2998、awaiting 2965-2969、recent 2946-2947）在状态点与标题之间无工作区胶囊节点；`.dap-workspace` 现仅存在于 `.dap-card-head` 徽标行且紧凑档被整行隐藏；`renderCardInto`（3531 起）只 `querySelector` 单个徽标节点。
- 测试：compact-density 无标题行胶囊断言。

## 收敛方案

1. `src/client.mjs` `cardChildren`：running/awaiting/recent 三态卡标题行 `.dap-row` 在 `.dap-dot` 与 `.dap-title` 之间插入无图标 `.dap-workspace`（仅 `.dap-workspace-text` 子节点，无图标段）；子代理卡不加（R-01-012/AC-17、AC-18 不变）；job 卡仅完整档构建、不受影响。
2. `renderCardInto`：`querySelector(".dap-workspace")` 改 `querySelectorAll(".dap-workspace")`，对全部胶囊节点按既有逻辑双写 `workspaceTitle`、12 个着色 CSS 变量与无归属 hidden 门控；恢复节点（DOM 复用）同规则处理。
3. CSS：`.dap-row .dap-workspace`（行内胶囊）默认 `display: none`；`[data-density=compact]` 下显示；徽标行 `.dap-card-head .dap-workspace` 在紧凑档维持既有隐藏规则不变（284-295 行隐藏块）。
4. 测试：`e2e/specs/compact-density.mjs` 增断言。

## 测试计划

- E2E（e2e/specs/compact-density.mjs）锚定 R-01-021/AC-02（改写后）、R-01-021/AC-10、R-01-003/AC-06：紧凑下标题行胶囊存在且文本为工作区名、位于状态点与标题之间（无图标）、字号 ≥10.5px；无归属会话胶囊不显示；medium 档该行内节点不可见且独立徽标行可见。
- MANUAL：桌面与移动 UA 浏览器实测紧凑档胶囊着色与截断行为。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：紧凑档标题行内嵌无图标工作区名胶囊（374 段、453 徽标结构段、追溯索引行） | E2E | update | `e2e/specs/compact-density.mjs` 新增胶囊断言 |
| R-01-021/AC-02 | 修改：标题行枚举加工作区名胶囊、隐藏清单改「独立工作区徽标行」 | E2E | 保留+新增 | 紧凑下标题行内容断言新增胶囊项 |
| R-01-021/AC-10 | 新增：无图标胶囊、位置、无归属隐藏、省略截断 | E2E | 新增 | compact-density 胶囊显隐/文本/位置断言 |
| R-01-003/AC-06 | 修改：文件夹图标承诺限定完整/中间档，紧凑豁免 | E2E | 保留+新增 | 既有徽标图标断言保留；新增紧凑胶囊无图标断言 |
| R-01-003/AC-07~AC-12 | 不变（通用槽位契约，胶囊复用） | E2E | 保留 | 徽标着色断言沿用 |
| R-01-025/AC-07 | 修改：标题行可见信息枚举加工作区名 | E2E | 保留+新增 | compact-density 新增胶囊文本非空断言；实时更新复用既有渲染路径（renderCardInto 双写与徽标行同源，无新增订阅） |
| R-01-012/AC-17、AC-18 | 不变 | E2E | 保留 | 子代理卡不加徽标/胶囊承诺不变 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：紧凑档有归属卡片显示无图标胶囊且文本正确 | `e2e/specs/compact-density.mjs#R-01-021/AC-10`、`src/client.mjs::makeWorkspacePill` |
| 异常 | 适用：无归属会话不显示胶囊；工作区名缺失不占位 | `e2e/specs/compact-density.mjs::pillHiddenGate`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：完整/中间档行内胶囊不可见、徽标行形态不变；窄标题行省略截断 | `e2e/specs/compact-density.mjs#R-01-021/AC-10` 截断断言、`src/client.mjs::makeWorkspacePill`、MANUAL 双主题截图（/tmp/t178-manual/，会话易失；可观察行为已由 e2e 断言机械承载） |
| 副作用 | 适用：确认按钮几何（T-176 24×24/20×18）与标题行框不受胶囊插入影响 | `e2e/specs/compact-density.mjs::headAckState` 复跑 |

## 自查清单

- [x] 胶囊在完整/中间档不可见且不影响徽标行既有呈现（回归面）——e2e 中间档互斥断言与确认按钮几何复跑（headAckState）通过。
- [x] 无归属会话（含子代理卡）不出现胶囊，不产生空白占位——pillHiddenGate 兜底断言（hidden→display:none 无占位）与走查背书。
- [x] 胶囊着色与独立徽标行同帧同源（同一身份映射双写），深浅主题核对——MANUAL 浅色/深色双主题实测 computed 着色逐字符同源（截图 /tmp/t178-manual/1-full.png、2-compact.png、3-dark.png）。

## 终态与证据

- 实现: `src/client.mjs` `makeWorkspacePill`（2888-2895，无图标胶囊工厂）、`cardChildren` 三态卡标题行插入（recent/awaiting/running，dot 与 title 之间）、`renderCardInto` `querySelectorAll(".dap-workspace")` 对徽标行与行内胶囊同循环双写（12 着色变量+hidden 门控，3574-3609）+陈旧骨架就地补建（3567-3573，kind 门控+`:scope >` 探测）；CSS 门控三段（默认隐藏→compact 展示→[hidden] 兜底，658-666）与 42% 上界理由注释（662-664）；`pnpm build:client` 同步 `.dsh-plugin/client.js`（字节比对门禁）；`scripts/check.mjs` running 骨架 bundle 字面断言随实现同步。
- 测试: e2e compact-density 单跑 PASS 21.6s（胶囊显隐/无图标/位置夹逼/字号 10.5px/着色/文本非空/pillHiddenGate 兜底/pillTruncate 截断断言组）；card-content、mobile-thermal、density-resource、completion-sync 回归 PASS；全量 verify 22/22 exit=0（bash-3782 于 80f1553；bash-3714 于 253aa8f 同绿；bash-3783 中 repo-entry/mobile-drawer 启动期超时为并行池 flake，单跑复验均 PASS）；`pnpm check` 全过；MANUAL 浅色/深色双主题实测通过（着色与徽标行逐字符同源、行高 16 不变、full 档行内胶囊正确隐藏）。
- SOLUTION 对照: SOLUTION.md 374 段（胶囊句+42% 上界取舍）、453 徽标结构段（无图标形态）、327 追溯索引行与实现一致；PRD 四处演进（R-01-021/AC-02 改写、AC-10 新增、R-01-003/AC-06 紧凑图标豁免、R-01-025/AC-07 枚举）与实现对照无差异；核对日期 2026-10-22。
- commit: 253aa8f、80f1553、6b0f95e
- 语义行数: 178
- 语义行数口径: 178 为自实测（git diff -M 8aa20a2..6b0f95e 剥注释与空行、排除 .dsh-plugin/、含文档与 task 文件；lint task_commit_span 实测以 lint 输出为准，差异为 warning 留痕）
- review:
  - 审核方: 独立上下文双轴子代理（Spec 轴 54841e70、Standards 轴 05a50b54，均非实现上下文）；修复后 Standards 同一审核方复审
  - 目的理解: 紧凑档行内空间不足、仅凭标题无法辨识会话归属，东家拍板标题行内嵌无图标工作区名胶囊——复用 .dap-workspace 几何与槽位着色、CSS [data-density=compact] 门控显隐、renderCardInto 对徽标行与行内胶囊双写同源、陈旧骨架就地补建；约束面含 R-01-003/AC-07~AC-12 槽位契约与 10.5px 字号下限适用、子代理卡无归属承诺不变（R-01-012/AC-17、AC-18）、确认按钮几何不受影响、不新增订阅
  - 执行方式: 双轴独立子代理——Spec 轴对照 task 与上游链（PRD R-01-021/AC-02、AC-10 原文、R-01-003/AC-06、R-01-025/AC-07、SOLUTION 374/453/327 落点）逐句核对并核验实现断言；Standards 轴对照 CONVENTIONS、DOMAIN 术语表、client.mjs 模块边界惯例、12 条 Fowler smell 基线加吞错/缺失校验；固定点 8aa20a2
  - 问题与修复: Spec 轴 N1 无归属兜底断言缺失（补 e2e pillHiddenGate）、N2 截断断言缺失（补 pillTruncate）、N3 42% 未记 SOLUTION（补记 374 段）、N4 覆盖面（记录，骨架本无胶囊、kind 变化全量重建）。Standards 轴 F1 blocking（task 承诺的无归属 e2e 断言缺位）→ 补 pillHiddenGate+pillTruncate 断言（80f1553）并经同一审核方复审通过；F2 DOMAIN「工作区名胶囊」词条登记与紧凑显示枚举同步、F3 42% 取值理由注释（content-box 口径）、F5 断言消息收窄均落地；F4 性能口径（每渲染每卡新增查询与样式读写，mobile-thermal 阈值度量 rAF 频率不度量单帧成本）记残余风险不改码
  - 复审结论: Standards 复审通过 blocking 0（2026-10-22），Spec 轴首轮 non-blocking 无 blocking，全部 non-blocking 处置完毕；残余风险=未来 cardChildren 行内结构变更须同步维护 kind 门控补建、长列表单帧成本增量无守卫（mobile-thermal 度量 rAF 频率不度量单帧成本）、胶囊隐藏态双写路径未被 mobile-thermal 覆盖
