---
doc-type: task
mutation: lifecycle
id: T-084
---

# T-084 第二批 acceptance E2E 迁移（导航/调宽/回到顶部/卡面内容）

状态: active
关联: C-045 → E2E 验证基建（依赖 T-082、T-083）
风险等级: standard

## 背景与目标

T-083 迁移了 11 个人工-only AC。本 task 继续迁移「可机器判定且 mock 内容可支撑」的交互条目：R-01-005/AC-01 点击跳转、R-01-006/AC-01 当前会话高亮、R-01-015/AC-01..04 拖拽调宽、R-01-018/AC-01..05 回到顶部、R-01-012/AC-01、AC-05、AC-09 卡面模型上下文与角色标签、R-01-013/AC-01..05、AC-07、AC-08 最近卡五层结构、R-01-003/AC-03 工作区归属。观感（动画平滑、色彩协调）与需要子代理/思考内容的条目保留人工。

## 差距评估

- 上述 AC 现状均有 check.mjs 静态锚点或人工锚点；E2E 行为断言缺失，回归发现晚。
- mock LLM 输出确定（fast/slow/ask 三剧本），卡面文本类断言可判定；层级（子代理）、思考流、色彩观感不可用 mock 驱动，不在本批。
- R-01-018 需要窗格超高场景（复用 10 会话编排，套件 +25s）。

## 收敛方案

- 新增 `e2e/specs/navigation.mjs`（跳转 + 当前高亮）、`resize.mjs`（拖拽调宽四 AC）、`back-to-top.mjs`（回到顶部五 AC）、`card-content.mjs`（模型上下文、角色标签、最近卡结构、工作区归属）。
- 断言延续可观察呈现纪律：可见文字/文字顺序/包围盒/scrollTop/计算样式（仅高亮对比与不透明度等视觉结果）。
- `scripts/acceptance.mjs` 同步移除已覆盖步骤（观感残留保留），文件头映射更新。
- PRD/DESIGN 不变（验收点语义不变，只改变验证方式）。

### 实现期取舍补记

- R-01-009/AC-05（统计行完整字段顺序）移出本批：mock 不提供缓存命中率/实时速率数据（速率需 turn 结束后 telemetry），E2E 只能断言残缺字段，保留人工。
- 高亮断言（R-01-006/AC-01）采用当前卡与非当前卡的计算样式（描边/光晕）对比，不断言具体色值。
- resize.mjs 增补默认宽度 280px 断言承接 AC-04 的「清除站点数据回默认」半句（新 context 即无站点数据）。
- 停滞自愈加固：openApp 重载上限提升为两次；sendHeroMessage 增加「宿主启动直进会话视图」自愈（点 New session 回 hero）；宿主首推停滞经 A/B 实测与启动延迟无关（绑定服务端实例/系统冷态），两级自愈保留。
- 回到顶部按钮判定改用单次 page.evaluate（locator boundingBox/evaluate 在窗格每秒重渲染下观测到 30s 协议级停滞）。

## 测试计划

- 新 spec 逐条本地跑通 + 全量套件连续两轮全绿。
- `pnpm check`、`python3 tools/agentmap_lint.py --report`（test-anchored 不下降）、`git diff --check` 保持绿。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：目标 AC 全部获得 E2E 行为锚点；套件全绿 | `e2e/specs/navigation.mjs#R-01-005/AC-01`、`e2e/specs/back-to-top.mjs#R-01-018/AC-01`、`tools/agentmap_lint.py::test-anchored` |
| 异常 | 适用：宿主首推停滞等环境故障仍由既有两级自愈兜底，不掩盖真回归 | `e2e/run.mjs::RETRY`、`e2e/helpers.mjs::openApp` |
| 边界配置 | 适用：移动视口抽屉内回到顶部、折叠窄条不显示按钮、reduced-motion 直接定位 | `e2e/specs/back-to-top.mjs#R-01-018/AC-04`、`.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh::run.mjs` |
| 副作用 | 适用：套件总时长保持在 pre-push 可接受阈值（≤2 分钟）内；acceptance.mjs 保留条目可打印 | `e2e/run.mjs::bootE2e`、`scripts/acceptance.mjs#人工验收清单` |
| 迁移 | 适用：lint test-anchored 计数不下降；锚点从 acceptance.mjs 转移到 specs | `tools/agentmap_lint.py::test-anchored` |

## 终态与证据

- 实现: 4 条新 spec（navigation/resize/back-to-top/card-content）锚定 15 个 AC 的真实行为断言；helpers 增加停滞/直进会话两级自愈与共享辅助；run.mjs 按 ERR_PANE_STALL 换环境重试；acceptance.mjs 移除 3 步、修剪 4 步为观感残留。
- 测试: `node e2e/run.mjs` 连续 4 轮 9/9 全绿（含停滞自愈触发后恢复）；`pnpm check` 全绿；`agentmap_lint --report` test-anchored 128/128 不下降；`git diff --check` 干净。
- DESIGN 对照: DESIGN「E2E 验证基建」职责行已同步第二批范围；其余设计不变（验收点语义未变，仅验证方式迁移）。
- commit: 518bc68（实现）；关闭提交见 git log。
- review:
  - 审核方: 独立 reviewer 双轴（Standards 43d00171、Spec 5a34b7a4，code-review skill 子代理）
  - 目的理解: 已核实——T-084 第二批 acceptance E2E 迁移（跳转/高亮/调宽/回顶/卡面内容）+ 52096f6 宿主首推停滞自愈；关联约束 PRD 对应 AC 原文、CONVENTIONS 断言纪律、DESIGN「E2E 验证基建」。
  - 执行方式: `code-review` skill，基线 98d3fb3，范围含 52096f6 与 T-084 全部改动（含未提交工作区）。
  - 问题与修复: Standards 7 项判断性问题（错误文案签名→ERR_PANE_STALL code；150ms 定时断言→click 后立即断言；硬编码→MOCK_* 常量；弱断言→定值/几何强化；2 项记录取舍后放行）；Spec 8 项（AC-05 范围文本修正；五层结构改定值行索引断言；补右上角/右下角几何断言；补抽屉内点击回顶；补拖拽中途实时采样；acceptance 注释锚点修正）。
  - 复审结论: （待复审回填）
