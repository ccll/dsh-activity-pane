---
doc-type: task
mutation: lifecycle
id: T-131
---

# T-131 中间档显示时间线最新一行

状态: completed
关联: R-01-021/AC-08 → 窗格渲染器
风险等级: standard

## 背景与目标

T-130 交付三档显示后，东家实测提出：中间档看不到「当前正在做什么」——希望中间档展示一行时间线，即完整时间线的最新一行（当前正在执行或最近完成的工作项，含执行中状态实时更新）。R-01-021/AC-08 原地演进（中间呈现从「隐藏时间线」改为「保留时间线最新一行」）。

## 差距评估

- `src/client.mjs`：`renderTimelineArea` 已原生支持 `lastOnly` 单行渲染（子代理卡 `.dap-subtrace` 在用），但运行卡与等待卡的 `.dap-trace` 调用未传；渲染签名不含显示档位，档位切换不会触发时间线按新档位重建。
- e2e：中间档断言为「时间线隐藏」，需改为「仅末行可见」。

## 收敛方案

- `src/client.mjs`：运行卡（kind=running）与等待卡（kind=awaiting）的 `renderTimelineArea` 调用传 `lastOnly: densityLevel === "medium"`——中间档时间线只渲染末行（真实当前执行或最近完成的工作项，含 running 闪烁），紧凑档仍整体隐藏（CSS）；`densityLevel` 纳入渲染签名，档位切换触发一轮重渲染使时间线按新档位重建。
- 子代理卡 `.dap-subtrace` 维持既有 `lastOnly: true`（与中间档口径天然一致）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：中间档时间线为渲染层 lastOnly 单行（末行含 running 实时更新），档位纳入渲染签名 | UNIT/E2E | update | 产品契约与内部结构条目同步为 lastOnly 口径 |
| R-01-021/AC-08 | 改写：中间档保留时间线最新一行 | E2E | update | `e2e/specs/compact-density.mjs#R-01-021/AC-08`（trace 末行可见 + 单行断言） |

## 测试计划

- `pnpm build:client && pnpm check`。
- `node e2e/run.mjs compact-density`（中间档 trace 末行断言）。
- `pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：中间档每卡时间线仅显示最新一行且含 running 实时更新 | `e2e/specs/compact-density.mjs#R-01-021/AC-08`、`src/client.mjs::renderTrace` |
| 异常 | 适用：非法档位回退完整；空时间线时不渲染虚假末行 | `scripts/check.mjs#R-01-021/AC-06`、`src/core.mjs::normalizeDensity` |
| 边界配置 | 适用：紧凑档仍整体隐藏时间线；子代理卡 subtrace 既有 lastOnly 口径不变 | `e2e/specs/compact-density.mjs#R-01-021/AC-02`、`src/client.mjs::renderTimelineArea` |
| 副作用 | 适用：档位纳入渲染签名后仅档位切换触发一轮重渲染，其余渲染仍签名去重；卸载清理不变 | `e2e/specs/compact-density.mjs#R-01-021/AC-07`、`src/client.mjs::applyDensity` |
| 兼容性 | 适用：完整/紧凑档行为与 T-130 一致 | `e2e/specs/compact-density.mjs#R-01-021/AC-02`、`scripts/acceptance.mjs#R-01-021/AC-03`、`src/client.mjs::renderTimelineArea` |

## 终态与证据

- 实现: `src/client.mjs` 运行卡与等待卡的 `renderTimelineArea` 调用传 `lastOnly: densityLevel === "medium"`——中间档时间线仅渲染末行（当前正在执行或最近完成的工作项，含 running 闪烁），与子代理卡 `.dap-subtrace` 既有口径一致；`densityLevel` 纳入渲染签名（档位切换经 queueSync 触发一轮重渲染）；锚定补偿移至渲染提交块后执行并按 `.dap-card[data-current]` 实时定位（量测含新行高、不持引用跨渲染）。
- 测试: `pnpm verify` 全量通过——16 个 E2E spec（compact-density 更新 AC-08 断言：trace 容器可见且 `.dap-trace-item` 恰 1 行，补 AC-03 medium 底色/AC-04 medium 跳转锚点）+ agentmap lint（155 AC 全锚定）+ test-impact（~AC-08）+ core 单测与 bundle 契约。
- DESIGN 对照: 产品契约「卡片紧凑呈现」条目改为 lastOnly 单行口径、内部结构条目同步（时间线行数由渲染层控制、签名含档位分量）、T-087 签名契约断言更新为含 densityLevel；DOMAIN「显示档位」词条语义已含中间档时间线末行。
- commit: 231de19
- review:
  - 审核方: Standards reviewer `baa877dc-97ba-4fc4-a822-7a6ab8a31301`；Spec reviewer `0e0d75d4-0360-4b21-85fe-18c870dee4ae`（code-review skill 并行双轴）
  - 目的理解: R-01-021/AC-08 演进后，中间档时间线以渲染层 lastOnly 仅渲染最新一行（真实当前执行或最近完成的工作项，含 running 实时更新），档位纳入渲染签名触发按档位重建，锚定补偿在渲染落地后量测补偿，跳转逻辑不感知档位。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `63edc51...231de19`；修复后基于工作树 `git diff HEAD` 复审。
  - 问题与修复: Spec 轴 3 项——(a1) AC-08 单行无有效测试锚点（mediumTraceLines 死变量 + 空时间线场景）：补单卡 evaluate 断言恰 1 行；(a2) DESIGN 自相矛盾残留（「渲染签名不感知档位」与档位纳入签名矛盾）：两处改述为「激活跳转逻辑不感知档位，渲染签名含显示档位分量」；(c1) 锚定补偿与 lastOnly 重建时序（重建在补偿后导致二次偏移）：重构为 onDensityClick 仅登记 pendingDensityAnchor，补偿移至 render() 渲染提交块后执行并按 data-current 实时定位。Standards 轴 5 项（2 硬违规 + 3 判断题）全部闭环：e2e 断言补齐、DESIGN 两处矛盾句改述、CSS 注释同步、锚定时序重构（同 Spec (c1)）、lastOnly 两处并列保留（与 .dap-subtrace 既有口径并列，审核方接受）。
  - 复审结论: Standards 与 Spec 两轴第三轮复审均确认全部 finding 关闭、无阻塞项，通过。
