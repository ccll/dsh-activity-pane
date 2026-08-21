---
doc-type: task
mutation: lifecycle
id: T-012
---

# T-012 时间线动作图标与状态呈现

状态: active
关联: R-01-012 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

活动卡工作项时间线与主会话网页的动作语义存在四处视觉偏差：

- 用户项没有人物图标。
- 错误项可能复制到 disclosure 下拉箭头，且未将动作文字染红。
- Bash 图标受原生行状态/展开态影响。
- 动作标题与摘要之间缺少圆点分隔符。

## 差距评估

- `nativeWorkItemPresentation` 当前直接取 disclosure 内第一个 `svg`，原生错误行的 `StateDot` 没有 SVG 时会退回箭头；展开行也只剩箭头。
- 用户项当前 fallback 为 `◎`，不是人物图标。
- 时间线 CSS 只将轨道圆点染红，未将动作 SVG、标题和摘要染红。
- 标题与摘要在同一 flex 行中直接相邻，没有原生网页的圆形分隔符。
- DSH 原生 Bash 的 canonical icon 是 `IconApiOutline14`；当前复制逻辑会因状态/展开态丢失动作图标，造成看起来不稳定。

## 收敛方案

- 从原生 `iconIdle` 容器中读取动作 SVG，排除 disclosure hover/open 箭头与错误 `StateDot`；Bash 固定使用 `IconApiOutline14` 对应的内联 SVG，保证状态变化不漂移。
- 用户工作项使用固定的人物轮廓 SVG。
- 错误项继续使用动作图标，仅通过 `data-status="error"` 把图标、动作标题和摘要染为错误红色。
- 在存在摘要时，在动作标题与摘要之间插入 2px 圆形分隔符。
- 不改变时间线数据顺序、callId 匹配、历史降级、订阅生命周期或卡片布局。

## 测试计划

- `scripts/check.mjs`：增加用户图标、Bash canonical icon、错误保留图标/红色样式、分隔符 DOM/CSS 契约断言。
- `pnpm build:client && pnpm check`。
- `python3 tools/agentmap_lint.py --report`。
- `git diff --check`。
- `scripts/acceptance.mjs`：人工检查用户项、失败 Bash/其它工具、展开态 Bash 和分隔符。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：用户/Bash/Think 等工作项保留动作语义并显示分隔符 | `scripts/check.mjs#R-01-012/AC-03`、`scripts/check.mjs#R-01-012/AC-05`、`scripts/check.mjs#R-01-012/AC-07`、`scripts/check.mjs#R-01-012/AC-08`、`src/client.mjs::renderTrace` |
| 异常 | 适用：错误状态不替换动作图标，图标/标题/摘要统一红色 | `scripts/check.mjs#R-01-012/AC-06`、`src/client.mjs::nativeWorkItemPresentation`、错误 CSS |
| 边界配置 | 适用：展开/收起、无原生行、无摘要和冷会话 fallback 不出现箭头误用 | `scripts/check.mjs#R-01-012/AC-03`、`scripts/check.mjs#R-01-012/AC-06`、`scripts/check.mjs#R-01-012/AC-07`、`src/client.mjs::findNativeActionIcon` |
| 副作用 | 适用：不改变 timeline order、callId 匹配、订阅和历史 fallback | `scripts/check.mjs#R-01-012/AC-02`、`scripts/check.mjs#R-01-012/AC-03`、`src/client.mjs::renderTrace`、`src/client.mjs::syncLiveness` |

## 终态与证据

- 实现: 待完成。
- 测试: 待完成。
- DESIGN 对照: 待完成。
- commit: 待完成。
- review:
  - 审核方: 待完成。
  - 目的理解: 待完成。
  - 执行方式: 待完成。
  - 问题与修复: 待完成。
  - 复审结论: 待完成。
