---
doc-type: task
mutation: lifecycle
id: T-165
---

# T-165 宿主侧栏抽屉打开期间隐藏「活动」开关

状态: completed
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家真机反馈（附截图）：「不开边栏看起来正常，但开了边栏还是盖在上面」——宿主移动端侧栏抽屉打开时，开关浮在抽屉内容之上（抽屉背后可见）。

机理：宿主抽屉开合不经过插件状态；抽屉打开时 sidebar 槽位列由收起栏（~55px）展开为抽屉（~280px）并占据整屏，开关无论嵌入（被抽屉覆盖）还是兜底（fixed 高层级，会浮在抽屉之上）都无保留意义。热更泄漏假说已用真实 hmr 通道实验排除（三次热更后开关/窗格/遮罩计数恒 1）。

## 差距评估

- `src/client.mjs`：无宿主抽屉开合感知，抽屉打开期间开关仍渲染于抽屉之上（真机截图证据）。
- 抽屉开合判据：`[data-slot=sidebar]` 槽位本体处于 0 宽裁剪壳内（实测恒 0），其父宿主列宽度在收起栏（~56px）与抽屉（~280px）间切换，可作免哈希类判据。

## 收敛方案

- `src/client.mjs`：`syncHostDrawer` 沿 `[data-slot=sidebar]` 父链取首个非零宽实测，> 100px 判抽屉打开，写 `data-host-drawer-open`；触发复用 pointer 合帧 + 400ms 延迟复检（抽屉开合由点击驱动且带过渡动画）；cleanup 摘除监听。
- CSS：`[data-host-drawer-open]` 以 `visibility:hidden + pointer-events:none` 隐藏（盒子保留，复检可继续量测，状态可自行恢复；不可见期间不拦截点击）。
- 判据耦合说明：阈值 100px 依赖宿主收起栏窄于 100px 的现状，宿主改版加宽收起栏会误判，记录为边界。

## 测试计划

- `scripts/check.mjs`：新增抽屉隐藏规则与判定函数断言。
- `e2e/specs/mobile-drawer.mjs`：沿用（真机抽屉观感留人工；宿主抽屉开合驱动非本插件状态，e2e 以行为级探针验证）。
- `pnpm verify:fast`；全量 `pnpm verify`；真实环境探针：抽屉开→隐藏、关→恢复。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：宿主抽屉打开时开关隐藏、关闭后恢复；抽屉关闭态开关行为不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-05` |
| 异常 | 适用：宿主改版使阈值失真分两向——收起栏加宽超过 100px 时关闭态也判开、开关常隐（移动端入口丢失）；槽位消失或抽屉变窄时恢复常显（退化为原行为） | `src/client.mjs::syncHostDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 边界配置 | 适用：判定仅在移动断点内生效（桌面清标记）；宿主收起栏加宽超过 100px 时关闭态误判为开、开关常隐（移动端入口丢失），槽位消失或抽屉变窄时恢复常显 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::syncHostDrawer` |
| 副作用 | 适用：监听随 cleanup 摘除、visibility 保留盒子使状态可自行恢复、抽屉/遮罩交互不变 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::cleanup` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | 实现加固（宿主抽屉打开期间隐藏开关），AC 正文不变 | UNIT/E2E | update | `scripts/check.mjs` 抽屉隐藏断言；`e2e/specs/mobile-drawer.mjs` 沿用 |
| SOLUTION | 开关机制段补宿主抽屉隐藏一条（含 0 宽壳/父链/阈值 100px 判据细节） | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |
| DOMAIN | 新增词条「宿主侧栏抽屉」（与插件「抽屉」消歧） | - | add | 同次变化由本 task 记录：新词汇先登记再使用 |

## 终态与证据

- 实现: `src/client.mjs` 新增 `syncHostDrawer`/`scheduleHostDrawerCheck`（sidebar 槽位 0 宽壳沿父链取首个非零宽实测、阈值 100px、移动断点门、pointer 合帧 + 400ms 延迟复检 + 注入初始同步 + ensurePane 公共出口 `placeToggle(); syncHostDrawer();` 每次同步复检）；抽屉打开期间 `.dap-toggle[data-host-drawer-open]` 以 `visibility:hidden + pointer-events:none` 隐藏；监听随 cleanup 对称摘除。DOMAIN 登记词条「宿主侧栏抽屉」。commit: 9304e86
- 测试: `pnpm verify` 全绿（最终工作树单跑，20/20 e2e specs 含 recent-infinite-scroll 断点跨越场景复绿）；真实环境探针实测抽屉开→隐藏、关→恢复；东家真机截图（14:57）证实抽屉打开时胶囊浮于其上为本 task 缺陷现场。真机最终观感留人工验收。
- SOLUTION 对照: 开关机制段补宿主抽屉隐藏一条（判据细节齐备）；DOMAIN 词条登记；PRD AC 正文未动（不遮挡条款的缺陷修复）。
- commit: 9304e86
- review:
  - 审核方: Standards 子代理 `1da75520-9e4c-414c-8e85-80ecc08cff15`；Spec 子代理 `9402f6bc-8f64-4c3e-ae64-bf76ed60ebfa`。
  - 目的理解: 东家真机抽屉打开时开关浮于宿主抽屉之上（兜底态 fixed 高层级逃逸覆盖层）；约束为判据不耦合宿主哈希类、监听 cleanup 对称、visibility 保留盒子可自行恢复、map 不变（缺陷修复短路）。
  - 执行方式: `code-review` skill；固定基线 HEAD=5662875，范围为工作树 diff（实现提交 9304e86）+ 新增 task；Standards/Spec 双轴并行审核，各两轮（初审 + 补丁复审 + 终审）。
  - 问题与修复: Standards 一轮 1 hard + 6 项——DOMAIN 词条未登记（hard，已登记「宿主侧栏抽屉」消歧）、CSS 注释动机不精确（改写为嵌入态免标题行重排）、rAF/timer 重复与 flag 名实偏差（统一回调、更名 hostDrawerFrameQueued）、SOLUTION 判据细节缺（补 0 宽壳/父链/阈值）、55/56px 数字漂移（统一 ~56px）、断言引号风格（改单引号）；Spec 一轮 5 项——验证矩阵异常行失真（改双向如实：加宽收起栏误判为开则开关常隐、槽位消失/变窄恢复常显）、无初始同步（补注入时一次调用）、判定函数断言只做一半（补裸选择器与 cleanup 摘除断言）、SOLUTION 未承载阈值关键量（补齐）、tmp-rc-diff/ 卫生（保持未跟踪）。全量验证暴露断点跨越真实回归（桌面侧栏列 280>100 恒判抽屉开、开关常隐致 recent-infinite-scroll 超时）——补断点门（桌面清标记）与公共出口复检，初审两轮迭代（兜底分支末尾不覆盖嵌入早退路径，上移 ensurePane 公共出口）后双轴终审通过。全部闭合。
  - 复审结论: Standards 轴维持闭合（hard 1 项修复，judgement call 全部处置，调用点全量核对无冗余）；Spec 轴维持闭合（中 1 低 3 信息 1 全部核销，断点往返残留消除）；双轴确认补丁无新问题。
