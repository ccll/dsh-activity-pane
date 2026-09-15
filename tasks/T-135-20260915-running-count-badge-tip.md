---
doc-type: task
mutation: lifecycle
id: T-135
---

# T-135 数量徽标分子改为运行中数并新增悬停 tips

状态: completed
关联: R-01-001/AC-04、AC-05（口径演进）、R-01-001/AC-08（新增）→ 活动状态模型 / 窗格渲染器
风险等级: standard

## 背景与目标

东家提出：数量徽标 n/m 的分子原为等待行动数（完成提醒为主），但用户更关心「还有多少会话正在运行」。将分子改为正在运行的主会话数——随会话逐一完成递减至 0；分母（活动主会话总数）不变。为提醒语义变化，三处数量徽标（列头/窄条/移动端开关）新增悬停 tips 说明分子/分母口径。R-01-001/AC-04、AC-05 原地演进，新增 AC-08。

## 差距评估

- `src/core.mjs`：`countBadgeState` 以 waiting 为分子拼接 `text` 与 aria 文案，无悬停提示字段。
- `src/client.mjs`：`setCountBadgeContent` 只写文本与 data-awaiting/data-tone，不写 `title`。
- `scripts/check.mjs`：`countBadgeState` 单测断言旧语义（分子=等待行动数）。
- `e2e/specs/auto-update.mjs`：三处断言 `1/1`（旧语义）且 `badgeSnapshot` 不采集 `title`。
- `scripts/acceptance.mjs`：人工验收口径描述旧分子语义。

## 收敛方案

- `src/core.mjs`：`countBadgeState` 分子取 `running = total − waiting`；aria 文案改为「N 个活动会话，R 个正在运行（，B 个等待你答复）（，D 个已完成）」；新增 `tip` 字段（单点派生悬停提示文案，loading 态为空）。
- `src/client.mjs`：`setCountBadgeContent` 计数态写入 `title`（值未变不重写）、加载态摘除，三处徽标共用。
- PRD：AC-04 分数形式改「运行中数/活动主会话总数」、AC-05 分子改「正在运行者（随会话完成递减至 0）」、新增 AC-08 悬停提示。
- DESIGN：活动状态模型「徽标计数与脉冲提醒」条目同步分子口径、`title` 写入与加载态摘除。

## 测试计划

- `node scripts/check.mjs`（countBadgeState 新语义 + tips 单测）。
- `node e2e/run.mjs auto-update`（三处徽标 0/1 与 title tips 断言）。
- `pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：徽标分子为 running 数、新增 title 悬停 tips（加载态摘除） | UNIT/E2E | update | 活动状态模型条目同步 |
| R-01-001/AC-04 | 改写：分数形式分子改「运行中数」 | E2E | update | `e2e/specs/auto-update.mjs#R-01-001/AC-04`（完成提醒场景 0/1 断言）+ `scripts/check.mjs` 单测 |
| R-01-001/AC-05 | 改写：分子为正在运行的主会话数（total−waiting），随完成递减至 0 | UNIT | update | `scripts/check.mjs#R-01-001/AC-05`（`countBadgeState` 口径断言） |
| R-01-001/AC-08 | 新增：悬停数量标识显示「运行中的会话 <运行中数> / 总会话 <活动主会话总数>」悬浮提示 | E2E | update | `e2e/specs/auto-update.mjs#R-01-001/AC-08`（header/rail/toggle title 断言） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：全部会话运行中显示 total/total，完成后逐一递减（如 2/3） | `e2e/specs/auto-update.mjs#R-01-001/AC-04`、`src/core.mjs::countBadgeState` |
| 异常 | 适用：加载态归一为 spinner 且摘除 title；错误轴维持计数呈现 | `scripts/check.mjs#R-01-014/AC-06`、`src/core.mjs::countBadgeState` |
| 边界配置 | 适用：空态 0/0、纯完成提醒、阻塞与完成混合三态 aria 文案 | `scripts/check.mjs#R-01-001/AC-05`、`e2e/specs/auto-update.mjs::emptyBadge` |
| 副作用 | 适用：脉冲门控、tone 优先级与分母口径不变；title 仅随计数态增删，不影响 aria-live 文本去重 | `scripts/check.mjs#R-01-002/AC-06`、`src/client.mjs::setCountBadgeContent` |

## 终态与证据

- 实现: `src/core.mjs` `countBadgeState` 分子取 `running = total − waiting`（随会话完成递减至 0），`text` 改 `${running}/${total}`，aria 文案以「N 个活动会话，R 个正在运行」开头、阻塞/完成计数追加说明，新增 `tip` 字段单点派生悬停提示文案（loading 态为空串）；`src/client.mjs` `setCountBadgeContent` 计数态写入 `title`（值未变不重写）、加载态 `removeAttribute("title")`，列头/窄条/移动端开关三处徽标共用；`.dsh-plugin/client.js` 经 `node scripts/check.mjs` 从工作树重建并过 staged 一致性校验。
- 测试: `pnpm verify` 全量通过——17 个 E2E spec；`scripts/check.mjs` 新增/改写 `countBadgeState` 七项断言（loading/空态/阻塞/混合/纯完成/aria/文案）与两条 bundle 契约（title 写入与摘除）；`e2e/specs/auto-update.mjs` badgeSnapshot 采集 `title` 并断言三处徽标 tips 与 0/1 新口径；agentmap lint 157 AC 全锚定；test-impact 记录 `+R-01-001/AC-08`、`~R-01-001/AC-04`、`~R-01-001/AC-05`。
- DESIGN 对照: PRD R-01-001/AC-04、AC-05 改写分子口径并新增 AC-08；DESIGN 活动状态模型「徽标计数与脉冲提醒」条目同步分子派生式、`title` 悬停 tips 文案与加载态摘除、「渲染层只写文本、`title`、data-awaiting 与徽标 tone」；`scripts/acceptance.mjs` 人工验收口径同步；DOMAIN 无数量标识词条无需同步——map 与 code 对照无差异。
- commit: 2913575
- review:
  - 审核方: Standards reviewer `3c72f63e-7d04-4f64-b092-7a53da113527`；Spec reviewer `92d45006-e713-483c-92fd-3c88806aab67`（`code-review` skill 并行双轴）
  - 目的理解: R-01-001/AC-04、AC-05 演进后数量徽标分子为运行中主会话数（running = total − waiting，随会话完成递减至 0），分母与子代理排除口径不变；AC-08 新增悬停 tips（定稿文案「运行中的会话 <数字> / 总活动会话 <数字>」）；PRD/DESIGN/验收口径与测试同次同步。审核基线为工作区 diff vs HEAD 153c226。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核；修复后由 Standards 审核方复审该一行改动并确认关闭。
  - 问题与修复: 硬违规 1 项（双轴同报）——`scripts/acceptance.mjs` 新增 AC-08 验收步骤行尾 `,,,` 使 steps 数组产生两处空洞、人工验收清单编号跳号；已修复为单个逗号，审核方实测清单编号 1..86 连续、finding 关闭。judgement call 2 项（非阻塞）：tips 文案模板三处字面量重复（与仓库 bundle 契约字面量锚定风格一致，判可接受）；check.mjs `bundle.includes` 断言耦合实现源码（既有风格，非新违规）。Spec 轴弱点提示 1 项：加载态 title 摘除仅有 bundle 字符串断言、无运行时行为断言，证据强度可接受。
  - 复审结论: 双轴通过——Standards 轴确认修复 hunk 干净且维持其余结论；Spec 轴确认 spec 达成完整、aria 文案重排为计划内口径同步而非 scope creep；无新 finding。
