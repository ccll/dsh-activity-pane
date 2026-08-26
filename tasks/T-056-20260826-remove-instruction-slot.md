---
doc-type: task
mutation: lifecycle
id: T-056
---

# T-056 删除指令槽位功能，时间线用户行标识改为行下虚线下划线

状态: completed
关联: R-01-018（删除）、R-01-012 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家实际使用后判定：

1. 活动卡时间线上方的常驻指令槽位（R-01-018）没有存在价值，要求彻底删除——含围绕它的槽位派生家族、最近指令记账、运行卡轻量 history 指令拉取与槽位行渲染。
2. 时间线内用户消息行的整行浅绿平底标识（C-018）不理想，要求去掉背景高亮，改为行下 1px 中性灰虚线下划线（深浅主题各自适配，不占用蓝/绿/红/橙状态色）。

map 演进已同次完成并经东家确认：PRD 删除 R-01-018（编号退役）；DESIGN 删除槽位全部设计落点、memo 键 lastUser 分量，用户行标识改写为虚线下划线；DOMAIN 退役「指令槽位」术语；DECISIONS 追加 C-019（说明与 C-018 被否虚线 outline 整行框的差异——本次为行下单边虚线，属不同呈现手段）。

## 差距评估

- PRD/DESIGN/DOMAIN/DECISIONS：已同次演进，无差距。
- `src/core.mjs`：槽位派生家族待删——`windowHasUser`/`slotOf`/`fallbackSlot`/`rememberLastUser`/`lastUserFromEvents`/`foldWorkGroupsWithSlot`/`foldedTimelineWithSlot`；折叠时间线收敛为 `foldedConversationTimeline(snapshot, limit, cwd, descendantActive, idle)` 唯一入口（吸收扩窗循环与 settle/尾部提升语义）。
- `src/client.mjs`：`.dap-slot` 全部 CSS、`renderSlot` 与其调用、`entry.slot` 管线、运行卡轻量 history 拉取块（`lastUserLoad`）、memo 键 `memoTimelineUser`/`memoSlot`/`timelineSlot` 待删；用户行浅绿平底规则替换为行下虚线下划线（含浅色主题覆盖）。
- `scripts/check.mjs`：R-01-018 全部锚定测试与 bundle 断言待删；非槽位用例（idle/委托/落定）从 `foldedTimelineWithSlot` 迁移到 `foldedConversationTimeline` 新签名；补「槽位派生不进入 bundle」反向断言。
- `scripts/acceptance.mjs`：绿底人工验收点改写为虚线下划线验收点。

## 收敛方案

- core：删除槽位家族；`foldedConversationTimeline` 直接承载指数扩窗 + live 合并 + 分组 + settle/尾部提升，返回纯行数组；`conversationWorkItems` 注释同步更名。
- client 数据链：history 冷路径 `detail.timeline = foldWorkGroups(conversationTimelineFromHistory(events, MAX, cwd), 4)`；运行卡 memo 块简化为快照引用/cwd/后代活跃/idle 四键，调用 `foldedConversationTimeline`；删除轻量 history 拉取块与全部 slot 字段。
- client 呈现：删除 `.dap-slot` CSS 与 `renderSlot`；`.dap-trace-item[data-icon="user"] .dap-trace-main` 的 `rgba(88,201,143,.1)` 平底替换为行下 1px 中性灰虚线下划线——以 bottom 背景渐变绘制而非 border-bottom，不占盒高、保持 14px 行高几何，浅色主题覆盖块同步改色。
- 测试：R-01-018 测试块整体删除；idle/委托/落定用例迁移签名；bundle 断言改为「`foldedConversationTimeline` 进入 bundle 且 `renderSlot`/`dap-slot`/`rememberLastUser` 不进入 bundle」；acceptance 验收点改写。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（删除断言先红后绿）。
- `python3 tools/agentmap_lint.py --report` 追溯完整（R-01-018 从 PRD 与索引同步消失）。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 人工核验（虚线下划线标识、无槽位行）。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：折叠时间线无槽位仍正确产出最近 4 行；用户行以行下中性灰虚线下划线标识 | `scripts/check.mjs#R-01-017`（折叠分组回归）、`scripts/check.mjs#R-01-012/AC-05`（下划线存在与无绿底残留 bundle 断言）、`src/core.mjs::foldedConversationTimeline`、`src/client.mjs::renderTimelineArea` |
| 异常 | 适用：空快照/空 history 不抛错、时间线为空时卡片正常 | `scripts/check.mjs#R-01-017` 既有空态用例、`src/core.mjs::foldedConversationTimeline` |
| 边界配置 | 适用：冻结快照 idle 落定、委托周期尾部提升在新签名下语义不变 | `scripts/check.mjs#R-01-016`（idle 用例）、`scripts/check.mjs#R-01-009/AC-10`（委托提升回归）、`src/client.mjs::foldedConversationTimeline`（memo 调用新签名） |
| 副作用 | 适用：运行卡不再发起轻量 history RPC；槽位派生家族不进入 bundle；签名去重不受影响 | `scripts/check.mjs#C-019`（renderSlot/dap-slot/派生家族无残留反向断言）、`src/client.mjs::pagedHistoryEvents`（仅余冷卡深翻读取路径） |
| 兼容性 | 适用：深浅两主题下划线各自适配；`prefers-reduced-motion` 约定不受影响 | `scripts/acceptance.mjs#R-01-012/AC-05`（深浅主题人工验收）、`src/client.mjs::background-position`（浅色主题覆盖块与渐变绘制） |

