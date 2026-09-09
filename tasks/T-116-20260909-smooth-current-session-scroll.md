---
doc-type: task
mutation: lifecycle
id: T-116
---

# T-116 当前会话卡片快速平滑滚动

状态: completed
关联: R-01-006/AC-02 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: T-115 已将原生侧栏选中的当前卡片滚入窗格可视区域，但使用同步 `scrollTop` 写入，视觉上是瞬间跳转。
- 目标: 保留最小必要滚动距离与完整可见约束，改为浏览器原生的短暂平滑滚动过渡，让用户快速看到目标卡片。
- 需求闸口: 东家本次明确要求从瞬间跳转改为快速滚动到目标位置。

## 非目标

- 不改变目标位置计算、卡片排序、当前高亮、历史分页或主会话滚动隔离。
- 不引入自定义 `requestAnimationFrame` 动画、定时器、缓动曲线、配置项或第三方依赖。
- 不把滚动变成居中定位；不为窗格中未呈现的历史卡片扩展分页。

## 差距评估

- `src/navigation.mjs::scrollCardIntoView` 已按越界量计算最小目标 `scrollTop` 并做边界限制，但当前通过属性赋值同步完成。
- `src/client.mjs::ensureCurrentCardVisible` 当前在同步滚动后复核几何可见性；切换为异步平滑滚动后，必须把“滚动请求已发出”与“动画完成后的几何可见”区分开，避免同一请求因尚未完成而重复触发。
- `R-01-006/AC-02` 已承诺最小滚动和不居中，尚未明确非瞬时过渡；现有长列表 E2E 只验证最终可见，需要补充 smooth API 证据。

## 收敛方案

1. 更新 `PRD.md` 的 `R-01-006/AC-02`，明确目标滚动使用快速、平滑过渡但仍保持最小必要距离。
2. 更新 `DESIGN.md` 运行时交互、产品契约与窗格渲染器内部结构，记录原生 `scrollTo({ top, behavior: "smooth" })`，不维护自定义动画状态。
3. 在 `src/navigation.mjs::scrollCardIntoView` 中优先调用窗格原生 `scrollTo` 的 `smooth` 行为，调用方命中降低动效偏好时传入 `auto`，缺少该 API 或 options 不受支持（`TypeError`）时保留直接写入的兼容 fallback；其它异常继续抛出。
4. 在 `src/client.mjs` 将已接受的滚动请求立即记入当前卡片去重状态；无滚动请求时继续复核边界与可见性，避免运行时重绘重复启动滚动。
5. 先补 `scripts/check.mjs` 对 `behavior: "smooth"` 的断言，沿用并加强 `e2e/specs/long-list.mjs` 的原生侧栏向下/向上最终可见回归，重建 `.dsh-plugin/client.js`。

## 测试影响

| 需求/设计 | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-006/AC-02 | 从瞬间滚动改为快速平滑滚动，最小距离与完整可见保持不变 | UNIT/E2E | modify | `scripts/check.mjs#R-01-006/AC-02` 断言 smooth API 与边界；`e2e/specs/long-list.mjs#R-01-006/AC-02` 继续验证原生侧栏选择后上下方向最终完整可见 |
| R-01-004/AC-01～AC-03 | 窗格手动滚动、滚动隔离与 scrollbar 行为保持不变 | E2E | regression | `e2e/specs/long-list.mjs` 既有长列表和主会话滚动隔离断言 |
| R-01-005/AC-01 | 卡片点击/键盘跳转保持原有导航行为 | E2E | regression | `e2e/specs/navigation.mjs#R-01-005/AC-01` |
| R-01-018/AC-01～AC-05 | 回到顶部按钮与既有 smooth/reduced-motion 行为保持不变 | E2E | regression | `e2e/specs/back-to-top.mjs` 等待创建阶段滚动过渡收口后继续验证显隐、回顶与降低动效行为 |
| R-02-003 | 不新增动画定时器、监听或卸载残留 | UNIT/E2E | regression | `scripts/check.mjs#R-02-003/AC-01`、`package.json::verify` |
| DESIGN | 当前会话滚动定位增加平滑过渡契约 | UNIT/E2E | update | `scripts/check.mjs#R-01-006/AC-02`、`e2e/specs/long-list.mjs#R-01-006/AC-02` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：原生侧栏选中窗格内的下方或上方卡片后，滚动请求使用 smooth，动画结束卡片完整可见 | `scripts/check.mjs#R-01-006/AC-02`、`e2e/specs/long-list.mjs#R-01-006/AC-02`、`src/navigation.mjs::scrollCardIntoView` |
| 异常 | 适用：缺少或以 `TypeError` 拒绝 options 的 `scrollTo` 时使用直接写入 fallback；无目标卡片时不发起滚动请求，非预期异常继续暴露 | `scripts/check.mjs#R-01-006/AC-02`、`src/client.mjs::ensureCurrentCardVisible` |
| 边界配置 | 适用：顶部/底部越界仍只滚动必要距离，滚动范围 clamp，完整可见时不发起 smooth 请求 | `scripts/check.mjs#R-01-006/AC-02`、`src/navigation.mjs::scrollCardIntoView` |
| 副作用 | 适用：平滑滚动只作用于 `.dap-scroll`，不改变主会话滚动、不居中、不重复抢占用户手动滚动 | `e2e/specs/long-list.mjs#R-01-004/AC-01`、`e2e/specs/navigation.mjs#R-01-005/AC-01`、`package.json::verify` |
| 资源释放 | 适用：使用浏览器原生滚动 API，不新增 timer、listener 或订阅 | `src/client.mjs::apply`、`scripts/check.mjs#R-02-003/AC-01` |

