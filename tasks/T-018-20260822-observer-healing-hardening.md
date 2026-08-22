---
doc-type: task
id: T-018
mutation: lifecycle
---

# T-018 观察者自愈与零星健壮性批

风险等级: standard
状态: completed

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

- 实现: `src/client.mjs`：`frameParentObserver` 升级为 center→body 祖先链逐级 `childList` 观察（`ancestorObservers` + `disconnectAncestorObservers` 统一管理，断裂判定 `!center.isConnected || seat 父级变化` 即重装 + queueSync；cleanup 与 center===null 分支同步断开）；render 末尾图标缓存按 `iconCacheSessionPrefix`（当前会话）修剪并按插入序限量 `ICON_CACHE_MAX=128`。`src/core.mjs`：`fmtElapsedMs` 非有限/负输入返回空串；`conversationTimeline` partial 匹配要求 turn/step 均为有限数才参与摘除。
- 测试: `pnpm build:client && pnpm check` 通过（新增 R-01-009/AC-03 时长边界、R-01-012/AC-02 partial 缺省守卫、祖先链/缓存限量 bundle 契约断言；卸载断言更新为 `disconnectAncestorObservers`）；`scripts/acceptance.mjs` 新增「视图级祖先替换后窗格自愈 + 空闲不丢失」「长跑资源不爬升」两条人工步骤（本环境无浏览器 E2E 基建，人工步骤未执行）；`python3 tools/agentmap_lint.py --report` 通过（17 需求 / 56 AC，测试锚定 56/56）；`git diff --check` 通过。
- DESIGN 对照: DESIGN 宿主 DOM 观察已补充祖先链机制（任一级断裂即重装恢复），与实现一致；R-02-002/AC-01 重挂载自愈覆盖到祖先级替换；不引入定时器轮询（R-02-001 纪律保持）。
- commit: ef6e1ad
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: T-018 为 map 不变的零星缺陷修复批（GF2 祖先级重挂载自愈、B2c 时长防御、zQT partial 缺省守卫、INV 图标缓存修剪限量）；关联约束 R-02-001/R-02-002/R-02-003/R-02-004；验证方式为 check.mjs 断言 + bundle 契约 + acceptance 人工步骤。
  - 执行方式: `code-review` skill；评审基线 `f4c44b4`，范围 `git diff f4c44b4...HEAD`（1beb159 实现、ef6e1ad 修复），Standards/Spec 两轴独立审核，修复后由同一审核方复审。
  - 问题与修复: Standards 轴 0 硬违例、2 项判断题——`currentKeyPrefix` 命名（ef6e1ad 重命名为 `iconCacheSessionPrefix`）、回调重复 querySelector（复审裁定职责不同、维持现状）；Spec 轴 0 finding 通过。
  - 复审结论: Standards 复审三项全部关闭；Spec 首轮即通过，无待复审项。
