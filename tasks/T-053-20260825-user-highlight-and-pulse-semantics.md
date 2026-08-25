---
doc-type: task
mutation: lifecycle
id: T-053
---

# T-053 用户指令行浅绿标识、「需要响应」徽标闪烁与执行中闪烁语义修正

状态: active
关联: R-01-002（AC-08）、R-01-016、R-01-017（AC-02、AC-03）、R-01-018 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家实际使用活动窗格时间线后提出一组呈现问题，逐项现场确认方案：

1. 用户消息虚线 outline 框（T-048 引入）过丑且抢眼 → 演进为图标+文字整行浅绿平底（多轮试看：图标圆底/圆环/圆角方环/渐变底/fit-content 色块均被否，见 C-018）；助手正文行最终不设底色。
2. 槽位用户行与时间线用户行呈现不一致（文字偏上、图标显大）——查证为槽位垂直 padding 不对称导致底色盒外延 + 图标间距 7px/5px 不一致。
3. 「需要响应」徽标需闪烁提示，且与标题状态点同频同相。
4. 闪烁语义两处缺陷：等待卡（冻结快照，pending 不可得）残留 running 行持续闪烁；正文流出后上一「正在思考」组仍与正文行同闪（拆入组的思考成员继承了 live 行 running，但推理必然已结束）。多子代理并发启动的真实在飞多行同闪语义保留。

PRD 演进仅限 R-01-002 新增 AC-08（徽标闪烁呈现承诺，经东家现场确认）；两处闪烁语义属既有 AC 隐含正确行为的缺陷修复（R-01-016 等待卡时间线、R-01-017/AC-03「存在执行中的思考」判定），map 其余不变；DESIGN 五处同步、DECISIONS 记 C-018。

## 差距评估

- PRD/DESIGN/DECISIONS：已同次演进（R-01-002/AC-08 新增；DESIGN 槽位标识/等待卡落定/折叠思考成员落定/徽标闪烁/最近卡图标措辞五处；C-018 选型记录）。
- `src/client.mjs`：虚线 outline 已替换为浅绿平底体系（本任务同次完成，东家逐项现场确认）；槽位几何修正；图标统一 14px 盒；`data-icon="robot"` 判别分流；徽标闪烁 + 相位同步。
- `src/core.mjs`：`settleWhenIdle`/`snapshotIdle` 落定内核；`foldedTimelineWithSlot` 增 `idle` 入参（渲染层判定，覆盖冻结快照场景）；边界拆分思考成员 running→done。
- `scripts/check.mjs`：核心语义锚点（pending 落定、idle 参数路径、思考组落定）与 bundle 断言（AC-08 闪烁、14px 图标盒）已补；`scripts/acceptance.mjs` 新增三条人工验收点。

## 收敛方案

- 标识：`rgba(88,201,143,.1)` 整行平底作用于 `.dap-slot` 与 `.dap-trace-item[data-icon="user"] .dap-trace-main`；槽位垂直间距走 margin；slot/trace 图标统一 14px 盒 + 1px padding；robot 行按 `kind==="assistant" && !fold && !detail` 单设 `data-icon="robot"`（字形 13px、无底色）。
- 徽标闪烁：`dap-badge-flash` 类复用标题状态点同款 `dap-pulse 1.2s`，开启瞬间重启状态点动画对齐相位；仅 pendingText 恰为「需要响应」时触发（R-01-002/AC-08）。
- 落定：`foldedTimelineWithSlot(..., idle)`——快照 pending 非空或渲染层判定（pendingText 存在且非后代活跃）时残留 running 全部落定为 done；`foldWorkGroups` 边界拆分思考成员 running→done。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（新锚点先红后绿）。
- `python3 tools/agentmap_lint.py --report` 追溯完整（含新增 AC-08 锚定）。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 人工核验（徽标闪烁同步、绿底标识、思考组落定三条）。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：用户行/槽位绿底标识一致；徽标闪烁同相同频；pending/idle 落定；思考组落定 | `scripts/check.mjs#R-01-002/AC-08`、`scripts/check.mjs#R-01-016`（pending/idle 落定）、`scripts/check.mjs#R-01-017/AC-02`（思考组落定）、`src/core.mjs::settleWhenIdle`、`src/client.mjs::renderCardInto`（徽标闪烁） |
| 异常 | 适用：空快照/空 history 不抛错；无指令槽位隐藏 | `scripts/check.mjs#R-01-018/AC-02`、`src/core.mjs::foldedTimelineWithSlot` 既有回归 |
| 边界配置 | 适用：冻结快照（无 pending 字段）idle 路径；委托周期（后代活跃）保留尾部提升；其他等待文案不闪 | `scripts/check.mjs#R-01-016`（idle 参数用例）、`scripts/check.mjs#R-01-009/AC-10`（委托提升回归）、`scripts/check.mjs#R-01-002/AC-08`、`src/core.mjs::settleWhenIdle` |
| 副作用 | 适用：真实在飞项（partial/runningCalls）闪烁不受影响，多子代理并发同闪保留；最近卡 12px 图标盒不受影响 | `scripts/check.mjs#R-01-017/AC-02`（live 正文行保持 running）、`scripts/check.mjs#R-01-013/AC-07`（最近卡图标盒断言）、`src/core.mjs::foldWorkGroups` |
| 兼容性 | 适用：深浅两主题（纯色/透明度双主题同值，浅色覆盖块删除后无分叉）；降低动效不关状态动画约定不变 | `scripts/check.mjs#R-01-002/AC-04`（bundle 结构断言）、`scripts/acceptance.mjs#R-01-002/AC-08`（人工验收）、`src/client.mjs::renderCardInto` |

## 终态与证据

（关闭时填写：实现、测试、DESIGN 对照、commit、review。）
