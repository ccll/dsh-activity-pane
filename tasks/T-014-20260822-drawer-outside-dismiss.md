---
doc-type: task
id: T-014
mutation: lifecycle
---

# T-014 移动端抽屉外部点击收起

风险等级: standard
状态: completed

## 背景与目标

- 背景: 移动端抽屉（≤767px，`position:fixed` 滑入）目前只能经浮动开关按钮或抽屉头 × 收起；点击抽屉外部区域无任何响应。东家要求补齐「点击外部区域也能关闭抽屉」的交互，并确认采用透明遮罩方案（PRD R-01-008/AC-03）。
- 目标: 抽屉打开时显示透明全屏遮罩，点击遮罩收起抽屉；开合状态收敛为单点写入，重复挂载与卸载完整清理遮罩元素与监听。
- 非目标: 不改变抽屉外观（遮罩完全透明）、不改变桌面形态与折叠行为、不改变卡片交互、不修改 DSH 宿主。

## 差距评估

- 现状基线:
  - `togglePane(open)` 写 `data-open`；抽屉头 × 的 `onCloseClick` 直接 `setAttribute`，开合存在两个写入点。
  - 无遮罩、无 document 级监听，点击抽屉外部不产生任何行为。
  - `apply()` 重复挂载清理选择器只覆盖 pane/toggle/style。
- 目标差距:
  - 新增透明遮罩元素，z-index 介于主会话与抽屉（2147482990）之间，浮动开关（2147482991）位于其上。
  - 开合状态单点写入并同步遮罩显隐；遮罩点击收起抽屉。
  - 重复挂载清理与卸载清理覆盖遮罩。

## 收敛方案

1. `src/navigation.mjs` 新增 `bindBackdropDismiss(backdrop, dismiss)`：绑定遮罩 `click`（preventDefault/stopPropagation 后回调收起），返回卸载函数；无 DOM 假设，可 Node 单测。
2. `src/client.mjs`：
   - CSS 新增 `.dap-backdrop`（`position:fixed; inset:0; display:none`，z-index 2147482989，透明背景）；`@media (max-width: 767px)` 下 `[data-drawer-open]` 时 `display:block`，桌面断点外由媒体查询保持隐藏。
   - `apply()` 创建遮罩元素挂 `document.body`；`togglePane(open)` 同步 `data-open` 与 `data-drawer-open`；`onCloseClick` 改经 `togglePane(false)` 写入（开合单点）。
   - 遮罩点击经 `bindBackdropDismiss` 回调 `togglePane(false)`；重复挂载清理选择器与卸载清理移除遮罩并解绑。
3. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 锚定 R-01-008/AC-03：遮罩 click（触摸轻点经浏览器 tap→click 合成，与既有交互一致）触发收起并阻止传播；非 click 事件不触发；卸载后监听移除、点击不再触发；非法输入返回 no-op 卸载函数。
- `scripts/acceptance.mjs` 增加人工步骤：移动端打开抽屉后点击外部区域收起且不误触主会话；开关按钮不受遮罩拦截；桌面宽度无遮罩。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：移动端打开抽屉后点外部区域收起是主路径 | `scripts/check.mjs#R-01-008/AC-03`、`src/client.mjs::togglePane`、`src/navigation.mjs::bindBackdropDismiss` |
| 异常 | 适用：窗格未挂载/重复挂载/卸载后点击不得报错或残留监听 | `scripts/check.mjs#R-01-008/AC-03`、`src/client.mjs::apply`、`src/client.mjs::cleanup` |
| 边界配置 | 适用：桌面断点外遮罩不得显示，不影响桌面贴边列与折叠 | `src/client.mjs::MOBILE_BREAKPOINT`、`scripts/acceptance.mjs#R-01-008/AC-03` |
| 副作用 | 适用：开合单点写入不得破坏开关切换与 × 收起；遮罩不得拦截浮动开关 | `scripts/check.mjs#R-01-008/AC-03`、`scripts/acceptance.mjs#R-01-008/AC-03`、`src/client.mjs::bindPaneControls` |

## 终态与证据

