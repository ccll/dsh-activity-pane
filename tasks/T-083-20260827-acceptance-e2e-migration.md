---
doc-type: task
mutation: lifecycle
id: T-083
---

# T-083 acceptance 条目 E2E 迁移与 pre-push 门禁登记

状态: completed
关联: C-045 → E2E 验证基建（依赖 T-082）
风险等级: standard

## 背景与目标

T-082 打通 E2E 基建后，本 task 把 `scripts/acceptance.mjs` 人工清单中适合自动化的条目迁移为 Playwright spec，重点承接 11 个仅有人工锚点的验收点（R-01-001/AC-03、R-01-004/AC-01、AC-02、R-01-007/AC-01、AC-02、R-01-008/AC-01、R-01-010/AC-04、R-01-011/AC-05、R-01-017/AC-01、R-02-002/AC-01、AC-02），并把 E2E 登记进 pre-push 重门禁与 CONVENTIONS，使交互回归在推送前被自动拦截。

## 差距评估

- `scripts/acceptance.mjs` 87 个 AC 引用均为人工步骤；其中 11 个 AC 在 `scripts/check.mjs` 无任何锚点。
- 视觉色彩类 AC（R-01-003/AC-06～AC-12 OKLCH 徽标配色观感）机器判定不可靠，保留人工。
- 迁移条目需逐条评估可机器判定性：行为可判定（状态出现/跳转生效/抽屉收起）迁 E2E；观感判定（颜色协调、动画流畅）留人工。
- `tmp-harness/` 的 CDP 提取表达式可作为断言取材参考。

## 收敛方案

- 逐条迁移：每个可自动化 AC 对应一条 Playwright spec，断言窗格可观察行为；spec 注释锚定 `<R-ID>/AC-nn`。
- `scripts/acceptance.mjs`：删除已迁移条目，保留视觉/观感类人工步骤并在文件头更新分工说明。
- 门禁：新增 `.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh`（编号按成本排在 20-agentmap-lint 之后）；CONVENTIONS「验证门禁」登记该 hook，「AgentMap 本地参数」测试锚点路径增加 e2e specs。
- 迁移完成的 AC 在 PRD/DESIGN 不变（验收点语义不变，只改变验证方式）。
- 实现期取舍补记（独立审核确认）：`e2e/run.mjs` 改为每条 spec 独立 boot 隔离环境（会话状态互不可见，冷启动 2-4s 可接受）；R-01-004/AC-02 滚动隔离断言双向（窗格→主会话、主会话→窗格，超出 AC 单向语义，作为加强）；R-02-002/AC-02 的「槽座尚未出现时静默等待」以加载全程控制台/未捕获异常监听（goto 前挂接）覆盖常规路径，人为制造槽座延迟的场景残留人工条目；R-01-001/AC-03 四类状态变化全覆盖（出现/完成/等待出现/等待解除，等待类经 e2e:ask 剧本驱动）；R-01-017/AC-01 的「功能不降级」由全套件在无 dsh-auto-collapse 环境通过承接。

## 测试计划

- 每条迁移 spec 独立运行通过 + 全量 e2e 套件运行通过。
- `pnpm check`、`python3 tools/agentmap_lint.py --report`（test-anchored 数不下降）保持绿。
- pre-push hook 干跑验证：e2e 失败时推送被阻断。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：11 个人工-only AC 全部获得自动化锚点；套件全绿；锚点计数由 lint 机械验证 | `e2e/specs/auto-update.mjs#R-02-002/AC-01`、`e2e/specs/auto-update.mjs#R-02-002/AC-02`、`tools/agentmap_lint.py::test-anchored` |
| 异常 | 适用：e2e 失败时 pre-push 阻断推送且输出可读失败原因；门禁编号与 dispatcher 语义沿用既有序例 | `scripts/acceptance.mjs#人工验收清单`、`package.json::accept:manual` |
| 边界配置 | 适用：移动视口条目以 Playwright viewport 模拟覆盖（≤767px 断点），场景取材自人工清单 | `e2e/specs/mobile-drawer.mjs#R-01-008/AC-01`、`package.json::accept:manual` |
| 副作用 | 适用：pre-commit 耗时不变（e2e 不进快门禁）；acceptance.mjs 保留条目仍可打印执行 | `scripts/acceptance.mjs#人工验收清单`、`package.json::accept:manual` |
| 迁移 | 适用：lint test-anchored 计数不下降；已迁移 AC 的锚点从 acceptance.mjs 转移到 e2e specs | `e2e/specs/auto-update.mjs#R-01-001/AC-03`、`tools/agentmap_lint.py::test-anchored` |

