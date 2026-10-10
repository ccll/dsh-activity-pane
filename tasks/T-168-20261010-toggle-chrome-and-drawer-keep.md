---
doc-type: task
mutation: lifecycle
id: T-168
---

# T-168 开关去外层胶囊壳 + 宿主抽屉打开期间保留原位被遮挡

状态: active
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家两项指示（本 task 直接来源）：

1. 开关胶囊去除外层边框，只留内部涂色的小胶囊（计数徽标本体）。
2. 空白页（hero 形态）下弹出并收回宿主左边栏抽屉。
   - 现象：开关延迟一小段时间，才突然出现，而不是一直在那里。
   - 期望呈现：开关一直在抽屉后面，只是被挡住，而不是摘除后凭空重现。

根因（代码与壳层源码核实）：

- 外层胶囊壳：`.dap-toggle` 基规则携带 `border` + 深色底 `rgba(24,28,38,.94)` + `box-shadow`。
  - 内部 `.dap-toggle-count` 才是计数胶囊本体。
  - 浅色主题另有 `body:not([data-ds-dark-theme]) .dap-toggle` 底色覆盖。
- hero 态延迟重现：宿主抽屉打开时壳层在 `drawerOpen()` 翻转的同一 reconciler 遍内移除 ⊡。
  - 依据 overlay-backdrop-fab `ensure`：`(!heroPhase() || drawerOpen()) && fab !== null → fab.remove()`。
  - `placeToggle` 锚不可测即 `toggle.remove()`，开关被摘。
  - 关抽屉时属性先翻转、重挂 ⊡ 晚于翻转（T-167 已探明），恢复靠 frame 观察器翻转即检 + 400ms 复检。
  - 开关在这段窗口内不在文档，表现为「延迟后凭空出现」。
- T-165 引入的 `data-host-drawer-open` visibility 隐藏是层级逃逸时代的补偿。
  - T-167 层级归位（嵌入 z:1、hero z:1060，均低于遮罩 1250/抽屉 1300）后遮挡已由层级承载。
  - 隐藏机制成为突变的直接来源。

## 差距评估

- `src/client.mjs` CSS：`.dap-toggle` 基规则的 border/background/box-shadow 与浅色覆盖需去除。
- `src/client.mjs` `placeToggle`：hero 分支锚缺失一律摘除，需改为已落位则保留原位。
- `src/client.mjs`：`syncHostDrawer`、pointer 监听与 `data-host-drawer-open` 样式规则整体失去消费者，需随之摘除。
- `scripts/check.mjs`：外层壳底色断言、宿主抽屉隐藏断言组、hero 摘除断言需改写。
- `e2e/specs/mobile-drawer.mjs`：「摘除后恢复」段断言的是旧缺陷行为，需改写为「锚缺失期间开关保留原位」。
- PRD R-01-008/AC-04 子句与 SOLUTION 开关机制段同步（东家确认的需求变更）。

## 收敛方案

- CSS：`.dap-toggle` 基规则去除 `border`、`background`、`box-shadow`。
  - 保留钉宽、padding 与内层徽标样式。
  - 外层壳消失后按钮可见形态即内部计数胶囊；padding 保留触达面积。
- CSS：删除浅色主题 `.dap-toggle` 底色覆盖规则。
- JS `placeToggle` hero 分支：锚或 frame 不可得时，已落位开关保留原位几何。
  - 抽屉与遮罩（1300/1250）在层级上盖住它。
  - 未落位（不在文档）维持不渲染；`toggle.remove()` 保留 cleanup 与壳层结构缺失（frame 不可得且开关已挂载）两处路径。
- JS：删除 `syncHostDrawer`、`scheduleHostDrawerCheck`、pointer 监听及其 cleanup、`data-host-drawer-open` 全部消费点。
- 保留 frame 属性观察器（`data-sidebar-collapsed` 翻转 → placeToggle）。
  - 关抽屉后 ⊡ 重挂晚于属性翻转，翻转即检扑空时由 400ms 复检重跑落位。
  - 开关未摘除，复检为同值重写，无观感突变。
- PRD R-01-008/AC-04 子句改写（东家确认）。
- SOLUTION 开关机制段同步。
- RATIONALE 增 C-094。

## 测试计划

- `scripts/check.mjs`：外层壳断言——基规则显式压掉 UA 默认按钮壳、无旧描边/底色/投影、浅色覆盖删除。
  - 宿主抽屉隐藏断言组删除，改为宿主抽屉隐藏检测整体摘除断言。
  - hero 摘除收窄断言（remove 仅限壳层结构缺失且已挂载）替代原摘除断言；锚缺失保留原位由 e2e 行为断言承载。
- `e2e/specs/mobile-drawer.mjs`：「摘除后恢复」段改写为「锚缺失期间开关保留原位几何、锚回归后重锚同值」；新增外层壳去除的计算样式断言（无描边/底色/投影、内胶囊保留涂色）。
- `scripts/acceptance.mjs`：R-01-008/AC-04 人工条目同步（徽标本体呈现、抽屉开合全程遮挡与原位复现；清除 T-167 已删除兜底浮层的陈旧描述）。
- `pnpm verify:fast`；全量 `pnpm verify`。
  - GUI 现场验证：hero 页开合宿主抽屉全程开关被遮挡、无突变。
  - WebKit 移动壳层探针（iPhone 13 描述符 + 触屏 + 390×844，与东家同实例）：外层壳计算样式、抽屉开合全程开关在场被遮挡、关闭即现、几何稳定。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关仅呈现计数胶囊本体；hero 页抽屉开合全程开关保留原位被遮挡、无突变 | `scripts/check.mjs#R-01-008/AC-04`、`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| 异常 | 适用：frame 不可得（壳层结构缺失）时仍摘除；锚缺失但开关已落位时，保留原位（宿主改版残留为记录边界） | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：仅移动断点内生效；插件自身抽屉打开的隐藏（AC-05）不受影响；关抽屉复检节奏沿用 T-167 | `scripts/check.mjs#R-01-008/AC-05`、`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| 副作用 | 适用：删除 pointer 监听与 syncHostDrawer 减少 rAF 与定时器唤醒，不新增任何 rAF；cleanup 对称 | `e2e/specs/mobile-thermal.mjs::mobileThermal`、`scripts/check.mjs#R-01-008/AC-05` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | 子句改写与新增（不渲染子句限定未落位开关；新增已落位开关抽屉打开期间保留原位被遮挡、关闭后原位可见子句；紧凑形态子句补「仅呈现计数徽标本体、不携带外层底色、描边与投影」） | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-008/AC-04`；`e2e/specs/mobile-drawer.mjs::mobileDrawer`；`scripts/acceptance.mjs#R-01-008/AC-04` |
| R-01-008/AC-05 | 不变（插件自身抽屉的显隐路径未触碰） | UNIT/E2E | regression | `scripts/check.mjs#R-01-008/AC-05`；`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| SOLUTION | 开关机制段更新（外层壳去除、宿主抽屉打开期间保留原位被遮挡、摘除仅限未落位） | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |
| PRD | AC-04 子句演进（东家会话确认：去外层壳、抽屉打开期间保留被遮挡） | UNIT/E2E | update | `scripts/check.mjs#R-01-008/AC-04`；`e2e/specs/mobile-drawer.mjs::mobileDrawer` |
| RATIONALE | 增 C-094（开关恒在抽屉后被遮挡的决策与被否方案） | - | add | 同次变化由本 task 记录 |

## 终态与证据

（实现提交后由关闭提交填写）