- 实现: `src/navigation.mjs` 新增 `bindBackdropDismiss`（遮罩 click 收起、返回卸载函数；触摸轻点经浏览器 tap→click 合成事件覆盖，与既有开关/×/卡片交互一致，仅绑 click）；`src/client.mjs` 新增透明遮罩 `.dap-backdrop`（z-index 2147482989，介于主会话与抽屉 2147482990 之间，浮动开关 2147482991 位于其上）经 `apply()` 挂载 body，抽屉开合状态收敛为 `togglePane` 单点写入（同步 `data-open` 与 `data-drawer-open`），抽屉头 × 改经 `togglePane(false)`，遮罩点击经 `bindBackdropDismiss` 收起；重复挂载清理与卸载清理完整覆盖遮罩与监听；`.dsh-plugin/client.js` 已同步。
- 测试: `pnpm build:client && pnpm check` 通过（全部断言，含 `scripts/check.mjs#R-01-008/AC-03` 遮罩 click/非 click/卸载后/非法输入）；`python3 tools/agentmap_lint.py --report` 通过（17 需求 / 56 AC 全部设计覆盖，测试锚定 56/56）；`git diff --check` 通过；`scripts/acceptance.mjs` 增补移动端触摸轻点与鼠标点击、不误触主会话、开关不被遮罩拦截、外壳重挂载后遮罩不重复、桌面无遮罩的人工步骤（本环境无可用真机，人工步骤未执行）。
- DESIGN 对照: DESIGN 边界契约/卸载契约/窗格渲染器中移动端抽屉机制（透明遮罩 z-index 层级、开合单点写入、tap→click 合成契约、断点外媒体查询隐藏、卸载清理覆盖遮罩）与实现一致；PRD R-01-008/AC-03 由遮罩机制与测试锚点覆盖。
- commit: cce821c
- review:
  - 审核方: 独立 `code-review` Standards 子代理；独立 `code-review` Spec 子代理。
  - 目的理解: 移动端打开活动会话抽屉后补齐「点击抽屉外部区域也能关闭抽屉」的交互（东家确认透明遮罩方案，R-01-008/AC-03）；开合状态单点写入，遮罩不改抽屉外观与桌面形态，卸载/重复挂载完整清理，不得破坏 R-01-008 抽屉契约、R-02-003 卸载纪律与既有开关/×/卡片交互。
  - 执行方式: `code-review` skill；固定基线 `b874b28`；评审范围 `git diff b874b28...HEAD`（cce821c 实现、8e9e2fa 修复），Standards/Spec 两轴独立审核，修复后由同一审核方复审。
  - 问题与修复: Spec 轴 2 项 finding（触摸契约/验证缺口）经 8e9e2fa 修复并由原审核方复审通过；Standards 轴 1 项硬违例（实现提交时刻 task 未关闭）系 AGENTS.md 强制独立关闭提交时序的过程态，由本提交收口；2 项低置信度 smell 与 1 项格式建议均裁定维持现状。逐项明细如下：
    - [Spec/中] AC-03「点击或触摸」触摸路径仅体现为 click → 判定 tap→click 合成即覆盖（全插件移动端交互均 click-only，加原生 touch 监听会引入双触发与滑动误收起）；修复为契约显式化：`src/navigation.mjs` 注释、DESIGN 机制条目、T-014 测试计划写明 tap→click 合成契约（8e9e2fa）。
    - [Spec/低] 遮罩层叠/开关不被拦截/不误触/重挂载后状态缺验证证据 → `scripts/acceptance.mjs` 人工步骤增强，明确覆盖触摸轻点与鼠标点击、遮罩拦截不误触、开关不被拦截、重挂载后遮罩不重复、桌面无遮罩（8e9e2fa）；余下 GUI 步骤由人工验收清单承接（本环境无浏览器 E2E 基建，见 TODO.md）。
    - [Standards/硬] 实现提交时刻 task 仍 active 且终态证据为空 → 属 AGENTS.md 强制「completed task 在实现提交后的独立提交中关闭」的必然过程态；本独立关闭提交写入终态与 review 证据，审计链收口；同一审核方确认（见复审结论）。
    - [Standards/低] `bindBackdropDismiss` 防御式检查（Speculative Generality）、`.dap-backdrop` 生命周期三处（Duplicated Code/Shotgun Surgery）→ 不重构：防御风格与既有 `bindCardActivation` 一致（仓库约定优先），三处分别承担旧实例清理/创建/卸载职责；同一审核方确认处置可接受。
    - [Standards/格式] `scripts/check.mjs` 新增 import 行较长 → 维持现状（审核方判定：无行宽规则或工具证据，拆分仅属格式偏好，不作为 finding）。
  - 复审结论: Spec 复审通过（两项 finding 均关闭，无新偏差）；Standards 复审对草稿 (a) 满足 completed 要求、(b) task-active finding 由本独立关闭提交收口、(c) 两条 smell 不重构处置可接受，均裁定「是」。
