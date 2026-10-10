---
doc-type: task
mutation: lifecycle
id: T-168
---

# T-168 开关去外层胶囊壳 + 宿主抽屉打开期间保留原位被遮挡

状态: completed
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
  - hero 摘除收窄断言（remove 仅限壳层结构缺失且已挂载）替代原摘除断言。
  - 锚缺失保留原位由 e2e 行为断言承载。
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

- 实现: `src/client.mjs` CSS——`.dap-toggle` 基规则去除外层胶囊壳（border/background/box-shadow），并以 `border:none; background:none` 显式压掉 UA 默认按钮壳（appearance:none 不摘除 UA 声明的边框与底色，WebKit 探针实测漏出 2px 灰壳）；删除浅色主题 `.dap-toggle` 底色覆盖；可见形态即 `.dap-toggle-count` 计数徽标本体，padding 与 min-height 保留为触达面积，盒几何不变。JS——`placeToggle` hero 分支锚或 frame 不可得时已落位开关保留原位几何（摘除收窄为壳层结构缺失且开关已挂载），宿主抽屉打开窗口（壳层于 drawerOpen 翻转同遍移除 ⊡）开关不离文档、由抽屉与遮罩（1300/1250）在层级上遮挡；T-165 宿主抽屉隐藏检测整体摘除（syncHostDrawer、scheduleHostDrawerCheck、pointer 监听及其清理、`data-host-drawer-open` CSS 与属性写入），关抽屉后的落位重锚由帧属性观察（`data-sidebar-collapsed` 翻转即检 + 400ms 复检）承载；cleanup 对称。PRD R-01-008/AC-04 子句演进（东家确认）；SOLUTION 开关机制段同步；RATIONALE 增 C-094。commit: 8ce0ebf
- 测试: `pnpm verify:fast` 多轮全绿；`pnpm verify` 两轮 20/20 e2e specs 全绿（含 CSS 修正后 bundle 轮，mobile-thermal rAF 74/69 < 80 阈值）；`scripts/check.mjs` 断言全绿（外层壳显式压掉 UA 壳、旧壳值清零、浅色覆盖删除、宿主抽屉检测摘除、摘除收窄）；`e2e/specs/mobile-drawer.mjs` 新增外层壳计算样式断言（无描边/底色/投影、内胶囊保留涂色）与「锚缺失期间开关保留摘锚前原位（与 heroBox 逐值 ±1 比对）、锚回归后重锚同位」回归；`scripts/acceptance.mjs` R-01-008/AC-04 人工条目同步并清除 T-167 已删兜底浮层陈旧描述。WebKit 移动壳层探针（iPhone 13 描述符 + 触屏 + 390×844，dsh-web-mobile 生效壳层，与东家同实例）14/14 通过：外层壳计算样式清零、内胶囊涂色在场、hero 贴靠几何（x=56 y=16）、抽屉打开期间开关在 DOM/未被隐藏/elementFromPoint 命中抽屉内容（被遮挡）/几何不变、关抽屉全程 25 次采样开关持续在场且几何稳定、关闭后原位可命中；hero/开/关三态截图人工复核。真机最终观感留东家人工验收。
- SOLUTION 对照: 开关机制段（外层壳去除、锚缺失保留原位、摘除收窄、宿主抽屉检测摘除、帧观察重锚、插件抽屉 AC-05 消歧）与实现一致；PRD AC-04 六子句与 check/e2e/acceptance 断言一一对应；C-094 与实现一致，被否方案均未落地。
- commit: 8ce0ebf
- review:
  - 审核方: Standards 子代理 `71c01276-dd0e-4ecd-8a42-aa827f51e913`；Spec 子代理 `9d5f3f62-5386-4a99-ae61-eeff37747daa`。
  - 目的理解: 东家两项指示——开关外层胶囊壳去除、只留内部涂色计数胶囊；hero 页宿主抽屉开合时开关从「摘除后延迟重现」改为「常驻抽屉后被遮挡」；约束为外层壳彻底去除（含 UA 默认按钮壳）、已落位开关保留不摘除、摘除仅限壳层结构缺失、AC-05 插件抽屉显隐不变、无死引用、cleanup 对称、无新增 rAF。
  - 执行方式: `code-review` skill 双轴并行（Standards/Spec），基线 HEAD=c48a5dd，范围为工作树 diff；两轴各一轮修复后复审。
  - 问题与修复: Standards 一轮 2 硬 + 5 判——PRD AC-04 两子句一行多规则（拆分）、紧凑形态子句一行三规则且同义复述（拆分删复述）、SOLUTION 多余抽屉状态条件（删）、C-094 决策段超长句（短句化）、含糊量词（SOLUTION 改可判定措辞；东家原话引述豁免）、check.mjs 注释匹配断言脆弱且与相邻断言重复（删，留 remove 条件断言）、e2e frame 属性操作形状重复（提 helper）；复审另报 helper 归一化缺陷（`?.parentElement` 得 undefined 时守卫失效，补 `?? null`）、check.mjs 断言重复行（删）、e2e 断言消息与注释措辞不一致及文件头覆盖清单缺项（改）。Spec 一轮 4 LOW——e2e kept 断言弱于测试计划（改 heroBox 逐值 ±1 比对）、task 收敛方案 remove 范围条目过宽（对齐实现）、SOLUTION:188 误引 AC-04（收窄 AC-05 并新增 AC-04 条目消歧）、e2e 陈旧注释描述已删机制（如实改写）。
  - 复审结论: 两轴复审均确认全部发现关闭、无新问题、无修复不当；残余风险记录在案——宿主 reconciler 在抽屉打开窗口重建 frame 子树可连带丢弃开关且保留分支不回挂（e2e 未模拟子树 churn）、宿主改版后锚不再回归时开关残留最后有效位置（SOLUTION 记录为边界）、真机最终观感留东家人工验收。
