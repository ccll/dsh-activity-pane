---
doc-type: task
mutation: lifecycle
id: T-043
---

# T-043 数量徽标 n/m 化与等待占比驱动的同色脉冲

状态: completed
关联: R-01-001/AC-04、R-01-001/AC-05、R-01-001/AC-06、R-01-002/AC-06、R-01-002/AC-07 / 活动状态模型
风险等级: standard

## 背景与目标

东家确认将列头数量徽标从纯数字升级为 `n/m` 进度形式：m 为活动主会话总数（running + awaiting），n 为其中处于等待响应状态者；子代理与 parent 层级上下文卡不计入（用户不与它们直接交互，谈不上等待响应），其信息仍由卡片与层级连接线承载。n=0 时照样显示 `0/m`（含空态 `0/0`）。n>0 时废弃现有红色渐变脉冲，改为与等待卡片背景同色的脉冲；脉冲频率随 n/m 占比单调加快并有上限，全部等待时逼近该上限，传达"堆积的待处理会话越来越多"的紧迫感。

东家视觉反馈修正：原实现脉冲作用于整体不透明度，半透明时深棕底透进列头背景几乎不可见；改为亮度呼吸脉冲（底色全程与等待卡完全同色同透明度），并补齐与等待卡相同的边框与 1px 外环。

后续需求演进：本 task 建立的 `n/m`、主会话计数口径、`0/0` 与占比驱动周期继续有效；徽标描边与外环已由 T-054 删除，等待状态底色已由 T-071、T-078、T-080 演进为错误 > 阻塞 > 完成的三类 tone。关闭时按当前 PRD、DESIGN 与测试记录最终证据，不把已被后续需求替代的视觉细节声明为现状。

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

- 实现: 历史实现链 `fe0a2c01ffb66b160ad9c8d73673661e0cda3bd0`、`ae353a24e1f4de2d3cbedee0ea96e4b4fec91885` 建立 `n/m`、仅统计主会话、空态 `0/0`、占比周期与亮度脉冲；后续 T-054 删除描边与外环，T-071、T-078、T-080 演进为错误 > 阻塞 > 完成三类 tone。发布前修复提交使 tone 优先级与条目顺序无关，并统一移动开关 blocked/done/error 的底色与实际 DOM selector 作用域。
- 测试: `scripts/check.mjs` 覆盖计数口径、周期端点与单调性、tone 逆序优先级、三镜像底色与 selector 契约；`auto-update.mjs` 在浏览器中覆盖空态无脉冲、完成态列头/窄条/移动开关的 n/m、tone、computed background、周期与动画，以及阻塞态金底；`error-reminder.mjs` 覆盖错误红底与脉冲。最终 `pnpm verify` 全绿，11/11 E2E spec 通过（127.467s）。
- DESIGN 对照: 当前 DESIGN 描述 `n/m`、占比脉冲和三类 tone/无描边现状；与实现一致。task 原计划中的边框细节已按后续需求演进显式收口，不再声明为当前事实。
- commit: 970ec526c157162be0780ae254fd0ad74153eb6e
- review:
  - 审核方: Standards reviewer `e156fa4c-f0fd-46c9-bca3-736689a22eee`；Spec reviewer `cbaa86d7-90aa-41da-a18c-00e481363d63`（含分项子审）
  - 目的理解: 核实 T-043 的 `n/m`、主会话口径、`0/0` 与占比周期仍被当前需求承接，并正确区分后续视觉演进。
  - 执行方式: `code-review` skill 双轴审核当前 HEAD、历史实现提交及 T-054/T-071/T-078/T-080 的后续契约。
  - 问题与修复: Standards 初审发现 task 未承接后续视觉演进并遗漏核心实现链，已补演进说明及可达历史 commits。Spec 发现 tone 优先级受条目顺序影响、移动开关 blocked 底色不一致、done/error selector 被错误 pane 作用域挡住，且三处徽标缺浏览器证据；`970ec526c157162be0780ae254fd0ad74153eb6e` 修复实现并补空态、三镜像、三类 tone、computed background、周期和脉冲 E2E。
  - 复审结论: 同一 Standards 与 Spec reviewer 确认全部 findings 关闭，无新增 finding，允许关闭。
