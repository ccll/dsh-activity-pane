---
doc-type: task
mutation: lifecycle
id: T-009
---

# T-009 复用会话网页工作项语义与原生图标

状态: completed
关联: R-01-012 / 活动状态模型、窗格渲染器；R-02-003 / 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈活动卡时间线只显示动作摘要，缺少主会话网页中的原生图标与 `Bash`、`Think`、`Edit` 等动作标题。需要按主网页工作项 DOM 语义复用 label、summary、state 与 SVG 图标，避免把动作行压成一段后置文本。

## 差距评估

- 当前 `timelineToolItem` 只归一 `icon/text/detail`，没有稳定的动作 label/summary 分层。
- 当前 `renderTrace` 使用 Unicode 字符映射 icon，没有复用主会话已渲染的 SVG。
- 主网页和已安装 `dsh-auto-collapse` 使用 `data-variant`、`data-chat-call-id`、`data-tool`、`data-state`、`data-disclosure-row` 识别工作项；当前活动卡没有读取这些 host DOM 语义。

## 收敛方案

- 数据层为工具/Think 工作项补充 `label`、`summary`、`toolName`，工具标题沿用 host presentation 语义并提供最小 fallback。
- 渲染层优先在主会话 DOM 中按工作项语义找到对应 disclosure row，读取 label/summary/state 并克隆原生 SVG；冷会话或当前页面不存在对应类型时回退到数据层语义与通用 SVG。
- 保留现有 timeline order、history fallback、textContent 安全写入和实时订阅；不复制交互事件、不引入第三方路由或轮询。

## 测试计划

- `scripts/check.mjs`：断言工具 label/summary/toolName 与 Think label 归一，不回归 history 原始事件结构。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`。
- `scripts/acceptance.mjs`：人工确认活动卡显示原生 SVG、`Bash/Think/Edit` 标题与摘要，并观察当前/非当前会话 fallback。
- 独立 Standards/Spec review，固定 T-008 实现基线并复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：工作项行分层显示原生图标、动作标题、摘要和状态 | `scripts/check.mjs#R-01-012/AC-03`、`src/core.mjs::timelineToolItem`、`src/client.mjs::renderTrace` |
| 异常 | 适用：没有匹配 host DOM 时仍有安全的 label/summary/icon fallback | `scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::nativeWorkItemPresentation` |
| 边界配置 | 适用：Think、tool、command、context、未知 tool 和 history event | `scripts/check.mjs#R-01-012/AC-03`、`src/core.mjs::timelineItemFromChatNode` |
| 副作用 | 适用：只克隆 SVG/读取文本，不复制主页面交互或改变当前会话 | `scripts/check.mjs#R-02-003/AC-01`、`src/client.mjs::renderTrace` |
| 兼容性 | 适用：原有纯函数字段与历史卡五行不回归 | `scripts/check.mjs#R-01-013/AC-03`、`src/core.mjs::conversationTimelineFromHistory` |

## 终态与证据

- 实现: `src/core.mjs` 为工具/Think 工作项增加 label、summary、toolName、callId 语义；`src/client.mjs` 按主会话 `data-chat-*` 语义匹配工作项，读取主网页 label/summary/state，并通过白名单 SVG 图形复制复用原生图标；无匹配 DOM 时安全 fallback；`.dsh-plugin/client.js` 已生成。
- 测试: `node scripts/check.mjs` 通过；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过；`git diff --check` 通过；`curl -fsS -I http://127.0.0.1:3080/` 返回 HTTP 200。真实 host DOM 的 SVG/state/fallback 仍需按 `scripts/acceptance.mjs` 人工 GUI 清单观察，当前环境没有可用 Playwright/Puppeteer。
- DESIGN 对照: 活动卡继续使用 native snapshot/history/order 与 session.subscribe；工作项展示优先复用宿主 DOM 的 `data-variant`、`data-chat-call-id`、`data-tool`、`data-state`、`data-disclosure-row` 语义；只克隆安全 SVG 图形，不复制交互事件、外链或主页面 DOM 状态。
- commit: c772f96
- review:
  - 审核方: Standards 子代理 `0b773701-cf12-449d-8f55-5af99c861a37`；Spec 子代理 `8dc16739-4a38-46b2-b458-edcca83b55c6`。
  - 目的理解: 让活动卡时间线呈现与会话网页一致的原生图标、动作标题、摘要和状态，同时保留非当前会话 fallback 与现有实时/排序行为。
  - 执行方式: `code-review` skill；固定基线 `1a168eb`，范围为 `git diff 1a168eb...HEAD` 的 T-009 工作单元；Standards/Spec 双轴并行并复审。
  - 问题与修复: Standards 发现直接 `cloneNode(true)` 可能复制交互/外链属性，改为 `cloneNativeIcon` 白名单复制 SVG 图形节点与属性；Spec 发现同名工具可能错配，改为优先按 `callId/data-chat-call-id`，再按 toolName fallback，并为 Think/节点优先按 host key 匹配。复审仍提示真实 host DOM 的子节点协议与 GUI 时序缺少自动化 harness，作为非阻断风险记录。
  - 复审结论: Standards 通过（无 hard finding）；Spec Pass；无新增 Fowler hard finding。
