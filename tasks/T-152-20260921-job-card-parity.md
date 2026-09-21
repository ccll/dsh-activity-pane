---
doc-type: task
mutation: lifecycle
id: T-152
---

# T-152 后台任务子卡与子代理一视同仁（连接线、两行呈现、底色区分）

状态: completed
关联: R-01-003（AC-04 正文修订）、R-01-023（AC-05～AC-07 新增）→ 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

- 背景: 东家观察——后台任务子卡与子代理子卡「同形同缩进」却没有层级连接线，追问是缺陷还是需求未覆盖。查证结论：R-01-003/AC-04 连接线只承诺子代理，R-01-023/024 未涉及连接线，实现以 kind 过滤有意排除（`trackRuns` kind 过滤、core 注释明示），非缺陷。
- 需求变更: 东家确认（2026-09-21）将后台任务子卡与子代理「一视同仁，看成同等的存在」——连接线同规则绘制；任务卡两行呈现（第一行工具名称 + 时长，第二行内容）；卡面底色与子代理卡区分。呈现细节东家选定：工具名友好映射（bash→Bash、pwsh→PowerShell、subagent→子代理，未知原样）；底色蓝调轻染（混入任务状态点同族蓝 #65a0ff）。
- 数据依据: DSH 快照 `SessionJob` 自带 `kind` 与 `label`（bash/pwsh 为命令原文、subagent 为任务描述）；插件 `liveJobsOf` 归一当前丢弃 `kind`。全部变更落在 client bundle，host 侧零改动（热更路径可浏览器实测）。
- 目标: job 子卡参与层级连接线轨道（与子代理同规则）；任务卡两行呈现工具名称与内容原文；卡面底色与子代理卡在明暗两主题下可辨区分。
- 非目标: 不改 job 子卡排序位置（保持母会话直接后继、先于全部子代理）；不做任务 kill 写路径；不改徽标计数口径（job 子卡仍不计入分子）；不改任务输出回放通道。

## 差距评估

- PRD.md: R-01-003 层级关系域仅子代理（陈述句与 AC-04）；R-01-023 无任务子卡呈现 AC → 陈述句扩展、AC-04 正文纳入后台任务卡、R-01-023 新增 AC-05/AC-06/AC-07。
- DESIGN.md: 显示过滤 bullet 写明 job 子卡「不参与轨道」、buildEntries job 子条目字段无工具名、层级结构与轨道层条目仅提子代理、无 job 卡两行与底色区分设计 → 同次演进。
- DOMAIN.md: 「层级连接线」术语限定子代理卡、「后台任务」任务视图字段缺工具类型、不变量 92 仅子代理跟随 → 同步扩展。
- src/core.mjs: `liveJobsOf` 丢弃 `kind`；job 子条目无工具名字段；`trackRuns` kind 过滤只认 subagent；签名未含 jobKind。
- src/client.mjs: job 卡单行骨架（dot+label+时长），无工具名行与内容行；底色与子代理卡相同；紧凑档规则未涉及 job 内容行。
- scripts/check.mjs: trackRuns 断言仅子代理拓扑；liveJobsOf 断言无 kind；无 R-01-023/AC-05～AC-07 锚点。

## 收敛方案

1. `src/core.mjs`：
   - `liveJobsOf` 归一携带 `kind`（非字符串归一空串；返回 `{ id, kind, label, status, startedAt }`）；
   - `buildEntries` job 子条目新增 `jobKind`（归一后的原始 kind）；
   - 新增导出纯函数 `jobKindLabel(kind)`（友好映射，未知原样、不可得空串）；
   - `trackRuns` kind 过滤放宽为 `subagent | job`，JSDoc 与注释同步（连接线一视同仁；徽标计数口径不变）；
   - `cardSignature` 并入 `jobKind`（liveJobs 对象自带 kind 已随既有签名覆盖）。
2. `src/client.mjs`：
   - job 卡骨架两行——行 1 = 状态点 + 工具名称（`jobKindLabel` 映射）+ 随时钟时长；行 2 = `.dap-job-content`（mono 内容原文、单行省略、原生 tooltip 完整原文，承接 R-01-024 既有 tooltip 语义）；
   - `renderJobCardInto` 更新：工具名文本、内容行填充与 tooltip、内容不可得整行隐藏（AC-06）；卡片级 `el.title` tooltip 移除（tooltip 归内容行）；
   - aria-label 并入工具名前缀；
   - CSS：job 卡底色在子代理卡底色上 color-mix 轻染 `#65a0ff`（明暗两主题同法），`.dap-job-content` 紧凑档隐藏、中间档保留。
3. `scripts/check.mjs`：
   - `trackRuns` 断言扩展：job 子卡产生轨道、job 与 subagent 混合序列按 preorder 保序、深度不符仍过滤；
   - `liveJobsOf`/`buildEntries` kind 归一断言；`jobKindLabel` 映射断言；
   - bundle 契约断言：job 卡两行骨架类、紧凑档隐藏规则、job 底色与子代理底色可辨区分；
   - 新锚点 R-01-023/AC-05、AC-06、AC-07；R-01-003/AC-04 断言更新。
