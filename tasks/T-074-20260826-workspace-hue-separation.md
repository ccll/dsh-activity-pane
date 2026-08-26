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

C-029 全弧均匀取色上线后，东家刷新实测仍只看到蓝、紫两类。用真实工作区路径计算确认：当前可见子集恰落在 212°–296°，属于独立哈希取色无法避免的小样本偶然聚集。需求演进（AC-08 稳定性补同一可见集合语义、新增 AC-12 同屏最小间距）与 DESIGN/DOMAIN/DECISIONS（C-031～C-034）已经闸口确认：24° 小步干跑仍只得到蓝紫；48° + 111° 贪心在 500 组六工作区性质验证中失败 424 组；东家最终确认改用七色感知锚点 + 确定性槽位消解。

## 差距评估

- `src/core.mjs`：已有七色 HSL 锚点与集合级槽位消解，但撞槽按相邻 `+1` 探测；同起始槽身份被刻意分配到相邻分类色。
- `src/client.mjs`：已有同屏统一映射，但 CSS 使用 HSL 固定 S/L、文字混入 currentColor、底/边在 sRGB 混合；HSL 数值角与人眼感知距离不均匀，混色又使分类色发灰。
- `scripts/check.mjs`：已验证锚点唯一与圆周角距离，但未验证 OKLab 感知距离、跨色区 `+3` 探测及 OKLCH bundle 契约。
- `scripts/acceptance.mjs`：已有间距判定，但仍以 HSL 角度描述，未要求撞槽工作区跨明显色区。

## 收敛方案

- `src/core.mjs`：七锚点改为 OKLCH hue `[55,100,145,190,235,280,325]`；保留稳定起始槽公式，撞槽探测改为 `+3` 跨色区顺序（遍历全部 7 槽）；≤7 个锚点唯一，>7 个仍按最少使用次数均衡复用。
- `src/client.mjs`：映射与参数接线不变；CSS 改为 OKLCH——深色文字 L0.78/C0.16、浅色 L0.48/C0.15，文字直接使用调色板色；底/边在 OKLCH 空间混合（深 14%/34%，浅 10%/28%）。
- `scripts/check.mjs`：AC-12 锚点改新调色板；增加撞槽 `+3` 精确映射、七色唯一、深浅主题最小 OKLab 距离 ≥0.11、>7 均衡复用与 OKLCH bundle 断言。
- `scripts/acceptance.mjs`：人工步骤改为感知色区判定，明确当前三个路径应呈橙/青/蓝紫。

## 测试计划

- 测试先行：先导入并断言 `resolveWorkspaceHues`（函数不存在时失败），实现后 `pnpm build:client && pnpm check` 转绿。
- `python3 tools/agentmap_lint.py --report`；`git diff --check`。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 执行。
- 独立 `code-review` skill 双轴审核与同 reviewer 复审。
- 集成前同步最新 canonical main；若 provisional T-ID 冲突，按未发布冲突规则重排。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：真实撞槽子集经 `+3` 探测分到橙/青/蓝紫，深浅主题文字色最小 OKLab 距离至少 0.11 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceHues`、`src/client.mjs::renderCardInto` |
| 异常 | 适用：空白身份被忽略、重复身份只映射一次 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceHues` |
| 边界配置 | 适用：7 个同屏工作区占满七个 OKLCH 锚点；超过 7 个时均衡复用且结果仍在避红调色板 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceHues` |
| 副作用 | 适用：输入顺序不影响映射；同一工作区全部卡片同色；稳定签名与胶囊几何不变 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-12`、`src/client.mjs::renderCardIntoList` |

## 终态与证据
