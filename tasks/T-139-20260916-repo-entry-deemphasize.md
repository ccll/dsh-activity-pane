---
doc-type: task
mutation: lifecycle
id: T-139
---

# T-139 仓库入口弱化并移至档位切换按钮左侧

状态: completed
关联: R-01-022/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家指示（UI/UX 改进，PRD 不变）：工具按钮区内的 GitHub 仓库入口（T-138 交付）当前与档位切换按钮同视觉强度（带描边、位于其右侧），与档位切换等主操作平级。目标：仓库入口移到档位切换按钮左侧、去掉描边弱化视觉强度，悬停提示改为「报告问题」——工具区以档位切换为主、仓库入口为辅。

## 差距评估

- `src/client.mjs`：模板中 `.dap-repo` 位于 `.dap-density` 之后；`.dap-repo` 带 1px 描边；`aria-label`/`title` 为「打开 GitHub 仓库」。
- `scripts/check.mjs`：浅色主题覆盖断言把 `.dap-repo` 与 border-color 声明绑在一组，去边框后断言失效。
- `e2e/specs/repo-entry.mjs`：断言可访问名称为「打开 GitHub 仓库」；无顺序、边框与悬停提示断言。
- `scripts/acceptance.mjs`：R-01-022 人工步骤未覆盖新观感。
- `DESIGN.md`：仓库入口条目写「与档位切换按钮同视觉语言」。
- PRD：R-01-022 三条 AC 均不涉及顺序、边框与提示文案，不变。

## 收敛方案

- `src/client.mjs`：模板内 `.dap-repo` 移到 `.dap-density` 之前；`.dap-repo` 去掉 border 声明；`aria-label`/`title` 改「报告问题」；浅色主题覆盖拆分——底色并入 `.dap-top`/`.dap-density`/`.dap-repo` 同组，border-color 仅留 `.dap-top`/`.dap-density`。
- `scripts/check.mjs`：浅色主题覆盖断言改为拆分后的两组声明。
- `e2e/specs/repo-entry.mjs`：可访问名称期望改「报告问题」，新增悬停提示 title、无边框（computed border-style）与位于档位按钮左侧的断言（提示/顺序/无边框属设计细节，断言标 T-139；可访问名称标 AC-01）。
- `e2e/specs/compact-density.mjs`：`collapseHintState` 的 `gapToTools` 锚点从 `.dap-tools .dap-density`（旧顺序的工具区首颗按钮）改为 `.dap-tools` 容器左缘，语义「紧邻工具区左侧」不感知按钮顺序。
- `scripts/acceptance.mjs`：R-01-022 人工步骤补「档位按钮左侧、无边框弱化」观感点。
- `DESIGN.md`：仓库入口条目改为「位于档位切换按钮左侧、无边框弱化视觉、悬停提示报告问题」。
- PRD/DOMAIN 不变。

## 测试计划

- `pnpm check`（bundle 从工作树重建并过契约断言）。
- `pnpm verify` 全量门禁（含 `e2e/specs/repo-entry.mjs`）。
- 独立 `code-review` skill 审核至通过。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 修改：仓库入口视觉与位置描述 | E2E | update | DESIGN 由本 task 记录：`e2e/specs/repo-entry.mjs` 新增顺序断言 |
| R-01-022/AC-01 | 修改：可访问名称文案；位置/边框/悬停提示观感 | E2E/MANUAL | update | label→`e2e/specs/repo-entry.mjs#R-01-022/AC-01`；提示/顺序/无边框→`e2e/specs/repo-entry.mjs#T-139`、`scripts/check.mjs#仓库入口位于档位切换按钮左侧且悬停提示为「报告问题」（T-139）`；观感人工→`scripts/acceptance.mjs#R-01-022/AC-01` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：仓库入口位于档位按钮左侧、悬停提示「报告问题」、无边框 | `e2e/specs/repo-entry.mjs#R-01-022/AC-01`、`src/client.mjs::ensurePane` |
| 异常 | 适用：纯锚元素无状态耦合，外壳重挂载随骨架恢复 | `src/client.mjs::ensurePane` |
| 边界配置 | 适用：窄条/抽屉显隐不变；浅色主题底色别名覆盖保持 | `e2e/specs/repo-entry.mjs#R-01-022/AC-03`、`scripts/check.mjs#浅色主题底色取外壳 layer-2 别名`、`src/client.mjs::ensurePane` |
| 副作用 | 适用：不触碰会话数据与档位交互；档位按钮交互不变 | `e2e/specs/compact-density.mjs#R-01-021/AC-05`、`src/client.mjs::ensurePane` |