4. `scripts/acceptance.mjs`：R-01-023/AC-05～AC-07 人工浏览器步骤（黄金路径）。
5. `.dsh-plugin/client.js` 随实现重建（`pnpm check`），pre-commit 校验 staged 一致。

## 测试计划

- `scripts/check.mjs`（UNIT/契约，锚定 AC-ID）：
  - R-01-003/AC-04：job 子卡与子代理同规则产生母会话轨道（唯一 job、job+subagent 混合、非法深度过滤）；
  - R-01-023/AC-05：`liveJobsOf` 携带 kind、`buildEntries` job 条目携带 jobKind、`jobKindLabel` 映射与兜底；
  - R-01-023/AC-06：内容不可得时条目 `title` 为空（渲染层隐藏行为由 bundle 契约 + 人工验收承载）；
  - R-01-023/AC-07：job 卡底色与子代理卡底色 CSS 值不同（bundle 契约断言）。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归（unit/contract + 全部浏览器 E2E）。
- 浏览器人工验证（黄金路径）：热更后以真实后台任务会话核对连接线、两行呈现、底色区分与输出展开交互，汇报附截图证据。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-003/AC-04 | 正文修改 | UNIT | update | `scripts/check.mjs` R-01-003/AC-04 trackRuns 断言同次更新（job 纳入轨道拓扑） |
| R-01-023/AC-05 | 新增 | UNIT | add | `scripts/check.mjs` kind 归一/映射/条目字段断言 + bundle 两行骨架契约 |
| R-01-023/AC-02 | 既有测试修正 | browser | update | `e2e/specs/background-jobs.mjs` 完成提醒抑制断言由「已完成」文本子串匹配修正为 `data-wait="done"` 结构判定（子串会误命中时间线末行 agent 回复「E2E 快速回合已完成。」，HEAD 代码同断言已复现失败；对照实验确认非本次回归、属既有断言缺陷）；新增回合回复前置等待与 3s 登记竞态复核（固定观察窗沿 mobile-resume.mjs 先例） |
| R-01-023/AC-06 | 新增 | UNIT/browser/manual | add | `scripts/check.mjs` 内容不可得断言（空 label 条目 + 纯空白 label 归一，修复轮补空白边界）；隐藏行为由 bundle 契约与人工步骤承载 |
| R-01-023/AC-07 | 新增 | UNIT/browser/manual | add | `scripts/check.mjs` 底色区分 CSS 契约断言（修复轮补浅色主题轻染断言）；`scripts/acceptance.mjs` 人工步骤 |
| DESIGN | 显示过滤 bullet、buildEntries 条目字段、层级结构与轨道层、job 卡呈现落点演进；修复轮 label 纯空白不可得归一与 jobKind 签名说明修正 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：job 子卡绘制连接线、两行呈现工具名与内容、底色区分 | `scripts/check.mjs#R-01-003/AC-04`、`scripts/check.mjs#R-01-023/AC-05`、`scripts/check.mjs#R-01-023/AC-07`、`src/core.mjs::jobKindLabel` |
| 异常 | 适用：kind/label 缺失或非法时兜底（工具名隐藏文本、内容行隐藏） | `scripts/check.mjs#R-01-023/AC-05`、`scripts/check.mjs#R-01-023/AC-06`、`src/core.mjs::liveJobsOf` |
| 边界配置 | 适用：job 与 subagent 混合层级、非直属/深度不符条目过滤、紧凑/中间档位切换 | `scripts/check.mjs#R-01-003/AC-04`、`src/core.mjs::trackRuns`、`scripts/acceptance.mjs#R-01-023/AC-07` |
| 副作用 | 适用：徽标计数口径不变（job 仍不计入）、输出展开与激活交互不变、签名连续、bundle 契约与全量回归 | `scripts/check.mjs#R-01-023/AC-04`、`package.json::verify` |

## 终态与证据

