---
doc-type: task
mutation: lifecycle
id: T-135
---

# T-135 数量徽标分子改为运行中数并新增悬停 tips

状态: active
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

（待验证后填写）
