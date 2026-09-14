---
doc-type: task
mutation: lifecycle
id: T-127
---

# T-127 移动端常驻功耗收敛：屏外休眠、渲染节流与流式派生合并

状态: active
关联: R-02-002 → 渲染稳定与资源释放；R-01-002 → 等待行动可见性（脉冲语义保持不变）；R-01-008 → 移动端抽屉
风险等级: standard

## 背景与目标

- 背景: 东家反馈 0ca0c15 之后移动平台打开页面久了仍持续发热。调研确认三项结构性耗电源：① 移动端抽屉以 `transform: translateX(-102%)` 藏于屏外（非 `display:none`），pane 子树的无限 CSS 动画（等待卡末行脉冲、运行条纹 `background-position` 逐帧重绘、状态点脉冲）与全量渲染管线在屏外照常运转；② `conversationObserver`（宿主会话 seat，subtree）与全部事件源直接驱动 `queueSync` → rAF 合帧，事件密集时渲染频率等于显示器刷新率（移动端 120Hz）；③ `captureSessionLog` 对每次日志引用变化即时执行 `applyLogEvents` → `foldedHistoryTimeline`（内部无界全量转换，`core.mjs::conversationTimelineFromHistory(history, MAX_SAFE_INTEGER)`）+ `messagePreviews`，成本 O(日志窗口) × 事件率，随会话变长线性放大。0ca0c15 的取舍段已记录空闲残余 CPU 5.1%（无插件基线 1.9%）来自常驻无限动画，本次一并收敛。
- 目标: 不改变任何用户可观察呈现语义（R-01-002 脉冲、R-01-008 抽屉行为、R-02-004 订阅纪律、R-01-009 逐秒时钟）的前提下，收敛移动端常驻 CPU/GPU 开销：屏外即休眠、渲染频率硬顶 10Hz、流式派生与事件率解耦。
- 非目标: 不改动画设计语义（脉冲/条纹在可见时照常，属 R-01-002/AC-06～AC-08 设计行为）；不引入轮询（R-02-004）；不动 SSE 通道形态与 host.mjs。

## 差距评估

- PRD/DESIGN: 无性能目标条目（G-1～G-3 均为可用性承诺），达标类性能优化 map 不变；DESIGN 无渲染频率与屏外呈现的约束描述，无需演进。
- client.mjs: `queueSync` 无最小间隔；pane 无屏外休眠；`captureSessionLog` 逐事件全量派生。
- 测试: `e2e/specs/idle-quiescence.mjs` 只锚定空闲 rAF 静默；屏外休眠与渲染频率无锚点。

## 收敛方案

1. CSS: 移动断点媒体查询内新增 `[data-dsh-activity-pane]:not([data-open="true"]) { content-visibility: hidden; }`——抽屉关闭（含初始未开，`data-open` 缺省视同关闭）时 pane 子树整体跳过渲染，动画无渲染开销；布局状态保留（scrollTop 不归零，不复发 T-027 display:none 问题）；打开瞬间恢复渲染，`translateX` 过渡不变。开关与遮罩挂 `document.body`，不落本规则，浮动开关徽标脉冲（R-01-002/AC-06、AC-07）照常。
2. JS 渲染节流: `queueSync` 增加 `SYNC_MIN_INTERVAL_MS`（100ms）leader-follower 节流——距上次渲染落点 ≥100ms 走原 rAF 合帧路径立即渲染，否则合并到窗口尾由 timer 单次交付；空闲期无事件即无排队；卸载清空在途 timer。
3. JS 流式派生合并: `captureSessionLog` 日志引用变化时只更新 `detail.log` 引用，`applyLogEvents`（O(窗口) 全量折叠 + 预览 + 模型提取）合并进 100ms 窗口执行（每会话至多一个在途 `logDeriveTimer`）；深翻路径（低频一次性）保持同步派生不变；卸载逐 detail 清理 timer。

## 测试计划

- 单元/契约: `scripts/check.mjs` 新增 T-127 bundle 断言（屏外休眠规则、节流状态机、派生合并与卸载清理）。
- E2E: 新增 `e2e/specs/mobile-thermal.mjs`（移动视口：抽屉关闭 computed `contentVisibility === "hidden"`、流式回合 5s rAF 计数硬顶、休眠期 `textContent` 持续更新、打开抽屉即最新呈现且恢复 visible）；回归 `mobile-drawer.mjs`（抽屉行为）与 `idle-quiescence.mjs`（空闲静默）。
- 人工: `scripts/acceptance.mjs` 新增真机发热对照验收点（东家核验）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：抽屉关闭即休眠、打开即最新；节流后渲染与派生收敛到最新状态 | `e2e/specs/mobile-thermal.mjs::mobileThermal`、`scripts/check.mjs#T-127` |
| 异常 | 适用：disposed 后 timer 回调不入渲染；卸载不残留在途 timer | `e2e/specs/mobile-thermal.mjs::mobileThermal`、`scripts/check.mjs#T-127` |
| 边界配置 | 适用：桌面断点不受 content-visibility 影响；`data-open` 缺省视同关闭；深翻路径同步派生不被窗口覆盖 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#T-127` |
| 副作用 | 适用：空闲静默不回退（节流不引入空闲唤醒）；100ms 显示延迟不破坏逐秒时钟契约（R-01-009/AC-03 粒度 1s）；脉冲呈现语义不变 | `e2e/specs/idle-quiescence.mjs::idleQuiescence`、`scripts/check.mjs#T-127` |
| 性能 | 适用：流式期间渲染请求硬顶（10Hz + 宿主余量）+ 屏外子树零渲染开销 | `e2e/specs/mobile-thermal.mjs::mobileThermal`、`scripts/acceptance.mjs#T-127` |

## 终态与证据

- 实现:
- 测试:
- DESIGN 对照:
- commit:
- review:
  - 审核方:
  - 目的理解:
  - 执行方式:
  - 问题与修复:
  - 复审结论:
