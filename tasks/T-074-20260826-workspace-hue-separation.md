---
doc-type: task
mutation: lifecycle
id: T-074
---

# T-074 工作区徽标同屏最小色相间距消解

状态: active
关联: R-01-003/AC-08、AC-12 → 活动状态模型
风险等级: standard

## 背景与目标

C-029 全弧均匀取色上线后，东家刷新实测仍只看到蓝、紫两类。用真实工作区路径计算确认：当前可见子集恰落在 212°–296°，属于独立哈希取色无法避免的小样本偶然聚集。需求演进（AC-08 稳定性补同一可见集合语义、新增 AC-12 同屏最小间距）与 DESIGN/DOMAIN/DECISIONS（C-031～C-033）已经闸口确认：24° 小步干跑仍只得到蓝紫；48° + 111° 贪心在 500 组六工作区性质验证中失败 424 组；东家最终确认改用七色感知锚点 + 确定性槽位消解。

## 差距评估

- `src/core.mjs`：仅有逐身份 `workspaceHue(key)` 基色函数，无集合级冲突消解。
- `src/client.mjs`：`renderCardInto` 各自直接调用 `workspaceHue(entry.workspaceKey)`，不知道同屏其他工作区。
- `scripts/check.mjs`：仅验证总体分散与样例两两相异，未验证同屏最小间距、输入顺序稳定及超容量有限终止。
- `scripts/acceptance.mjs`：未要求同屏可见工作区色相保持明显间距。

## 收敛方案

- `src/core.mjs`：新增 `resolveWorkspaceHues(keys)`。身份清洗、去重、排序后，以稳定基色确定七色锚点 `[30,78,126,174,222,270,318]` 的起始槽；冲突时依次选择空闲槽，≤7 个保证锚点唯一与圆周距离 ≥48°；>7 个时选择使用次数最少的槽以均衡复用。保留 `workspaceHue` 作为集合无关基色。
- `src/client.mjs`：每次可见条目同步时一次性求 `resolveWorkspaceHues([...active, ...recent].map(entry => entry.workspaceKey))`；映射经参数传入 `renderCardIntoList` / `renderCardInto`，不引入模块级状态。相同条目身份序列已由 `cardSignature` 覆盖，无需新增签名分量。
- `scripts/check.mjs`：新增 AC-12 锚点，覆盖真实聚集子集跨色区分散、≤7 个占满七锚点且任意两色相圆周距离 ≥48°、输入顺序与重复项不影响结果、空身份忽略、>7 个均衡复用；bundle 断言渲染层使用集合映射。
- `scripts/acceptance.mjs`：补同屏最小色相间距人工判定。

## 测试计划

- 测试先行：先导入并断言 `resolveWorkspaceHues`（函数不存在时失败），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 双轴审核与同 reviewer 复审。
- 集成前同步最新 canonical main；若 provisional T-ID 冲突，按未发布冲突规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：真实聚集子集经消解后任意两色相圆周距离至少 48°、覆盖明显不同色区 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceHues`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：空白身份被忽略、重复身份只映射一次 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceHues` |
| 边界配置 | 适用：7 个同屏工作区占满七锚点；超过 7 个时均衡复用且结果仍在避红锚点集 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceHues` |
| 副作用 | 适用：输入顺序不影响映射；同一工作区全部卡片同色；稳定签名与胶囊几何不变 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-12`、`src/client.mjs::renderCardIntoList` |

## 终态与证据
