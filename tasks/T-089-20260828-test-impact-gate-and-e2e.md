---
doc-type: task
mutation: lifecycle
id: T-089
---

# T-089 测试影响门禁与高价值 E2E 完善

状态: completed
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
| R-01-014/AC-03 | 卡片字段部分先就绪需要独立 detail fixture，需求不变 | UNIT | none | loading-ready 仅验证列表级 pending→ready；保留 scripts/check.mjs 的渐进字段派生断言，避免过度锚定 |
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
| 成功 | 适用：PRD/DESIGN 变化必须显式重新审视测试，关键 UI 接缝有浏览器证据 | `tools/test_impact_lint.py::evaluate`、`e2e/specs/loading-ready.mjs::loadingReady`、`e2e/specs/auto-update.mjs::runtimeCard` |
| 异常 | 适用：AC 改文未触碰证据、DESIGN 无测试影响记录、staged bundle 过期均必须失败 | `tools/test_impact_lint.py::self_test`、`scripts/check-staged-client.mjs::stagedBundle` |
| 边界配置 | 适用：自动/E2E/人工证据按路径分类；纯措辞只允许 exact subject、合法验证层、none 动作与具体理由 | `tools/test_impact_lint.py::valid_impact_row`、`tools/test_impact_lint.py::row_covers` |
| 副作用 | 适用：pre-commit 不再以工作树重建结果冒充 staged 证据；开发 check/HMR 行为保留 | `scripts/check-staged-client.mjs::staged`、`scripts/build-client.mjs::export async function build` |
| 性能 | 适用：diff 门禁仅扫描 Git 文本；E2E 不增加跨 spec 共享或重试 | `package.json::verify:fast`、`e2e/run.mjs::MAX_CONCURRENCY` |
| 恢复 | 适用：普通 E2E 失败继续直接暴露，失败取证沿用 screenshot/stderr | `e2e/run.mjs::captureFailure` |
| 兼容性 | 适用：canonical AgentMap lint 不修改，项目检查器仅依赖 Python 3.7.9+ 标准库与 Git | `tools/agentmap_lint.py::check_runtime_contract`、`tools/test_impact_lint.py::run_git` |
| 可观测性 | 适用：报告显示 AC 总数及 unit/e2e/manual 分类，并列出本次受影响 AC | `tools/test_impact_lint.py::Test impact report`、`e2e/run.mjs::suiteStart` |

## 终态与证据

- 实现: `34532be` 新增项目级 `tools/test_impact_lint.py`、pre-commit/pre-push 测试影响 hooks、自动/E2E/manual 分类报告与 staged client bundle 字节一致性门禁；`c7a639e` 新增 `loading-ready.mjs`，扩展 runtime tool→slow stream 与卡片/标题/窄条/移动抽屉/回顶键盘路径；`387de3e`、`dc8f3b6`、`764ae93` 按独立审核收紧目标 remote outgoing range、Git 错误处理、exact subject、验证层与 none 理由，并移除 R-01-014/AC-03 过度锚定。
- 测试: `tools/test_impact_lint.py --self-test` 覆盖 AC 增改删、staged 证据、非法/空泛 none、DESIGN 记录、跨 remote 新 ref 与 Git 错误；临时 Git fixture 实测 staged source 变化而 bundle 未暂存时失败，重建并暂存后通过；定向 E2E 6/6 通过（64.638s）；最终 `pnpm verify` 12/12 spec 通过（E2E 132.576s），`pnpm verify:fast`、`git diff --check` 通过。首次完整 pre-push 的既有 completion-sync readiness 6s 超时直接失败、未重试；单 spec 诊断随后通过，最终完整套件通过。
- DESIGN 对照: `DESIGN.md#E2E 验证基建` 已登记测试影响门禁、staged 产物门禁、runtime 剧本、显式 fragment loading 接缝与零重试隔离模型；实现未修改 canonical AgentMap lint，未复用 Chromium，默认 URL 不启用 loading 接缝。E2E 锚定由 55 提升到 62，R-01-014/AC-03 保留 unit/manual，不以部分证据过度声明。
- commit: 34532be c7a639e 387de3e dc8f3b6 764ae93
- review:
  - 审核方: Standards reviewer `573397a8-54d9-4d50-8772-2ac6bf4ae345`；Spec reviewer `e8c3d162-57a1-4724-a2a7-19dc957fb959`
  - 目的理解: 两位 reviewer 均先确认 T-089 要在不修改 canonical lint、不自动生成测试、不复用 Chromium和不增加 E2E 重试的前提下，实现 PRD/DESIGN diff 测试影响复审、staged source/bundle 一致性及运行态/loading/键盘浏览器证据。
  - 执行方式: `code-review` skill，固定基线 `b9dd873...HEAD`；Standards 与 Spec 双轴并行初审，所有修复均由原 reviewer 复审。
  - 问题与修复: Standards 初审发现结构化 row 未校验、新 remote ref 可能被其它 remote-tracking ref 漏检、Git 读取错误被吞；修复后又指出 `layer=none` 与空泛长理由仍可绕过。Spec 同时发现 R-01-014/AC-03 只测空列表却过度锚定。分别以目标 remote 范围、显式 Git missing/error 区分、合法层/动作/exact subject、none 语义词与负例、移除 AC-03 E2E 锚点并记录 unit 承接收敛。
  - 复审结论: Standards 与 Spec 最终均通过；全部 findings 关闭，无新增 hard violation、规格缺失、行为错误、scope creep 或 Fowler smell。
