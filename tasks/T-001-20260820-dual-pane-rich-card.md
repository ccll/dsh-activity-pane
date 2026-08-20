---
doc-type: task
mutation: lifecycle
id: T-001
---

# T-001 双区 + 富卡 + 折叠 + 轮内状态订阅

状态: completed
关联: R-01-009 → 活动状态模型；R-01-010 → 活动状态模型；R-01-011 → 窗格渲染器；R-02-004 → 窗格渲染器
风险等级: standard

## 背景与目标

把窗格从单列表演进为东家确认的双区形态：上「活动会话」+ 下「最近历史」（24h 内非活动会话）；给运行中会话补富卡片（工具调用/流式/时长）；给桌面列加折叠为窄条的控制；并为轮内状态建立原生订阅 + 生命周期。核心纯函数（buildRecent / statusLine / 24h 过滤）已随 map 提交落地并有 Node 单测锚定；本 task 承接剩余的客户端实现。

## 差距评估

- 当前 `src/client.mjs` 只渲染单活动列表，无双区、无最近历史、无折叠、无轮内状态订阅。
- 当前空态仅为 CSS（`.dap-empty`），`render()` 未插入空态节点。
- 轮内状态订阅生命周期（对运行中会话 `binding().session.subscribe` 与 `unsubscribe`）尚未实现。
- 已授权差距：双区结构、富卡状态行、桌面折叠、轮内订阅（见 DESIGN 相应章节与需求追溯索引）。

## 收敛方案

- `窗格渲染器`：
  - `render()` 改为渲染上下两段列表：`buildEntries` 填活动区，`buildRecent` 填历史区；历史区为空时整段隐藏，活动区为空时插入 `.dap-empty` 空态节点（R-01-001/AC-02、R-01-010/AC-04）。
  - 新增对每个运行中会话的 `sessions.binding(id).session` 订阅：快照归一为 `{ runningTool, streaming, elapsedMs }`（取自 `runningCalls` / `partial` / `turnTimings`），经 `statusLine` 生成状态行写入运行卡；会话停止运行或插件卸载即 `unsubscribe`（R-01-009、R-02-004）。
  - 桌面列加收起控制：折叠为窄条 + 活动计数，单击展开；移动端行为不变（R-01-011）。
  - 运行/等待/子代理/最近 四种卡片骨架复用现有 `cardChildren` 模式，最近卡为简化视觉（灰点 + 标题）。
- 保持 `cardSignature` 去重与卡片按 id 复用不变，运行卡状态行并入签名字段，避免无谓重绘。

## 测试计划

- 核心（Node）：`scripts/check.mjs` 已含 `buildRecent` 过滤/排序/迁移、`statusLine` 各阶段、时长格式断言，全部锚定 R-01-009/R-01-010 AC。
- 契约（Node）：`scripts/check.mjs` 继续断言 bundle 无 `fetch(`（R-02-004/AC-02）；新增断言 bundle 含 `binding(`/`subscribe`（如有必要后续补强）。
- GUI（人工，`scripts/acceptance.mjs`）：双区呈现、活动→历史迁移、富卡实时刷新、折叠/展开、空态、订阅断开、外壳重挂载恢复。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：双区/富卡/折叠正常呈现与交互 | `scripts/check.mjs::buildRecent`、`scripts/check.mjs#R-01-010/AC-03`、`scripts/acceptance.mjs#R-01-011/AC-01` |
| 异常 | 适用：目标会话订阅不可用或中途被移除 | `scripts/acceptance.mjs#R-02-004/AC-01`、`src/core.mjs::statusLine` |
| 边界配置 | 适用：24h 窗口边界与超过窗口的过滤 | `src/core.mjs::HISTORY_WINDOW_MS`、`scripts/check.mjs#R-01-010/AC-01` |
| 副作用 | 适用：卸载/停止运行后订阅归零、无残留监听 | `scripts/acceptance.mjs#R-02-004/AC-01`、`scripts/check.mjs#R-02-003/AC-02`、`src/core.mjs::isActiveRow` |
| 性能 | 适用：大量运行会话时的订阅与重绘开销受签名去重控制 | `src/core.mjs::cardSignature`、`scripts/check.mjs#R-02-003/AC-01` |
| 并发 | 适用：多运行会话并发订阅时的状态合并 | `scripts/acceptance.mjs#R-02-004/AC-01`、`src/core.mjs::statusLine` |
| 恢复 | 适用：外壳重挂载后双区与订阅恢复 | `scripts/acceptance.mjs#R-02-002/AC-01`、`src/core.mjs::buildRecent` |

## 终态与证据

- 实现: 双区（上活动会话 / 下最近历史 24h，仅主会话）、运行富卡（工具/流式，时长渲染期按 startTime 实时算）、桌面折叠窄条、移动端抽屉、轮内原生订阅（随运行建立、停止/卸载断开）、真实参与布局（中间列行方向 + 会话根弹性填充 + 内容让位 + 聊天列居中）。实现链：ff6df00、f84e7e2、3e0b571、265acb3、c30e0f2、b56621f、299fa18、cd30e4e、2f93787。
- 测试: `node scripts/check.mjs` 全过（含 buildRecent 24h/倒序/迁移/子代理排除、statusLine 各阶段、签名去重、bundle 语法与契约断言）；GUI 交互验收见 `scripts/acceptance.mjs`（富卡实时刷新/空态/折叠/订阅断开/双区呈现/外壳重挂载）。`agentmap_lint` 全绿（15 需求 / 35 AC / 锚定 35 / design-covered 15）。
- DESIGN 对照: 按 AgentMap「实现后调和」，新增/确认的行为（真实参与布局、内容随折叠让位、仅主会话历史、时长实时计算、移动端守卫）已同步进 DESIGN「边界与对外契约 / 核心数据与不变量 / 子系统与模块」，DOMAIN 术语与 DECISIONS C-004 同步；DESIGN 与实现对照无差异。
- commit: 2f93787
- review:
  - 审核方: standards 子代理 fd9dbedd / spec 子代理 5fc3ed1d（同一审核方复审修复提交）
  - 目的理解: 审核 T-001 实现相对 PRD R-01-001/004/005/006/007/008/009/010/011、R-02-001/002/003/004 与 DESIGN/任务档的符合度，以及仓库标准（AGENTS.md 工程原则、DESIGN 横切约束、CONVENTIONS）遵循。
  - 执行方式: code-review skill 双轴（Standards+Spec）并行子代理，评审基线 e579de9..HEAD；修复提交 2f93787 由同一审核方复审。
  - 问题与修复: Standards — Duplicated Code（isActiveRow/buildEntries 显示判定二重）→ core 单点化 isActiveRow/isSubagentRow；无文档化硬性违规。Spec — ①运行时长未逐秒刷新 → 改存 startTime、渲染期 Date.now()-startTime 实时算；②applyLayout 无移动端守卫 → 加 desktopQuery 分支复位默认列布局；③已结束子代理计入最近历史 → buildRecent 排除 isSubagentRow；④宿主布局强改超出 PRD 字面 → 同步折进 DESIGN/DOMAIN/DECISIONS C-004。
  - 复审结论: 两轴复审确认 2f93787 修复后全部发现已解决、无新增问题或偏差；残留为判断性提示（轻微 Primitive Obsession 非本次引入；时长实时化待浏览器 E2E 或纯函数化，已记 TODO）。
