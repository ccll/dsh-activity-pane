---
doc-type: task
mutation: lifecycle
id: T-074
---

# T-074 工作区徽标同屏最小色相间距消解

状态: completed
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

- 实现: 可达实现链 `e64b3fee479043d6d0c571cf6d3acb0586bfde9f`、`dc4c87823798bfceada84430dddaa782f593d2a9` 依次建立七锚点集合映射与最终 OKLCH hue/步进 3 跨色区探测：同屏不超过 7 个工作区时锚点唯一，超过 7 个时确定性均衡复用；渲染层以 OKLCH 前景、底色和描边呈现深浅主题徽标。
- 测试: `scripts/check.mjs` 覆盖真实聚集样本、输入顺序稳定、空白/重复身份、七色唯一、超容量均衡、深浅主题 OKLab 距离 ≥0.11 与 bundle 契约；`card-content.mjs` 在真实浏览器中验证实际 hue 写入、深浅主题文字色、底色和描边。最终 `pnpm verify` 全绿，11/11 E2E spec 通过（127.467s）。
- DESIGN 对照: DESIGN 的徽标色相不变量、集合级映射与工作区徽标着色参数和当前实现一致，无差异。
- commit: dc4c87823798bfceada84430dddaa782f593d2a9
- review:
  - 审核方: Standards reviewer `e156fa4c-f0fd-46c9-bca3-736689a22eee`；Spec reviewer `cbaa86d7-90aa-41da-a18c-00e481363d63`（含分项子审）
  - 目的理解: 消除独立哈希在小样本同屏集合中的偶然蓝紫聚集，以可证明的七色感知锚点和确定性槽位消解兑现 R-01-003/AC-08～AC-12。
  - 执行方式: `code-review` skill 双轴审核当前 HEAD、历史实现提交、PRD/DESIGN 约束及现有自动/人工验证。
  - 问题与修复: Standards 要求补齐集合级消解首次实现与最终 OKLCH 调整的可达 commit 链；Spec 初审发现浏览器实际着色与主题接线只有静态/人工证据。已补完整历史链，并由 `970ec526c157162be0780ae254fd0ad74153eb6e` 在 `card-content.mjs` 增加真实浏览器 computed style 断言。
  - 复审结论: 同一 Standards 与 Spec reviewer 确认证据缺口关闭，无新增 finding，允许关闭。