## 测试计划

- 先更新 PRD/DESIGN、创建本 task，并修改 `scripts/check.mjs` 的 smooth API 断言；在实现前运行检查确认新增断言失败。
- 实现后运行 `node scripts/check.mjs`、`pnpm verify:fast` 与 `PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec node e2e/run.mjs long-list navigation`。
- 重建 `.dsh-plugin/client.js`，刷新现有 `http://127.0.0.1:3080/`，确认目标卡片以短暂过渡滚动到完整可见。
- 调用 `code-review` skill 做 Standards/Spec 双轴独立审核；如有 finding，由同一审核方复审。
- 最终运行 `pnpm verify`、`git diff --check`，按规范提交并记录精确结果。

## 终态与证据

- 实现: `src/navigation.mjs::scrollCardIntoView` 默认调用 `scrollTo({ top, behavior: "smooth" })`，仍按最小必要距离定位并 clamp 到合法范围；降低动效偏好时由 `src/client.mjs::ensureCurrentCardVisible` 传入 `auto`；缺少 `scrollTo` 或 options 不受支持的 `TypeError` 时回退同步滚动，非预期异常继续抛出。
- 测试: `node scripts/check.mjs` 通过，覆盖 smooth/auto、fallback、异常暴露、完整可见与两端 clamp；`PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec node e2e/run.mjs long-list back-to-top navigation` 通过；最终 `PLAYWRIGHT_BROWSERS_PATH=0 pnpm verify` 通过（AgentMap、test-impact、unit 与全部 13 个 E2E spec）；E2E 通过真实 `scrollTo` spy 验证 smooth/auto，并验证上下方向最终完整可见；`git diff --check` 通过；刷新 `http://127.0.0.1:3080/` 后 HTTP 200、窗格数量为 1 且 `.dap-scroll` 正常挂载。隔离浏览器采样显示滚动位置由 `0 → 2 → 33 → 314 → 418`，约 320ms 内完成，非瞬间跳转。
- DESIGN 对照: `PRD.md` 的 `R-01-006/AC-02` 已明确快速平滑过渡；`DESIGN.md` 已同步运行时交互、原生 `scrollTo` 产品契约、降低动效偏好与 fallback 语义；`scripts/acceptance.mjs` 原有 AC 映射保持有效。
- commit: cc973c9 （✨ 改进(activity): 选中会话滚动改为快速平滑）。
- review:
  - 审核方: Standards reviewer `e2d4c486-37f8-4514-8ee0-4f9874bed4ca`；Spec reviewer `64a2db62-392b-4329-ae22-104c49aa0073`。
  - 目的理解: 审核目标为保留当前卡片最小必要滚动、完整可见、不居中、外层滚动隔离与去重语义，同时将瞬间跳转改为快速平滑过渡；降低动效偏好时不播放平滑动画；关联 `R-01-006/AC-02`、`R-01-004`、`R-01-005`、`R-01-018`。
  - 执行方式: 使用 `code-review` skill，固定基线 `380aa9e4421bf9d026ac2e4776afa08bf67ac9bd`，最终范围 `git diff 380aa9e...HEAD`，提交列表为 `cc973c9 ✨ 改进(activity): 选中会话滚动改为快速平滑`；Standards/Spec 双轴独立审核，并由同一审核方对 findings 复审。
  - 问题与修复: Spec 初审要求补齐真实 smooth/auto 浏览器证据并指出 `scrollTo` 分支异常 fallback 风险；Standards 初审指出 `catch {}` 静默吞错；完整门禁另发现 smooth setup 与回顶按钮初态存在并发时序波动。已分别补充真实 E2E spy、上下方向与 reduced-motion 断言、`TypeError` 专限定 fallback、非预期异常重抛，以及回顶测试的 auto 收口准备；修复后同一审核方复审通过。
  - 复审结论: Standards 无 documented standard 违反、无 Fowler baseline smell；Spec 无需求缺失、无 scope creep、无逻辑错误；最终通过。
