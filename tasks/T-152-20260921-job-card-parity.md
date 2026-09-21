---
doc-type: task
mutation: lifecycle
id: T-152
---

# T-152 后台任务子卡与子代理一视同仁（连接线、两行呈现、底色区分）

状态: active
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
| R-01-023/AC-06 | 新增 | UNIT/browser/manual | add | `scripts/check.mjs` 内容不可得条目断言；隐藏行为由 bundle 契约与人工步骤承载 |
| R-01-023/AC-07 | 新增 | UNIT/browser/manual | add | `scripts/check.mjs` 底色区分 CSS 契约断言；`scripts/acceptance.mjs` 人工步骤 |
| DESIGN | 显示过滤 bullet、buildEntries 条目字段、层级结构与轨道层、job 卡呈现落点演进 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：job 子卡绘制连接线、两行呈现工具名与内容、底色区分 | `scripts/check.mjs#R-01-003/AC-04`、`scripts/check.mjs#R-01-023/AC-05`、`scripts/check.mjs#R-01-023/AC-07`、`src/core.mjs::jobKindLabel` |
| 异常 | 适用：kind/label 缺失或非法时兜底（工具名隐藏文本、内容行隐藏） | `scripts/check.mjs#R-01-023/AC-05`、`scripts/check.mjs#R-01-023/AC-06`、`src/core.mjs::liveJobsOf` |
| 边界配置 | 适用：job 与 subagent 混合层级、非直属/深度不符条目过滤、紧凑/中间档位切换 | `scripts/check.mjs#R-01-003/AC-04`、`src/core.mjs::trackRuns`、`scripts/acceptance.mjs#R-01-023/AC-07` |
| 副作用 | 适用：徽标计数口径不变（job 仍不计入）、输出展开与激活交互不变、签名连续、bundle 契约与全量回归 | `scripts/check.mjs#R-01-023/AC-04`、`package.json::verify` |

## 终态与证据

（进行中）
