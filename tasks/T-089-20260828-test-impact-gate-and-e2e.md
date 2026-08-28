---
doc-type: task
mutation: lifecycle
id: T-089
---

# T-089 测试影响门禁与高价值 E2E 完善

状态: active
关联: C-045、C-046、C-057、C-058、C-059 → E2E 验证基建、验证门禁
风险等级: standard

## 背景与目标

现有 AgentMap strict 门禁保证 128 个 AC-ID 均有文本锚点，但不能感知 AC 正文在 ID 不变时的语义修改，也不区分自动测试与人工验收。`scripts/check.mjs` 在 pre-commit 中按工作树重建 bundle，不能独立证明 staged source 与 staged `.dsh-plugin/client.js` 一致。浏览器 E2E 已覆盖主生命周期与 Host/SSE 接缝，但运行态时间线、加载状态和部分键盘路径仍缺少可观察证据。

本 task 以最小增量收敛三类风险：测试影响遗漏、提交对象不一致、关键跨边界行为缺口。

## 差距评估

- `tools/agentmap_lint.py` 是 canonical runtime contract，不应为项目特例修改。
- 当前 lint 对 AC 新增/删除只校验锚点集合；AC 正文修改不触发测试联动。
- `scripts/acceptance.mjs` 与自动测试同属 `测试锚点路径`，报告不能区分自动/人工证据。
- `scripts/check.mjs` 会写 `.dsh-plugin/client.js`；pre-commit 检查的是工作树，不保证 index 中 source/bundle 同步。
- E2E runner 每 spec 独立 Chromium/context/web 且固定顺序，C-047/C-058 已证明不应以浏览器复用或重试换取速度。
- R-01-009 运行态动态、R-01-014 加载状态与若干键盘路径仍主要由单元/人工证据承接。

## 收敛方案

1. 新增项目级测试影响检查器，不修改 canonical `agentmap_lint.py`：
   - 比较 Git 基线与 staged/工作树中的 PRD AC；识别新增、正文修改与删除。
   - 新增或修改 AC 时，要求同次变更触碰包含该 AC-ID 的自动测试或人工验收步骤；允许 active task 以结构化 `none` 条目说明仅措辞澄清。
   - DESIGN 变化时要求 active task 提供「测试影响」记录，明确受影响 AC、验证层与动作。
   - 报告自动测试、E2E、人工验收覆盖数；证据类别由登记路径推导，不自动生成测试。
2. 在 pre-commit 增加 staged source/bundle 一致性检查：
   - 从 index 内容生成期望 bundle，不依赖未暂存工作树。
   - 与 index 中 `.dsh-plugin/client.js` 比较；不一致时失败并提示重建、重新暂存。
   - 日常 `pnpm check` 保持现有重建行为，服务开发/HMR 流程。
3. 保持每 spec 独立 Chromium 与零重试策略，补最小高价值 E2E：
   - 扩展现有 spec 的 Enter/Space 键盘路径。
   - 用确定性 mock 剧本验证运行态 tool/stream/timeline 的浏览器可观察更新。
   - 用可控测试注入验证列表或字段 loading → ready，不使用固定网络节流。
4. 更新 CONVENTIONS、DESIGN 与验证入口登记；不恢复自动 hosted CI，本 task 只为后续恢复提供更可信的 fast gate。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 验证基建设计演进 | UNIT/E2E | update | tools 测试影响自测、staged bundle 负例、完整 pnpm verify |
| R-01-005/AC-01 | 键盘路径补强，需求不变 | E2E | update | e2e/specs/navigation.mjs |
| R-01-008/AC-02 | 键盘路径补强，需求不变 | E2E | update | e2e/specs/mobile-drawer.mjs |
| R-01-008/AC-06 | 键盘路径补强，需求不变 | E2E | update | e2e/specs/mobile-drawer.mjs |
| R-01-018/AC-02 | 键盘路径补强，需求不变 | E2E | update | e2e/specs/back-to-top.mjs |
| R-01-009/AC-01 | 进行中 tool partial 的浏览器窗口不稳定，需求不变 | UNIT | none | 保留 scripts/check.mjs 的工作项派生断言；E2E 只锚定落定 tool 与后续 stream，不过度声明 AC-01 |
| R-01-009/AC-02 | 运行态 stream 时间线更新证据补强，需求不变 | E2E | update | e2e/mock-llm.mjs runtime 剧本与 e2e/specs/auto-update.mjs |
| R-01-009/AC-03 | 运行态状态变化证据补强，需求不变 | E2E | update | e2e/mock-llm.mjs runtime 剧本与 e2e/specs/auto-update.mjs |
| R-01-014/AC-01 | 列表 loading→ready 浏览器证据补强，需求不变 | E2E | add | 可控 loading-ready spec |
| R-01-014/AC-03 | 同一页面渐进呈现证据补强，需求不变 | E2E | add | 可控 loading-ready spec |
| R-01-014/AC-06 | 数量标识 loading→count 证据补强，需求不变 | E2E | add | 可控 loading-ready spec |

## 测试计划

- 测试影响检查器 self-test：AC 新增、正文修改、删除、仅注释锚点、测试文件未改、waiver、DESIGN 无影响记录等正反例。
- staged bundle 检查：匹配通过；staged source 改而 bundle 未更新失败；重新 stage bundle 后通过；未暂存工作树不影响 index 判定。
- 新增/扩展 E2E 单 spec 定向通过。
- `pnpm verify:fast`、`pnpm verify`、`git diff --check` 全绿。
- 独立 `code-review` skill 双轴审核；findings 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：PRD/DESIGN 变化必须显式重新审视测试，关键 UI 接缝有浏览器证据 | `tools/agentmap_lint.py::check_test_anchors`、`e2e/run.mjs::runSpec` |
| 异常 | 适用：AC 改文未触碰证据、DESIGN 无测试影响记录、staged bundle 过期均必须失败 | `.githooks/pre-commit::for script`、`scripts/check.mjs::clientSource` |
| 边界配置 | 适用：自动/E2E/人工证据按路径分类；纯措辞可结构化说明 none | `CONVENTIONS.md::测试锚点路径`、`scripts/acceptance.mjs::steps` |
| 副作用 | 适用：pre-commit 不再以工作树重建结果冒充 staged 证据；开发 check/HMR 行为保留 | `.githooks/pre-commit::pre-commit.d`、`scripts/build-client.mjs::export async function build` |
| 性能 | 适用：diff 门禁仅扫描 Git 文本；E2E 不增加跨 spec 共享或重试 | `package.json::verify:fast`、`e2e/run.mjs::MAX_CONCURRENCY` |
| 恢复 | 适用：普通 E2E 失败继续直接暴露，失败取证沿用 screenshot/stderr | `e2e/run.mjs::captureFailure` |
| 兼容性 | 适用：canonical AgentMap lint 不修改，项目检查器仅依赖 Python 标准库与 Git | `tools/agentmap_lint.py::check_runtime_contract`、`scripts/build-client.mjs::readFile` |
| 可观测性 | 适用：报告显示 AC 总数及 unit/e2e/manual 分类，并列出本次受影响 AC | `tools/agentmap_lint.py::print_result`、`e2e/run.mjs::suiteStart` |

## 终态与证据

待实现完成后填写。
