---
doc-type: task
mutation: lifecycle
id: T-043
---

# T-043 数量徽标 n/m 化与等待占比驱动的同色脉冲

状态: active
关联: R-01-001/AC-04、R-01-001/AC-05、R-01-001/AC-06、R-01-002/AC-06、R-01-002/AC-07 / 活动状态模型
风险等级: standard

## 背景与目标

东家确认将列头数量徽标从纯数字升级为 `n/m` 进度形式：m 为活动主会话总数（running + awaiting），n 为其中处于等待响应状态者；子代理与 parent 层级上下文卡不计入（用户不与它们直接交互，谈不上等待响应），其信息仍由卡片与层级连接线承载。n=0 时照样显示 `0/m`（含空态 `0/0`）。n>0 时废弃现有红色渐变脉冲，改为与等待卡片背景同色的脉冲；脉冲频率随 n/m 占比单调加快并有上限，全部等待时逼近该上限，传达"堆积的待处理会话越来越多"的紧迫感。

东家视觉反馈修正：原实现脉冲作用于整体不透明度，半透明时深棕底透进列头背景几乎不可见；改为亮度呼吸脉冲（底色全程与等待卡完全同色同透明度），并补齐与等待卡相同的边框与 1px 外环。

## 差距评估

- 现状徽标文本为 `String(active.length)`，把 subagent/parent 一并计入，且无等待量级信息（仅 `data-awaiting` 二值红色渐变 + 固定 1.2s 脉冲）。
- 计数口径需收窄为主会话二划分（running|awaiting），派生逻辑应落在 core 层纯函数以便单测；渲染层只做呈现写入。
- `.dap-count` / `.dap-rail-count` / `.dap-toggle-count` 三处镜像面的 `[data-awaiting]` 变体均为红色渐变，需统一换为等待卡背景同色（深色 `rgba(35,31,25,.97)`、浅色 `--dsw-alias-state-warn-tertiary`）并接入可变周期。
- `check.mjs` 既有断言钉住旧红色脉冲（`animation: dap-await-pulse 1.2s ease-in-out infinite`）与渐变色值，必须随行为同步改写；`acceptance.mjs` 第 119/121 条人工验收描述同步更新。

## 收敛方案

- core.mjs 新增两个纯函数：
  - `awaitBadgeStats(entries)` → `{ waiting, total }`：分子为 awaiting 主会话数，分母为其加 running 主会话之和。
  - `awaitPulsePeriod(waiting, total)` → 秒数或 null：占比 r=n/m 线性映射周期 [0.5s, 1.6s]，全部等待取 0.5s 上限频率，无等待/非法输入返回 null 表示不脉冲。
- client.mjs 渲染层：countText 改为 `${waiting}/${total}`；三处镜像面同步；`data-awaiting` 仅在 n>0 时置位；按占比写 `--dap-await-period` 自定义属性（值未变不写，沿用防重复播报纪律）；补 aria-label（「m 个活动会话，n 个等待响应」）。
- CSS：`[data-awaiting]` 变体底色改等待卡背景同色并去掉固定时长，动画周期走 `var(--dap-await-period, 1.6s)`；浅色主题加覆盖块；keyframes 与动画名称不变。
- PRD：R-01-001 AC-04 重写为分数形式并新增 AC-05（口径）、AC-06（空态 0/0）；R-01-002 新增 AC-06（同色脉冲）、AC-07（单调加快 + 上限）。
- DESIGN：「活动状态模型」关键机制新增徽标计数与脉冲条目；需求追溯索引两行落点更新。

## 测试计划

- `scripts/check.mjs` 核心单测：awaitBadgeStats 口径（含 subagent/parent 排除、空表）、awaitPulsePeriod 两端封闭性与单调性（锚定 R-01-001/AC-05、AC-06、R-01-002/AC-07）。
- `scripts/check.mjs` bundle 契约：新底色/浅色覆盖块存在、旧红渐变色值消失、周期自定义属性写入存在、计数与周期经核心函数派生。
- `scripts/acceptance.mjs`：人工验收步骤同步（n/m 呈现、同色脉冲、频率随比例加快封顶、空态 0/0）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：n/m 文本、同色脉冲、频率随占比加快 | `scripts/check.mjs#R-01-001/AC-05`、`scripts/check.mjs#R-01-002/AC-07`、`src/client.mjs::awaitBadgeStats(active)` |
| 异常 | 不适用：纯呈现派生，无失败路径；非法输入由 awaitPulsePeriod 归一为不脉冲 | `scripts/check.mjs#R-01-002/AC-07` |
| 边界配置 | 适用：空态 0/0、单会话全等待达上限、subagent/parent 不计入、浅色主题覆盖 | `scripts/check.mjs#R-01-001/AC-06`、`src/client.mjs::setAwaitPulsePeriod` |
| 副作用 | 适用：三处镜像面一致、aria-live 防重复播报纪律保持、DOM 结构不变 | `scripts/check.mjs#R-01-002/AC-04`、`src/client.mjs::aria-live`、`scripts/acceptance.mjs#R-01-002/AC-06、AC-07 同色占比脉冲` |

## 终态与证据

（关闭时填写）
