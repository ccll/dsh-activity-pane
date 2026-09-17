---
doc-type: task
mutation: lifecycle
id: T-145
---

# T-145 仓库入口悬停提示文案补行动召唤

状态: active
关联: R-01-022/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家指令：仓库入口按钮的 tips（悬停提示 `title`）由「报告问题」改为「报告问题，点赞收藏」——在报告问题用途之外补充行动召唤（呼应 R-01-022 陈述「给项目点 star」的动机句）。可访问名称（`aria-label`）保持「报告问题」：它表达元素用途且由 R-01-022/AC-01 的「（可访问名称）」承载，东家指令只针对悬停提示（tips）；两者分工为可访问名称简短表达用途、悬停提示承载行动召唤。R-01-022/AC-01 未钉悬停提示文案，PRD 不动；悬停提示文案属 DESIGN 承载的设计细节，本次为 map 不变的短路变更（呈现文案演进）。

## 差距评估

- `src/client.mjs`：骨架模板 `.dap-repo` 的 `title="报告问题"`（`aria-label="报告问题"` 不动）。
- `scripts/check.mjs`：3584 bundle 断言子串 `title="报告问题"` 与 3586 断言描述文案。
- `scripts/acceptance.mjs`：R-01-022 人工步骤「悬停提示为「报告问题」」。
- `e2e/specs/repo-entry.mjs`：3 行头注释、42 行段注释、49 行 title 断言。
- `DESIGN.md`：产品契约「仓库入口·呈现」条目悬停提示文案。

## 收敛方案

- 测试先行：先改 `e2e/specs/repo-entry.mjs` title 断言与 `scripts/check.mjs` 断言子串，运行确认旧实现（title 仍「报告问题」）转红。
- `src/client.mjs`：模板 `title="报告问题，点赞收藏"`（`aria-label` 保持「报告问题」）。
- `DESIGN.md`/`scripts/acceptance.mjs`/e2e 文件头注释同步。
- `pnpm build:client` 重建 `.dsh-plugin/client.js` 并随实现一并提交。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-022/AC-01）。
- `pnpm test:e2e`（`e2e/specs/repo-entry.mjs::R-01-022/AC-01` 浏览器实测新悬停提示）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 浏览器实测：悬停仓库入口核对提示文案。
- 短路变更不开 task 的依据：可访问名称与激活行为不变、仅悬停提示文案演进，属行为不变修正附回归测试更新（CONVENTIONS 允许）；本 task 作为 DESIGN 变更的测试影响载体。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-022/AC-01 | 保持：可访问名称（aria-label「报告问题」）与激活语义不变，仅悬停提示文案演进为「报告问题，点赞收藏」（东家指令） | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`——title 断言随新文案更新 |
| DESIGN | 改写：产品契约「仓库入口·呈现」条目悬停提示文案同步 | UNIT | update | `scripts/check.mjs::R-01-022/AC-01`——bundle 断言 title 子串随实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：悬停提示「报告问题，点赞收藏」、可访问名称仍为「报告问题」 | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`、`scripts/check.mjs::R-01-022/AC-01` |
| 异常 | 适用：激活行为与激活隔离不随文案变化（不折叠窗格、不改变档位与选中会话） | `e2e/specs/repo-entry.mjs::R-01-022/AC-02` |
| 边界配置 | 适用：深浅主题与移动抽屉形态下悬停提示一致 | `e2e/specs/repo-entry.mjs::R-01-022/AC-03`、`scripts/acceptance.mjs::R-01-022/AC-01` |
| 副作用 | 适用：仅 title 文案变化，可访问名称/链接目标/激活隔离不变 | `e2e/specs/repo-entry.mjs::R-01-022/AC-02`、`scripts/check.mjs::R-01-022/AC-01` |

## 终态与证据

- 实现: （进行中）
- 测试: （进行中）
- DESIGN 对照: （进行中）
- commit: （待实现提交）
- review: （待独立审核）
