---
doc-type: task
mutation: lifecycle
id: T-033
---

# T-033 连接线改为轨道层整体绘制

状态: active
关联: R-01-003/AC-04 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

T-031/T-032 及其后两轮短路修复均采用「卡片伪元素/补画段分段拼接」绘制层级连接线，东家实际观察后连续反馈：接缝处亮点（半透明重叠）、断口（bottom:0 改动）、以及子/孙代理增多后「有些交界断开、有些重叠，几乎没有完美的连线」。

根因：拼接段的接缝端点落在流式卡片高度的随机亚像素相位上，跨元素 1px 半透明线段的接缝在光栅化时不可控——接缝数量多 × 相位随机，任何数值调优都无法稳定。

目标（R-01-003/AC-04 不变，纯实现机制替换）：

- 每条母会话轨道（母会话卡片底缘 → 末级可见子卡中心）由一个连续元素整体绘制，全程零接缝。
- 横向接入短线同为轨道层元素（测量驱动）；全部线段坐标统一取整到 CSS 像素，且轨道层整体 transform 对齐设备像素网格（滚动经 rAF 重对齐），同相位、粗细一致、端点相接（东家验收：小数相位导致粗细不稳与端点方头错位；层原点相位导致竖轨 2px、横线 1px）。
- 卡片 DOM 结构、复用与点击/焦点保护逻辑不变。

## 差距评估

- `src/core.mjs`：`isLastChildEntry`/`passingRailLevels` 是拼接时代的逐段拓扑，无法直接驱动整体绘制。
- `src/client.mjs`：`::before`/`data-last-child`/`.dap-conn-line` 均为分段拼接；无整轨绘制载体。
- `scripts/check.mjs`：既有断言钉住的是拼接几何，需要整体重写。

## 收敛方案

- `src/core.mjs`：以 `trackRuns(entries)`（含非直属/无 id 条目过滤）与 `trackBoxes(run, rectOf, indentPx)`（测量矩形 → 竖轨+横线绘制盒，统一取整；几何纯函数，可执行断言钉住）取代上述两函数。
- `src/client.mjs`：
  - 列表模板内置 `.dap-tracks` 绝对定位轨道层（首子节点，活动区卡片 offset 变为 1），`.dap-list` 成为定位包含块；
  - `syncTracks` 在全部卡片写入后统一测量（`getBoundingClientRect` 浮点矩形——`offsetTop`/`offsetHeight` 整数舍入会随机差 1~2px），按 `wanted` reconcile 每条 `.dap-conn-track` 与 `.dap-conn-stub`，读写分离避免布局抖动；
  - `ResizeObserver` 观察列表，卡片高度随流式内容/折叠展开变化时重算；
  - 横线同为轨道层元素（`::after` 伪元素按小数 50%% 定位相位随机，已废弃）；删除 `::before` 竖线、`data-last-child`、`data-connector` 与 `.dap-conn-line`；
  - 折叠/隐藏态测量为 0 时跳过，展开后由 ResizeObserver 自愈；窗格重挂载经 layer 引用比对重置记账。
- `scripts/check.mjs`：`trackRuns`/`trackBoxes` 纯数据断言（含 P→A→G→B 拓扑与几何回归）+ 轨道层 bundle 契约 + 禁回拼接/禁小数定位/禁整数测量的负向断言。范围内还包含本轮迭代暴露的两处既有回归守卫（`renderCardIntoList` 丢失 `let rec = reuseMap.get(...)` 致整区空白、补画段与折叠按钮 `dap-rail` 类名撞名），作为负向断言保留，不另拆 task。
- 同步 DESIGN 机制描述；不新增依赖。

## 测试计划

- `pnpm build:client && pnpm check`：核心拓扑、bundle 契约、负向断言。
- `python3 tools/agentmap_lint.py --report`：追溯完整。
- `git diff --check`：空白检查。
- 静态几何截图（2x/3x 缩放）验证 P→A→G→B→C 连续性与 T 字交点。
- GUI 现场演示（3 子代理 + 3 孙代理）由东家验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：每条轨道单元素连续绘制，多级、多同级、末级收口正确 | `scripts/check.mjs#R-01-003/AC-04`、`src/client.mjs::syncTracks`、静态几何截图、GUI 现场验收 |
| 异常 | 适用：无子代理无轨道；母会话卡渲染失败时跳过该轨道下轮自愈；折叠态不绘、展开自愈 | `scripts/check.mjs#R-01-003/AC-04`、`src/client.mjs::syncTracks` |
| 边界配置 | 适用：唯一子代理、多孙级、窗格重挂载、卡片复用 | `scripts/check.mjs#R-01-003/AC-04`、`src/core.mjs::trackRuns` |
| 副作用 | 适用：轨道层 pointer-events:none、aria-hidden；卡片复用/点击/焦点逻辑零改动；测量读写分离 | `scripts/check.mjs#R-01-003/AC-04`、`src/client.mjs::renderCardIntoList` |
| 性能 | 适用：渲染提交与 resize 时才测量，一次强制布局完成 | `src/client.mjs::syncTracks` |

## 终态与证据

（完成后填写）
