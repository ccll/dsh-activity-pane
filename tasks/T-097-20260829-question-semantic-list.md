---
doc-type: task
mutation: lifecycle
id: T-097
---

# T-097 提问胶囊与语义化问题列表

状态: active
关联: R-01-002/AC-02、AC-09 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 待回复卡当前显示「问题」类型胶囊，并把提问拼成带 `Q` 前缀和换行的纯文本。
- 目标: 胶囊改为「提问」；问题正文改用语义化 HTML 列表，仅一个可展示问题时使用 bullet list，多个可展示问题时使用编号列表。
- 非目标: 不改变问题正文/header 回落、物理首行、尾冒号剥除、最多 3 条、原始序号对应关系及等待状态的颜色、图标、脉冲和解除语义。

## 差距评估

- `src/core.mjs` 的 `PENDING_LABELS.question` 仍为「问题」，`askQuestionsPreview` 把结构化问题提前拼成 `Q/Qn` 多行字符串。
- `src/client.mjs` 的 `.dap-note` 只写入 `textContent`，无法创建 `ul`/`ol`/`li` 语义结构。
- `scripts/check.mjs` 与 `scripts/acceptance.mjs` 锚定旧胶囊和 Q 行字符串契约。
- PRD R-01-002/AC-02、AC-09 已经东家确认并先行演进；DESIGN 方案已确认，待同步落盘。
- T-096 的进度百分比布局已作为独立 work unit 提交；本任务只修改同文件中的等待卡区域，不覆盖其改动。

## 收敛方案

1. `askQuestionsPreview` 返回结构化预览 `{ items: [{ index, text }], omitted }`，保留原始问题位置与省略语义。
2. 时间线与 awaiting 条目沿既有链路传递结构化预览；`noteText` 继续承载无可展示问题时的回落文案及其它等待类型正文。
3. 渲染器在待回复卡正文区按可展示条目数创建 `<ul>` 或 `<ol>`；编号项用 `li.value` 对齐原始问题位置，省略项隐藏 marker；所有动态文字继续通过 `textContent` 写入。
4. CSS 仅适配列表的缩进、margin、字体继承与省略项 marker，不改变等待卡其余视觉语义。
5. 同步 PRD、DOMAIN、DESIGN、DECISIONS、unit/contract 与 manual 验收证据，重建 client bundle。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-002/AC-02 | 待回复胶囊「问题」改「提问」 | UNIT/MANUAL | update | `pendingText("question")` 与人工验收改为「提问」 |
| R-01-002/AC-09 | Q 行纯文本改语义化 HTML 列表 | UNIT/E2E/MANUAL | update | 核心断言结构化预览；浏览器断言单问 `ul/li`、多问 `ol/li` 与原始序号；人工验收视觉 marker |
| DESIGN | 活动条目提问预览与渲染契约变化 | UNIT/E2E | update | 同步核心数据结构、DOM 元素与安全写入契约 |

## 测试计划

- 测试先行：先更新 `scripts/check.mjs` 的核心断言，并在 E2E 增加真实待回复卡 DOM 语义断言，确认旧实现失败。
- 运行 `pnpm verify:fast`。
- 运行受影响的 focused browser E2E。
- 运行 `pnpm verify`。
- 刷新现有 `http://127.0.0.1:3080/`，目验胶囊「提问」、单问 bullet、多问编号列表。
- 调用 `code-review` skill 做独立双轴审核并处理 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：胶囊为「提问」；单问 `ul/li`，多问 `ol/li` | `package.json::check` + `scripts/check.mjs#R-01-002/AC-02`、`package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-02`、`e2e/specs/auto-update.mjs#R-01-002/AC-09`、`package.json::accept:manual` + `scripts/acceptance.mjs#R-01-002/AC-09` |
| 异常 | 适用：非法 JSON、空列表、全部问题不可得时回落动作说明 | `package.json::check` + `scripts/check.mjs#R-01-002/AC-09` |
| 边界配置 | 适用：正文缺失回落 header、中间缺项保留原始编号、恰 3 条无省略、超过 3 条追加无 marker 省略项 | `package.json::check` + `scripts/check.mjs#R-01-002/AC-09`、`package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-09` |
| 副作用 | 适用：待确认、待审查、完成、错误正文仍为纯文本；动态问题文本不经 HTML 解析 | `package.json::check`、`package.json::test:e2e` + `e2e/specs/auto-update.mjs#R-01-002/AC-09` |

## 终态与证据

状态: active

- 实现: `src/core.mjs` 将待回复胶囊 canonical label 改为「提问」，`askQuestionsPreview` 改为 `{ items: [{ index, text }], omitted }` 结构化预览并经时间线/折叠组/awaiting 条目传递；`src/client.mjs` 在一个可展示问题时渲染 `ul/li`、多个时渲染 `ol/li` 并以 `li.value` 保留原始序号，省略项隐藏 marker，动态文字只经 `textContent` 写入；`.dsh-plugin/client.js` 已重建。回滚边界为本任务涉及的 R-01-002 文档、提问预览字段、列表渲染/CSS、multiask fixture 与对应验证证据，不包含 T-096 的进度行改动。
- 测试: 测试先行确认旧实现在 `pendingText("question")` 断言处按预期失败；`pnpm build:client && pnpm check` 通过；focused `node e2e/run.mjs auto-update` 1/1 通过（15.460s），真实浏览器验证单问 `UL` 与多问 `OL`；`pnpm verify` 12/12 通过（133.221s）；最终重建 bundle 后 `pnpm verify:fast` 通过；`git diff --check` 干净。运行边界为隔离 `$DSH_HOME` + mock LLM 的 `e2e:runtime` 单问与 `e2e:multiask` 多问剧本。
- DESIGN 对照: PRD R-01-002/AC-02、AC-09、DOMAIN 阻塞等待、DESIGN 核心结构/等待三类呈现/稳定签名已与实现一致；DECISIONS 追加 C-064，保留 C-041/C-043 历史。
- commit: 待提交。
- review:
  - 审核方: Standards reviewer `cdd16834-c1c1-4849-8cda-3f424867e3c2`；Spec reviewer `509ed56c-f5a1-45e9-83ff-934409c1d54b`。
  - 目的理解: 将待回复胶囊「问题」改为「提问」，并把 Q 前缀纯文本改为原生 `ul/ol/li`；保留正文/header 回落、物理首行、尾冒号剥除、最多 3 条、原始序号、等待视觉/解除语义与动态内容安全。
  - 执行方式: `code-review` skill，以 HEAD `6ebbe64d483073b2242e5a35cbf268f56cbf1f2c` 为固定基线审核当前工作树，明确排除 T-096 hunks；Standards/Spec 双轴独立并行。
  - 问题与修复: Standards 轴无 finding；Spec 轴无缺失需求、范围扩张或行为错误，无需修复。
  - 复审结论: 双轴均通过，无 finding。
