---
doc-type: task
id: T-018
mutation: lifecycle
---

# T-018 观察者自愈与零星健壮性批

风险等级: standard
状态: active

## 背景与目标

- 背景: 深度评估确认一组零星但机制明确的缺陷/防御缺口；均属 map 不变的缺陷修复（短路形态，C-009）。
- 目标: 修复下列 4 项并附回归测试：
  1. GF2——外壳替换被观察 parent 之上的祖先时，`frameParentObserver`/`centerObserver` 均不触发且 `bodyObserver` 已断开，空闲态下窗格永久丢失（R-02-002/AC-01 机制缺口）。
  2. B2c——`fmtElapsedMs` 对 NaN/Infinity/负数输出非法文案，导出纯函数自身缺边界防御。
  3. zQT——`conversationTimeline` 的 partial 匹配在 turn/step 缺省时可能误摘除最后一个无定位 assistant 节点。
  4. INV——`nativeIconsByTraceKey` 的 SVG 克隆随工具调用终身增长，仅卸载时清理。
- 非目标: 不改观察者既有职责划分；不引入定时器轮询（R-02-001 纪律）；不改卡片视觉。

## 差距评估

- 现状基线:
  - `frameParentObserver` 只观察 parent 直接子节点；祖先被替换时无任何 mutation 到达已装观察者；`bodyObserver` 在 `installFrameObserver` 成功后断开，只在 render 重入时才有机会重臂。
  - `fmtElapsedMs(ms)` 直接 `Math.round(ms/1000)`，未净化。
  - partial 匹配 `findLastIndex(item => item.kind === "assistant" && item.turn === partial.turn && item.step === partial.step)`，两侧均可为 undefined 时误命中。
  - `nativeIconsByTraceKey` 只增不清。
- 目标差距:
  - 观察链延长：对 center → body 的祖先链逐级以 `{childList:true}` 安装轻量观察（只盯直接子节点，成本可忽略），任一级断裂即重跑 `installFrameObserver`；或等价机制保证祖先替换必然触发一次重装，不引入定时器。
  - `fmtElapsedMs` 非有限/负输入返回空串。
  - partial 匹配要求 `partial.turn`/`partial.step` 均为有限数才参与摘除匹配。
  - `nativeIconsByTraceKey` 随当前会话 id 集修剪（仅保留当前会话 + 容量上限）。

## 收敛方案

1. `src/client.mjs` 观察链：`installFrameObserver` 安装成功后，对 center 到 body 的祖先链逐级挂 `{childList:true}` 观察（断开时统一重装 + `queueSync`）；清理段同步断开全部祖先观察。
2. `src/core.mjs`：`fmtElapsedMs` 输入净化；`conversationTimeline` partial 匹配加有限数守卫。
3. `src/client.mjs`：`nativeIconsByTraceKey` 修剪（每次渲染后按当前会话 id 集 + LRU 上限清理）。

## 测试计划

- `scripts/check.mjs` 增补锚定：
  - R-01-009/AC-03（时长文案边界）: `fmtElapsedMs(NaN/Infinity/-1)` 返回空串。
  - R-01-012/AC-02: partial turn/step 缺省时不误摘除 assistant 节点。
- GF2 与 INV 属 DOM 生命周期行为，以 `scripts/acceptance.mjs` 人工步骤承接（外壳视图切换后窗格自愈；长跑后图标缓存不无限增长），代码结构证据写入终态。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：既有锚点全绿，正常观察路径不回归 | `scripts/check.mjs#R-01-009/AC-03`、`src/core.mjs::fmtElapsedMs` |
| 异常 | 适用：非法时长输入、缺省 partial 定位 | `scripts/check.mjs#R-01-012/AC-02`、`src/core.mjs::conversationTimeline` |
| 边界配置 | 适用：祖先链任意级断裂均可重装 | `scripts/acceptance.mjs#R-02-002/AC-01`、`src/client.mjs::installFrameObserver` |
| 副作用 | 适用：祖先观察不得把 pane 子树纳入观察范围（防反馈循环） | `scripts/check.mjs#R-02-003/AC-01`、`src/client.mjs::installFrameObserver` |

## 终态与证据

（待关闭时填写：实现 / 测试 / DESIGN 对照 / commit / review）