## 终态与证据

- 实现: `src/client.mjs` 模板内 `.dap-repo` 移至 `.dap-density` 之前（工具区左侧）、去掉 `border` 声明（无边框、保留不透明底色圆形）、`aria-label`/`title` 统一「报告问题」；浅色主题覆盖拆组——`.dap-repo` 只并入底色组，`border-color` 组仅留 `.dap-top`/`.dap-density`；`.dsh-plugin/client.js` 经 `node scripts/check.mjs` 从工作树重建并过 staged 一致性校验。
- 测试: `pnpm verify` 全量通过——agentmap lint 161 AC 全锚定、test-impact（unit=145/e2e=96/manual=109）、check 全断言、18 个 E2E spec 全绿；`e2e/specs/repo-entry.mjs` 断言可访问名称与悬停提示「报告问题」、computed border-style 为 none、位于档位切换按钮左侧（repoX < densityX）；`e2e/specs/compact-density.mjs` 的 `gapToTools` 锚点改为 `.dap-tools` 容器左缘后全绿；`scripts/check.mjs` 新增工具区顺序/悬停提示与无边框 bundle 契约断言；`scripts/acceptance.mjs` R-01-022 人工步骤补新观感点。
- DESIGN 对照: PRD R-01-022 三条 AC 未变，与 DESIGN 追溯索引、窗格渲染器仓库入口条目（左移、无边框弱化、悬停提示「报告问题」）对照无差异；断言锚定按「AC 承诺 vs 设计细节」拆分——可访问名称挂 R-01-022/AC-01，顺序/提示/无边框挂 T-139。
- commit: 21904e9
- review:
  - 审核方: 独立 reviewer（code-review skill 双轴并行子代理：Standards、Spec）
  - 目的理解: 代码解决的是东家对 T-138 交付的仓库入口的弱化诉求（左移、去描边、悬停提示改文案），关联约束为 PRD R-01-022 三条 AC 不变、DESIGN 同变更同步、测试锚定与 bundle 同步门禁；预期行为为工具区以档位切换为主、仓库入口为辅，且三层测试证据（check/e2e/acceptance）锚定新观感。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行子代理评审 HEAD→工作树 diff（实现提交前），标准源为 AGENTS.md/CONVENTIONS.md/DOMAIN.md，spec 源为东家指示 + 本 task。
  - 问题与修复: Standards 发现 2 条判断性发现——断言锚定超出 AC 承诺（设计细节挂 AC-01）、check.mjs 新断言与既有 `.dap-repo` CSS 前缀断言重复——均已修复（设计细节断言改标 T-139、重复断言合并为单条双锚点断言），同一审核方复审通过；Spec 轴无缺失、无错误实现。
  - 复审结论: 通过（无新增发现；非阻断残留 1 条已处置——本 task 测试影响行归属随复审建议同步更正）
- 残余风险/知悉项: aria-label 由「打开 GitHub 仓库」改为「报告问题」超出东家字面要求（仅悬停 tips），为 label/title 一致性的 a11y 连带取舍；链接目的地仍为仓库首页而非 issue 页，如需更精确的「报告问题」指向可后续单独评估 `href` 指向 issues 页（会触碰 R-01-022/AC-01 正文，需另走需求变更）。
