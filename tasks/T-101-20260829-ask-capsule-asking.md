---
doc-type: task
mutation: lifecycle
id: T-101
---

# T-101 提问等待胶囊文字改为「提问中」

状态: active
关联: R-01-002/AC-02 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 待回复卡当前显示「提问」类型胶囊。东家要求胶囊文字改为「提问中」，以更贴合等待动作进行时的语义。
- 目标: 阻塞等待的 question 种类胶囊文字由「提问」改为「提问中」；问号图标、金色阻塞语义、脉冲行为与正文列表均不变。
- 非目标: 不改变待确认/待审查胶囊、完成/错误胶囊、时间线 ask_user_question 工具行标签「提问」（镜像原生 keyed 行，非胶囊）、正文、列表结构与解除语义。

## 差距评估

- `src/core.mjs` 的 `PENDING_LABELS.question` 为「提问」，`pendingText("question")` 输出旧文字。
- `scripts/check.mjs` 两处锚点断言 `pendingText("question") === "提问"` 与条目 `pendingText === "提问"`。
- `e2e/specs/auto-update.mjs` 单问/多问待回复卡断言胶囊文字「提问」。
- `scripts/acceptance.mjs` 人工验收条目断言胶囊文字分别为「待确认」「待审查」「提问」。
- PRD R-01-002/AC-02、DOMAIN 阻塞等待、DESIGN 等待三类呈现的胶囊文字描述仍为「提问」。

## 收敛方案

1. `src/core.mjs` 的 `PENDING_LABELS.question` 改为「提问中」，并同步 `src/client.mjs` 胶囊文字注释。
2. 测试先行：更新 `scripts/check.mjs`、`e2e/specs/auto-update.mjs`、`scripts/acceptance.mjs` 的胶囊文字断言。
3. 重建 `.dsh-plugin/client.js`，运行快速验证与全量验证。
4. 同步 PRD、DOMAIN、DESIGN 的胶囊文字描述。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-002/AC-02 | 待回复胶囊「提问」改「提问中」 | UNIT/E2E/MANUAL | update | `pendingText("question")`、条目 `pendingText`、E2E 单问/多问胶囊断言与人工验收同时改为「提问中」 |
| DESIGN | 胶囊文字由 `pendingText(kind)` 归一 | UNIT | none | 结构、字段与渲染契约不变，仅 `PENDING_LABELS.question` 字面量变化，既有 pendingText 断言覆盖 |

## 测试计划

- 测试先行：先更新 `scripts/check.mjs` 的胶囊文字断言，运行确认旧实现在该断言处失败。
- 运行 `pnpm verify:fast`。
- 运行受影响的 focused browser E2E（auto-update spec）。
- 运行 `pnpm verify`。
- 刷新现有 `http://127.0.0.1:3080/`，目验待回复卡胶囊「提问中」。
- 调用 `code-review` skill 做独立双轴审核并处理 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：question 胶囊文字为「提问中」 | `package.json::check` + `scripts/check.mjs#R-01-002/AC-02`、`package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-02` |
| 异常 | 不适用：本变更仅字面量替换，不引入新输入面 | — |
| 边界配置 | 适用：待确认/待审查胶囊「待确认」「待审查」保持不变 | `package.json::check` + `scripts/check.mjs#R-01-002/AC-01、AC-02` |
| 副作用 | 适用：完成/错误胶囊与时间线 ask 标签「提问」不受影响 | `package.json::check`、`package.json::test:e2e` |

## 终态与证据

状态: active