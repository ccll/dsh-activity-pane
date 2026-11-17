# HANDOFF — 桌面窗格常驻（2026-11-17）

并行授权: 东家 2026-11-17 指示——另一会话正在修复插件 CI 错误；本会话在独立工作树中完成 T-197，不触碰对方范围。

- 本会话: T-197（需求变更，active → completed）。
  - 分支与提交基点: `t197-pane-visible`，worktree `.worktrees/t197-pane-visible`，基点 `ae18466`（main）。
  - 可写文件范围: `src/client.mjs`、`scripts/check.mjs`、`e2e/specs/desktop-layout.mjs`、`PRD.md`、`SOLUTION.md`、`DOMAIN.md`、`README.md`、`README.zh-CN.md`、`RATIONALE/C-103-pane-resident-user-controlled-visibility.md`、`tasks/T-197-pane-resident-user-controlled-visibility.md`、`.dsh-plugin/client.js`（构建产物）、本文件。
  - 追加型共享文件单写者: PRD、SOLUTION、DOMAIN、RATIONALE、tasks 由本会话单写；其他会话需要改动时先与本会话协调。
  - 不写: `.github/workflows/*`、`e2e/boot.mjs`、`e2e/helpers.mjs`、`CONVENTIONS.md` 及他会话的 task 文件。
- CI 修复会话: 任务、文件范围与提交由该会话自行登记；本会话不触碰其范围。合并顺序由东家决定；若 CI 修复先落 main，本分支合并前需 rebase 到最新 main。
- 收尾事项与关闭前自查: `check.mjs` 契约、`desktop-layout` 与移动端三 spec 回归、全量 `pnpm verify`、独立双轴评审；T-197 终态证据四行齐备后关闭。本文件随 T-197 提交。