## 终态与证据

- 实现: `src/core.mjs`（槽位派生家族 slotOf/windowHasUser/fallbackSlot/rememberLastUser/lastUserFromEvents/foldWorkGroupsWithSlot/foldedTimelineWithSlot 整体删除；`foldedConversationTimeline(snapshot, limit, cwd, descendantActive, idle)` 收敛为唯一入口，承载指数扩窗 + live 合并 + 分组 + settle/尾部提升）；`src/client.mjs`（`.dap-slot` CSS 与 `renderSlot`、entry.slot 管线、运行卡轻量 history 指令拉取、memo 键 lastUser/memoSlot/timelineSlot 全删；用户消息行改为 bottom 1px repeating-linear-gradient 中性灰虚线下划线，浅主题 `--dsw-alias-label-tertiary` 覆盖）；`scripts/check.mjs`（R-01-018 锚定块删除、7 处用例迁移新签名、槽位无残留与下划线断言）；`scripts/acceptance.mjs`（验收点改写）；`PRD.md`/`DESIGN.md`/`DOMAIN.md`/`DECISIONS.md`/`TODO.md` 同次级联。评审修复：DESIGN memo 键四键对齐、TODO 两条失效缺陷线索删除、check.mjs 文案去「槽位」、下划线由 border-bottom 改为背景渐变（保 14px 行高几何）。
- 测试: `pnpm build:client && pnpm check` 全绿（含槽位派生/渲染无残留反向断言、下划线渐变正向 + 绿底与 border-bottom 双重反向守卫、idle/委托/落定用例新签名回归）；`python3 tools/agentmap_lint.py --report` 通过（requirements=21、AC=103 全锚定，R-01-018 无残留）；GUI 人工验收点见 `scripts/acceptance.mjs`（R-01-012/AC-05 虚线下划线、无槽位行，深浅主题各验，由东家按单核验）。
- DESIGN 对照: 需求追溯索引已无 R-01-018 行；折叠时间线唯一来源 `foldedConversationTimeline`、memo 键四键、用户行虚线下划线标识（背景渐变不占盒高）与实现逐项一致；DOMAIN「指令槽位」术语已退役；C-019 已记录。
- commit: eff9eb99db723fe15cc3f5e84fd036caec565a08
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 轴、Spec 轴）
  - 目的理解: 彻底删除活动卡时间线上方的常驻指令槽位（R-01-018）及围绕它的派生/记账/轻量 history 拉取/渲染；时间线用户消息行由浅绿平底（C-018）改为行下中性灰虚线下划线；关联 R-01-018（删除）、R-01-012 与 C-019；验证方式为 check.mjs 锚点 + agentmap lint + acceptance.mjs 人工验收。
  - 执行方式: `code-review` skill，评审基线 HEAD（23700c098c8e812f064f4c341b2a6dda4ed22acf，工作区未提交 diff + T-056 新文件），范围为 PRD/DESIGN/DOMAIN/DECISIONS/TODO/src/scripts 全量变更；Standards 对照 AGENTS/CONVENTIONS 与 Fowler 味道基线，Spec 对照 T-056 方案与 map 演进。
  - 问题与修复: Standards 轴——无硬性违规；判断题 DESIGN memo 键描述与实现四键不符（已对齐）。Spec 轴——TODO.md 两条指向已删除功能的缺陷线索（已删）；check.mjs「槽位替换」术语残留（改「原位替换」）；P1 border-bottom 会把用户行撑成 15px 破坏 14px 行高几何（改 bottom 1px repeating-linear-gradient 背景渐变，不占盒高，文档与断言同步）。
  - 复审结论: Standards 轴复审通过（无遗留 finding）；Spec 轴复审通过（三条 finding 均正确修复，未引入新问题）。
