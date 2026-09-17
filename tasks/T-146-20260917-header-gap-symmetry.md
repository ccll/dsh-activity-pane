---
doc-type: task
mutation: lifecycle
id: T-146
---

# T-146 标题行两接缝间距对称

状态: active
关联: R-01-022/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家实测反馈：仓库入口右侧与标题区之间 padding/margin 过小（实测 **0px**——`.dap-repo` 右缘紧贴 `.dap-titlebar` 盒左缘，hover 高亮块直接贴着 GitHub 图标），显得标题区没有居中；参考标题区右缘与档位切换按钮之间的空间（实测 **12px**，由 `.dap-tools` 的 `padding-left: 12px` 承担），让两侧接缝对称。本变更属 DESIGN 承载的间距语义演进（东家本次指令即确认），PRD 不动（AC-01 未钉间距数值）。

## 差距评估

- 现状几何（e2e 环境实测，1100px 桌面）：repoRight=314、titlebarLeft=314（接缝 0px）、titlebarRight=513、toolsLeft=513（接缝 0px）、densityLeft=525（tools padding-left 12px）。标题区左接缝 0px vs 右接缝 12px，不对称。
- `src/client.mjs`：`.dap-repo` 的 `margin: 0 0 0 12px` 缺右缘间距。
- `e2e/specs/repo-entry.mjs`：已有 `repoRight <= titlebarX` 与 `densityX > titlebarRight` 两条几何断言，缺「两接缝对称」断言。
- `DESIGN.md`：产品契约「仓库入口」条目未承载接缝间距语义。
- `scripts/acceptance.mjs`：R-01-022 人工步骤无对称观感点。

## 收敛方案

- 测试先行：`e2e/specs/repo-entry.mjs` 新增对称断言——仓库入口右缘到标题区左缘的间隔与标题区右缘到档位按钮左缘的间隔相等（±2px 容差抗亚像素抖动），运行确认旧实现（0px vs 12px）转红。
- `src/client.mjs`：`.dap-repo` margin 改 `0 12px`（左缘窗格间距不变，右缘补 12px 与工具区间距对称）；CSS 注释同步。
- `DESIGN.md`「仓库入口」条目补接缝对称语义；`scripts/acceptance.mjs` R-01-022 步骤补对称观感点。
- `pnpm build:client` 重建 `.dsh-plugin/client.js` 并随实现一并提交。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-022/AC-01）。
- `pnpm test:e2e`（`e2e/specs/repo-entry.mjs::R-01-022/AC-01` 浏览器实测两接缝对称断言）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 浏览器实测：桌面与移动抽屉态各验标题区两侧接缝观感对称、悬停高亮不再贴 GitHub 图标。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-022/AC-01 | 保持：位置语义（分处标题行两端）不变，补两接缝间距对称的实现细节（东家指令） | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`——新增两接缝对称断言 |
| DESIGN | 改写：产品契约「仓库入口」条目补「与标题区的接缝间距对齐工具区间距」语义 | UNIT | update | `scripts/check.mjs::R-01-022/AC-01`——bundle 断言子串核对随实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：仓库入口↔标题区间隔 = 标题区↔档位按钮间隔（±2px） | `e2e/specs/repo-entry.mjs::R-01-022/AC-01` |
| 异常 | 适用：激活隔离与档位语义不随间距变化 | `e2e/specs/repo-entry.mjs::R-01-022/AC-02` |
| 边界配置 | 适用：移动抽屉形态与浅色主题下对称间距同样生效 | `e2e/specs/repo-entry.mjs::R-01-022/AC-03`、`scripts/acceptance.mjs::R-01-022/AC-01` |
| 副作用 | 适用：仅 repo margin 变化，档位按钮/收起图标/折叠窄条几何不变 | `e2e/specs/compact-density.mjs::R-01-021/AC-01`、`e2e/specs/desktop-layout.mjs::R-01-011/AC-05` |

## 终态与证据

- 实现: （进行中）
- 测试: （进行中）
- DESIGN 对照: （进行中）
- commit: （待实现提交）
- review: （待独立审核）
