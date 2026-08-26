---
doc-type: task
mutation: lifecycle
id: T-068
---

# T-068 工作区徽标按工作区身份派生稳定色相着色

状态: active
关联: R-01-003/AC-08、AC-09、AC-10 → 活动状态模型
风险等级: standard

## 背景与目标

活动卡与最近卡的工作区徽标（`.dap-workspace` 胶囊）目前一律继承卡片 currentColor，所有工作区同色，无法凭颜色区分归属。东家要求：同一工作区的所有胶囊颜色相同、不同工作区可区分、跨刷新稳定。需求演进（R-01-003 追加 AC-08/09/10）与 DESIGN/DOMAIN 演进已经两道闸口确认：以工作区身份（路径优先、名称兜底）为唯一输入的纯函数派生色相，无状态、无持久化。

## 差距评估

- `src/core.mjs`：条目只有 `workspaceTitle`，无工作区身份字段；无色相派生函数。
- `src/client.mjs`：`.dap-workspace` 三层配色（文字 90% / 底 11% / 描边 24%）全部基于 currentColor；渲染层不写任何色相变量。
- `scripts/check.mjs`：R-01-003 锚点仅覆盖归属判定、图标与字号，无色相断言。
- `scripts/acceptance.mjs`：无色彩区分人工验收步骤。

## 收敛方案

- `src/core.mjs`：新增 `workspaceInfoForSession`（单一路径判定归属并返回 `{ title, key }`，key = 路径优先、名称兜底；原 `workspaceTitleForSession` 随审核修复删除）；新增 `workspaceHue(key)`（djb2 哈希 → 十二槽 30° 量化 + 低位 ±10° 抖动，输出 [0,360) 整数，空身份返回 null）；`buildEntries`/`buildRecent` 条目补 `workspaceKey`（子代理随徽标隐藏置空）；`cardSignature` 并入 `workspaceKey`。
- `src/client.mjs`：`.dap-workspace` 基色改为 `hsl(var(--dap-workspace-hue) …)` 并经 color-mix 保持透明度层次，浅色主题校准基色明度；`renderCardInto` 显示徽标时写入 `--dap-workspace-hue`、隐藏时移除。胶囊几何与字号不变。
- `scripts/check.mjs`：R-01-003/AC-08/09/10 锚点（身份归一、色相纯函数性质、量化槽位、签名分量、bundle 接线）。
- `scripts/acceptance.mjs`：新增色彩区分人工验收步骤。
- 不新增依赖，不引入持久化。

## 测试计划

- 测试先行：`scripts/check.mjs` 锚点先写（旧实现下必红），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`：追溯与锚定完整。
- `git diff --check`。
- GUI 现场验收（同色一致、异色区分、刷新稳定、深浅主题协调）由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 审核。
- 集成：完成后 rebase 到最新 canonical main 并合并；若有其它 worktree 先入主干导致 T-ID/C-ID 冲突，按未发布冲突规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：同一工作区徽标恒同色、不同工作区色相分散、深浅主题协调可辨 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceHue`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：无归属会话徽标隐藏且不写色相；空身份 `workspaceHue` 返回 null | `scripts/check.mjs#R-01-003/AC-08`、`src/core.mjs::workspaceHue` |
| 边界配置 | 适用：工作区无路径时以名称为身份兜底；cwd 匹配以路径为身份；色相量化槽位 ±10° 抖动范围 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-09`、`src/core.mjs::workspaceInfoForSession` |
| 副作用 | 适用：胶囊几何/字号/图标不变（既有 bundle 断言保持）；色相变化经签名驱动重绘、签名去重不受新分量误触发 | `scripts/check.mjs#R-01-003/AC-06`、`scripts/check.mjs#R-01-003/AC-10`、`src/core.mjs::cardSignature` |

## 终态与证据

