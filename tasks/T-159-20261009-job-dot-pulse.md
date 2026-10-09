---
doc-type: task
mutation: lifecycle
id: T-159
---

# T-159 后台任务子卡状态点活性脉冲（光晕与闪烁）

状态: completed
关联: R-01-023（AC-09 新增）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 东家观察到后台任务子卡里的小蓝点不闪烁。
- 查证结论: 三层自洽，非缺陷——R-01-023 各 AC 从未承诺状态点闪烁（AC-05 只承诺状态点存在）。
  - SOLUTION 同样未承诺闪烁，实现自引入（6bb73f0，T-149）即静态、无回归。
  - 结论属需求缺口，东家确认（2026-10-09）立项补活性表达。
- 观感依据: 运行中主卡与运行中子代理卡的状态点均以 `dap-pulse 1.2s` 闪烁。
  - 任务子卡因此成为活动区唯一「在跑而不闪」的卡。
  - 任务卡无末行提示结构，状态点即天然的闪烁载体。
- 目标: 任务子卡第一行状态点以固定脉冲节奏闪烁并带同色相柔和光晕。
  - 着色随任务状态区分：运行中任务蓝，停止中琥珀。
- 非目标: 不改等待卡标题状态点静止纪律（R-01-002/AC-08，C-040）。
  - 不引入与等待末行脉冲的相位同步机制。
  - 不改 host 侧、core 侧与任务子卡其它呈现。

## 差距评估

- PRD.md: R-01-023 无状态点活性 AC，新增 AC-09。
- SOLUTION.md: 任务子卡的呈现落点缺脉冲与光晕的方案描述。
- src/client.mjs: `.dap-job-dot` 无 box-shadow 与 animation（client.mjs:748-752）。
  - stopping 分支只换 background，不动动画。
- scripts/check.mjs: 无任务子卡状态点的动画与光晕契约。
- e2e/specs/background-jobs.mjs: 只断言 `dotStatus` 数据态，不断言动画与光晕。
- scripts/acceptance.mjs: 无 AC-09 人工步骤。

## 收敛方案

1. `src/client.mjs`（纯 CSS，零 JS 改动）：
   - `.dap-job-dot` 基态只承载几何（尺寸与圆角），活性呈现全部按状态门控。
   - running 与 stopping 的分组规则承载 `animation: dap-pulse 1.2s ease-in-out infinite`。
   - running 规则承载任务蓝着色与同色相光晕 `box-shadow: 0 0 6px rgba(101,160,255,.8)`。
   - stopping 规则换琥珀着色与光晕 `rgba(245,165,36,.8)`。
   - AC-09 的「运行中或停止中」条件由 CSS 显式表达，不依赖跨层隐式前提（双轴复审修复）。
   - `prefers-reduced-motion` 不特判，沿既有纪律（reduced-motion 只关进度填充过渡，不关状态脉冲）。
2. `scripts/check.mjs`: bundle 契约断言状态点动画与光晕声明，及 stopping 色相分支。
3. `e2e/specs/background-jobs.mjs`: 黄金路径断言运行态状态点的 computed 动画与光晕。
4. `scripts/acceptance.mjs`: AC-09 人工浏览器步骤。
5. `.dsh-plugin/client.js` 随实现重建（`pnpm check`），pre-commit 校验 staged 一致。

## 测试计划

- `scripts/check.mjs`（bundle 契约，锚定 R-01-023/AC-09）：状态点 animation 与光晕声明、stopping 色相分支。
- `e2e/specs/background-jobs.mjs`（browser）：运行态任务子卡状态点 computed 动画与光晕断言。
- `scripts/acceptance.mjs`（manual）：AC-09 人工步骤。
- 红绿序: 先落 check.mjs 锚点跑 `node scripts/check.mjs` 证红（bundle 尚无动画），再落 CSS 证绿。
- `pnpm verify:fast` 编辑循环，`pnpm verify` 全量回归。
- 浏览器人工验证（黄金路径）：热更后以真实后台任务会话核对闪烁与光晕观感，汇报附截图证据。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-023/AC-09 | 新增 | UNIT/browser/manual | add | `scripts/check.mjs` 状态点脉冲与光晕契约；`e2e/specs/background-jobs.mjs` computed 断言；`scripts/acceptance.mjs` 人工步骤 |
| SOLUTION | 任务子卡状态点脉冲与光晕方案落点演进 | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行态任务子卡状态点闪烁并带同色相光晕 | `scripts/check.mjs#R-01-023/AC-09`、`e2e/specs/background-jobs.mjs#R-01-023/AC-09`、`src/client.mjs::dap-job-dot` |
| 异常 | 适用：非在跑状态无任何活性呈现（基态只承载几何）；stopping 换琥珀色相与光晕 | `scripts/check.mjs#R-01-023/AC-09`、`src/client.mjs::renderJobCardInto` |
| 边界配置 | 适用：明暗两主题光晕观感，紧凑档仅保留行 1 时脉冲照常 | `scripts/acceptance.mjs#R-01-023/AC-09`、`src/client.mjs::dap-job-dot` |
| 副作用 | 适用：零 JS 与零 host 改动，签名与激活语义不变，等待卡静止纪律不受影响 | `package.json::verify` |

## 终态与证据