## 终态与证据

- 实现: 新增 `e2e/specs/auto-update.mjs`（R-01-001/AC-03 四类状态变化——出现/完成/等待出现/等待解除，等待类经 e2e:ask 剧本 + 主会话区选项提交驱动；R-01-010/AC-04 空态；R-01-017/AC-01 无 dsh-auto-collapse 下折叠分组呈现；R-02-002/AC-01 会话切换/导航后窗格单实例恢复；R-02-002/AC-02 goto 前挂接控制台与 pageerror 监听全程零错误）、`e2e/specs/desktop-layout.mjs`（R-01-007/AC-01 左侧通高贴边、AC-02 主会话可操作、R-01-011/AC-05 折叠展开控件同位）、`e2e/specs/mobile-drawer.mjs`（R-01-008/AC-01 移动视口窗格屏外隐藏 + 浮动开关出现）、`e2e/specs/long-list.mjs`（R-01-004/AC-01 十卡超高滚动可达底卡、AC-02 双向滚动隔离）；`e2e/helpers.mjs` 共享驱动与断言谓词（until/paneRegions/paneBox/mainAreaHas/mainAreaBox/cardVisibleInPane/sendHeroMessage/newSessionWithMessage）；`e2e/run.mjs` 改为每条 spec 独立隔离环境；`.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh` 注册并登记 CONVENTIONS 验证门禁与测试锚点路径（`e2e/specs/*.mjs`）；`scripts/acceptance.mjs` 移除 10 个已迁移步骤、恢复 R-02-002/AC-02 槽座延迟人工残留、文件头记录分工映射。
- 测试: `node e2e/run.mjs` 连续两次全绿（5 spec，套件约 50-60s + 每 spec 冷启动 2-4s，远低于 2 分钟阈值）；失败路径退出码非零（此前 spec 失败时进程 exit 1 实测），pre-push dispatcher 在首个失败处停止（沿用既有 hook 序例）；`pnpm check` 绿；`agentmap_lint --report` test-anchored 128→128 不下降；`git diff --check` 绿；`node scripts/acceptance.mjs` 打印保留条目正常。
- DESIGN 对照: `DESIGN.md`「E2E 验证基建」职责行已注明 T-083 承接范围（R-01-005、R-01-008、R-02-002 等人工-only 验收点），本次迁移落地其中 R-01-008/AC-01、R-02-002/AC-01、AC-02 等 11 项；「门禁归属：pre-push.d 重门禁」由 30 号 hook 兑现；PRD 验收点语义不变（仅验证方式迁移），无需 PRD 变更。
- commit: c8faabe9c3f4546055f45d48be32f6e201189850
- review:
  - 审核方: Standards reviewer（subagent 初审 + 同一复审）；Spec reviewer（subagent 初审 + 同一复审）
  - 目的理解: 把人工验收清单中可机器判定的条目迁移为 Playwright spec 并注册 pre-push 门禁，使交互回归推送前自动拦截；承接 11 个人工-only AC 的真实行为断言（非仅注释锚点），观感/视觉/真实设备类保留人工；关联 C-045 与 R-01-001/R-01-004/R-01-007/R-01-008/R-01-010/R-01-011/R-01-017/R-02-002。
  - 执行方式: `code-review` skill 双轴并行审核，评审基线 `HEAD~1...HEAD`（初始 2748cb1，修复后 amend 为 c8faabe 并复审）。
  - 问题与修复: Standards 初审 0 硬违规 + 4 气味（叶子匹配重复 → helpers 上收 mainAreaHas/mainAreaBox/cardVisibleInPane；magic numbers → 命名常量；合成主区包围盒 → mainAreaBox；AC-04 锚点映射不一致 → 如实列两处）全部关闭；Spec 初审 4 项承接不足（R-02-002/AC-02 → goto 前挂接 + pageerror 零容忍 + 槽座延迟人工残留；R-01-001/AC-03 → e2e:ask 等待出现/解除断言补齐四类变化；R-01-007/AC-01 → 通高贴边断言；R-01-017/AC-01 → 全套件无 auto-collapse 环境通过作不降级证据）+ 2 项 scope 补记（每 spec 独立 boot、反向滚动隔离入收敛方案），复审全部关闭；复审后微调（选项行改 getByText 驱动、首挂载等待超时 20s）使套件连续两次全绿。
  - 复审结论: 两轴复审均通过，无未解决硬违规、spec 偏差或未记录 scope 变更。
