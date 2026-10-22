---
doc-type: task
mutation: lifecycle
id: T-178
---

# T-178 紧凑档标题行内嵌无图标工作区名胶囊

状态: active
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
| 边界配置 | 适用：完整/中间档行内胶囊不可见、徽标行形态不变；窄标题行省略截断 | `e2e/specs/compact-density.mjs#R-01-021/AC-10` 截断断言、`src/client.mjs::makeWorkspacePill`、MANUAL 截图留痕 /tmp/t178-manual/ |
| 副作用 | 适用：确认按钮几何（T-176 24×24/20×18）与标题行框不受胶囊插入影响 | `e2e/specs/compact-density.mjs::headAckState` 复跑、`e2e/specs/mobile-thermal.mjs::paneComputedVisibility` |

## 自查清单

- [ ] 胶囊在完整/中间档不可见且不影响徽标行既有呈现（回归面）。
- [ ] 无归属会话（含子代理卡）不出现胶囊，不产生空白占位。
- [ ] 胶囊着色与独立徽标行同帧同源（同一身份映射双写），深浅主题核对。

## 终态与证据

- 实现: 待填
- 测试: 待补
- SOLUTION 对照: 待补
- commit: 待补
