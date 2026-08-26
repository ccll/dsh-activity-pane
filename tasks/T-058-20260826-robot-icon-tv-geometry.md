---
doc-type: task
mutation: lifecycle
id: T-058
---

# T-058 机器人图标改小电视几何并修复半像素模糊

状态: active
关联: R-01-012、R-01-013 → 窗格渲染器
风险等级: standard

## 背景与目标

东家在实际渲染中发现：机器人图标与同行文字居中对齐后视觉偏下（原单折线天线占格顶、头部与底座墨量偏下，墨质心低于几何中心约 1px）；且比相邻 canonical 图标模糊。东家明确要求改为 bilibili 小电视式（去双耳、头顶两条外撇短斜天线）。经三轮现场试验（translateY(-1px) 墨迹补偿 → 去天线 → 小电视几何 + 12px 盒 + stroke 2.2）逐档确认后定稿，东家要求提交。

查证定位模糊根因：13px 字形盒在 14px 图标盒内产生 0.5px 半像素居中偏移，所有描边边缘落在物理像素之间被抗锯齿抹灰；且机器人是全图标表唯一 stroke 描边图标（渲染 1.18px、无实心核），canonical 图标均为 fill 实心剪影。

map 演进同次完成：PRD R-01-012/AC-11 演进（12px 同盒、整数像素对齐、描边渲染宽度与 canonical 填充轮廓相当）；DESIGN 三处同步（显示行图标条目、归属约束、时间线用户行标识与图标几何条目）；DECISIONS 追加 C-021（废弃 F 方案原版几何与 13px 字形盒，含被否方案）。

## 差距评估

- `src/client.mjs`：已实现——`createRobotIcon` 去双耳与旧天线、双 45° 短斜天线（`M10 8L7 5` / `M14 8L17 5`）、stroke-width 2.2、viewBox 保框 `1 3 22 18`；删除 `data-icon="robot"` svg 13px 覆盖规则回归 12px 盒。
- `scripts/check.mjs`：机器人几何断言族已随新几何改写（含负向断言：无双耳/旧天线/1.3px 描边/13px 覆盖/24 留白框）。
- `scripts/acceptance.mjs`：R-01-012/AC-11 人工验收点已补小电视几何与清晰度口径。
- PRD/DESIGN/DECISIONS：已同次演进，无差距。

## 收敛方案

单提交收敛：实现（src/client.mjs + 重建 .dsh-plugin/client.js）+ 测试（check.mjs、acceptance.mjs）+ map（PRD/DESIGN/DECISIONS）同次入库。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（断言改写后复绿）。
- `python3 tools/agentmap_lint.py --report` 追溯完整。
- GUI 现场验收已由东家逐档现场确认（三轮试验均热更可见）。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：机器人行为小电视几何（双斜短天线、无双耳）、12px 盒、stroke 2.2、viewBox 保框 | `scripts/check.mjs#R-01-012/AC-09`、`scripts/check.mjs#R-01-012/AC-11`、`src/client.mjs::createRobotIcon` |
| 异常 | 不适用：纯静态 SVG 几何与 CSS 变更，无运行期输入分支 | — |
| 边界配置 | 适用：深浅主题均 currentColor 描边无新增色值；12px 盒在 14px 图标盒内偏移为整数 1px（DPR 1/2 均整数设备像素） | `src/client.mjs::createRobotIcon`（stroke: currentColor）、`scripts/check.mjs#R-01-012/AC-11` |
| 副作用 | 适用：同一工厂函数驱动时间线与最近卡两处机器人图标保持同源；旧几何（M12 8V4H8、M2 14h2/M20 14h2 双耳、1.3px 描边、13px 覆盖、24 留白框）无残留 | `scripts/check.mjs#R-01-012/AC-09`（负向断言组）、`src/client.mjs::createRobotIcon` |
| 兼容性 | 适用：bundle 随实现同步重建（pnpm build:client），热更链路不变；最近卡预览行图标盒 12px 口径与时间线一致（原 R-01-013/AC-07、AC-08 不变） | `scripts/check.mjs#R-01-013/AC-07`、`src/client.mjs::createRobotIcon` |

## 终态与证据

（关闭时填写）
