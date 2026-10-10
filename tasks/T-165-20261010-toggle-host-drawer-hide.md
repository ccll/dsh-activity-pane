---
doc-type: task
mutation: lifecycle
id: T-165
---

# T-165 宿主侧栏抽屉打开期间隐藏「活动」开关

状态: active
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

（待实现完成后填写）