- 实现: `src/client.mjs`——任务子卡状态点活性呈现全量按状态门控：基态只承载几何（6px 圆点），running 规则承载任务蓝 `#65a0ff` 着色与同色相光晕 `box-shadow: 0 0 6px rgba(101,160,255,.8)`，stopping 规则换琥珀 `#f5a524` 着色与琥珀光晕，running/stopping 分组规则承载 `animation: dap-pulse 1.2s ease-in-out infinite`（与运行中主会话卡标题状态点同关键帧同周期）；AC-09 的「运行中或停止中」条件由 CSS 显式表达，不依赖 liveJobs 过滤的跨层隐式前提。零 JS、零 host 改动。`scripts/check.mjs` 新增四段 bundle 契约锚点（基态无活性呈现、running 蓝、stopping 琥珀、分组脉冲，均纯选择器 needle + 块内 includes）；`e2e/specs/background-jobs.mjs` 新增运行态 computed 断言（animationName 为 dap-pulse、boxShadow 非 none）；`scripts/acceptance.mjs` 新增 AC-09 人工步骤（AC 原文口径）。PRD R-01-023 新增 AC-09、SOLUTION 任务子卡落点补活性呈现门控方案（ea3256a 同次演进，004c2ee 补门控措辞）；`.dsh-plugin/client.js` 每次变更同次重建。
- 测试: 红绿序先行——先落 check.mjs 锚点跑 `node scripts/check.mjs` 证红（bundle 无动画），落 CSS 后证绿。`pnpm verify` 全量三轮通过（实现 ea3256a 工作树、修复 a712629 工作树、修复 004c2ee 工作树各一轮）：AgentMap lint（28 需求/178 AC 全锚定）、test impact（+R-01-023/AC-09 记账）、`scripts/check.mjs` 全部断言、20/20 浏览器 E2E（439665ms / 438805ms / 435911ms），热静默门禁 rAF 73/69 次均低于阈值 80。单 spec `node e2e/run.mjs background-jobs` 每轮随改复跑通过。隔离环境相位采样证据：任务子卡状态点 opacity 0.375→0.706→0.949 随 400ms 采样推进、animationName 恒为 dap-pulse、boxShadow rgba(101,160,255,.8)；另存两帧卡面截图与窗格全景（tmp-harness/job-dot-*.png，不入库）。
- SOLUTION 对照: PRD R-01-023/AC-09 与实现逐条对应——活性呈现按状态门控、同色相光晕（运行中蓝/停止中琥珀）、dap-pulse 1.2s 与主卡状态点同源同周期；SOLUTION 落点（任务子卡呈现 bullet）与实现无差异；data-status 缺失帧、jobStatus 恒为 running/stopping、job 卡不跨 kind 复用等前提经评审员逐点核实；无残留差异。
- commit: ea3256a 实现与 map 演进；a712629 复审修复一轮（动画门控、验收措辞收编）；004c2ee 复审修复二轮（活性呈现全量门控、锚点四段化、文档同步）
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = ea3256a vs 011db72；修复轮由两轴原审核方分别复审 a712629 与 004c2ee hunks，共三轮）
  - 目的理解: 把 R-01-023/AC-09（任务子卡状态点在运行中或停止中时固定脉冲闪烁 + 同色相光晕、着色随状态区分、节奏与主卡同源）落为可验证实现；约束——零 JS/零 host 改动、不引入相位同步机制、等待卡标题状态点静止纪律不受影响、AC 条件由 CSS 显式表达；验证方式 = check.mjs 四段契约 + background-jobs e2e computed 断言 + acceptance 人工步骤 + 全量 verify。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS 工程原则 + CONVENTIONS + Fowler smell 基线；Spec 轴对照 PRD R-01-023/AC-09 + T-159 收敛方案/测试计划 + SOLUTION 落点），两轴独立并行，每轮修复后同审核方复审。
  - 问题与修复: ①【Spec·中低】animation 与蓝光晕无条件入基态、仅靠 LIVE_JOB_STATUSES 跨层隐式前提成立且无测试钉住 → animation 移入 running/stopping 分组规则（a712629），着色与光晕随后一并门控、基态只承载几何（004c2ee），check.mjs 四段锚点钉住门控形状；②【Spec·低】acceptance 人工步骤加塞 AC-09 外判据（时长逐秒推进属 AC-05、协调观感无规格出处）→ 措辞收编 AC-09 原文口径（a712629）；③【Spec·低】task 验证矩阵「异常」行残留「脉冲沿用基态」旧表述与收敛方案矛盾 → 004c2ee 同步为「非在跑状态无任何活性呈现」；④【Standards·低】check.mjs indexOf+slice 抽块惯例重复累积（全文件约 8 处）→ 属既有 bundle 契约惯例的累积债务，按聚焦修改不顺手重构、维持已记录；⑤【Standards·低】stopping 探针把首条声明并入选择器 needle 怕重排版 → 004c2ee 改为纯选择器 needle + 块内 includes，已消除。
  - 复审结论: 两轴三轮复审均通过，全部发现闭环、无新增阻断。残余风险与测试缺口：e2e 光晕断言只判非 none、未判蓝色相（同色相由 check.mjs 字符串契约与 acceptance 人工步骤承载）；真实窗格观感（深浅主题、光晕与卡面蓝染协调）待东家按 acceptance 步骤验收，已附隔离环境相位采样与两帧截图；check.mjs 抽块惯例重复（既有累积债务，已记录）。