- 实现: `src/core.mjs`——`liveJobsOf` 归一携带 `kind` 并把纯空白 `label` 视为任务内容不可得（空串；非空白保留原文不 trim）；新增 `jobKindLabel` 友好映射导出（bash→Bash、pwsh→PowerShell、subagent→子代理，未知原样、不可得空串）并注明与渲染层状态词表的分层理由；`buildEntries` job 子条目携带 `jobKind`；`trackRuns` kind 过滤放宽为 `subagent | job`（连接线一视同仁，JSDoc 与注释同步）。`src/client.mjs`——job 卡两行骨架（行 1 = `.dap-job-dot` + `.dap-job-kind` + `.dap-job-elapsed` 右缘；行 2 = `.dap-job-content`/`.dap-job-label` mono 省略 + 原生 tooltip）；`renderJobCardInto` 工具名映射填充、内容不可得整行隐藏、卡片级 tooltip 移除；aria-label 并入工具名；CSS 两行布局、明暗两主题底色以子代理卡底色为基 `color-mix #65a0ff 8%` 轻染、紧凑档隐藏内容行、轨道层注释同步。PRD/DESIGN/DOMAIN 同次演进（R-01-003 陈述与 AC-04 扩展、R-01-023/AC-05～07 新增、DESIGN 条目字段/trackRuns/渲染器落点/追溯索引、DOMAIN 层级连接线与后台任务术语及跟随不变量）。`scripts/check.mjs` 新增 R-01-023/AC-05～07 与 R-01-003/AC-04 断言（trackRuns job 拓扑与混合序列、kind 归一、映射、空白 label、两行骨架、紧凑隐藏、明暗轻染契约）；`scripts/acceptance.mjs` 新增 AC-05～07 人工步骤；`e2e/specs/background-jobs.mjs` 随新呈现更新并修正既有 AC-02 断言缺陷（详见测试影响表）。`.dsh-plugin/client.js` 同次重建。
- 测试: `pnpm verify` 全量两轮通过（实现 6e4efe6 工作树与修复 9e6d394 工作树各一轮）——AgentMap lint（28 需求/173 AC 全锚定）、test impact（+AC-05/06/07、~AC-04、AC-02 update 记账）、`scripts/check.mjs` 全部断言、19/19 浏览器 E2E（415s / 411s）。单 spec background-jobs 黄金路径通过：任务子卡两行呈现、Bash 工具名映射、母会话到任务子卡连接线、「后台 ×1」数量注、输出区展开回放、完成提醒抑制、紧凑档内容行隐藏。浏览器观感项（底色区分协调性、连接线端点观感）已登记 `scripts/acceptance.mjs` 人工步骤，待东家验收；断言修正前的失败截图留存了新呈现的真实浏览器现场（蓝调卡面、两行结构、输出回放均正确）。
- DESIGN 对照: PRD R-01-003/AC-04 与 R-01-023/AC-05～07 逐条对应实现与测试锚点；DESIGN 条目字段（`liveJobs` 携带 kind、job 子条目 jobKind）、trackRuns 放宽、两行呈现与底色轻染、密度档位、「jobKind 不入签名」说明与实现无差异；DOMAIN 层级连接线/后台任务术语与跟随不变量同步；无残留差异。
- commit: 6e4efe6 实现与 map 演进；9e6d394 双轴审核修复（签名冗余、label 边界、浅色契约与 task 补记）
- review:
  - 审核方: code-review skill（Standards/Spec 双轴并行独立 reviewer 子代理，fixed point = 6e4efe6 vs a11b7c0；修复复审由两轴原审核方分别复核修复 hunks）
  - 目的理解: 把后台任务子卡升格为与子代理同等的直属子级——连接线同规则绘制、两行呈现工具名与任务内容原文、卡面底色可辨区分；约束——零 host 侧改动（数据已在快照 `SessionJob`）、不重排既有 job 子卡位置语义、不冒充回合运行、bundle 契约与全量回归证明行为；验证方式 = check.mjs 新锚点 + background-jobs E2E 更新 + 全量 verify。
  - 执行方式: code-review skill 双轴评审（Standards 轴对照 AGENTS 工程原则 + CONVENTIONS + Fowler 基线；Spec 轴对照 T-152 收敛方案 + PRD R-01-003/R-01-023 相关 AC + DESIGN 落点），两轴独立并行后各自复审修复 hunks。
  - 问题与修复: ①【Standards·判断】cardSignature jobKind 分量属投机泛化（kind 恒定、注释理由不成立）→ 删除分量，注释与 DESIGN 同步；②【Standards·苗头】job 文案映射 core/client 分裂 → JSDoc 注明分层理由 + TODO 聚拢评估；③【Standards·判断】DESIGN「活动卡片集合」bullet 超长平铺 → 豁免记 TODO（沿 T-149 先例、聚焦修改）；④【Standards·判断】E2E 3s 固定观察窗 → 豁免保留（「等待不发生」无正条件可轮询，沿 mobile-resume 先例，task 注明）；⑤【Spec·低】E2E AC-02 断言重写未记 task → 测试影响表补记（含对照实验：HEAD 同断言失败，属既有「已完成」子串误报缺陷、非本次回归）；⑥【Spec·低】AC-07 浅色主题无 bundle 断言 → 补浅色块轻染断言（含 `lightJobBg !== -1` 防御）；⑦【Spec·低】纯空白 label 渲染空行 → `liveJobsOf` 归一空串 + 断言 + DESIGN 同步。
  - 复审结论: 两轴复审均通过，确认处置到位、无新阻断问题。残余风险与测试缺口：jobKind 恒定假设依赖宿主快照携带 kind——极端时序下 kind 由缺失转出现时 job 子卡不因工具名单独重绘（概率低，任务视图整体签名随下次推送帧兜底刷新）；`lightSubBg` 反向断言无 `!== -1` 防护（与暗色侧同弱法，正向断言已钉主面）；底色与连接线端点观感待东家按 acceptance 步骤验收；E2E 暂未覆盖「job 与子代理并存」的双子级场景（拓扑由 check.mjs 纯函数断言钉住）。
