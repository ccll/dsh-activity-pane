---
doc-type: task
mutation: lifecycle
id: T-161
---

# T-161 移动端「活动」开关紧凑形与尺寸加固

状态: active
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家真机反馈（T-160 之后）：「不是太挤，是胶囊太大太长」。真机截图实测：胶囊宽 ~160pt、内容（图标位空、文案「活动」+计数徽标）仅占一半、右缘 ~93pt 空白，且当时处于兜底浮层位（左缘 ≈44px）压住宿主头部控件。

两个独立缺陷面：

- 胶囊含「活动」文字标签，固有宽度 ~80px，嵌入标题行后持续挤压会话标题（T-160 已知代价，东家不接受该形态）。
- 胶囊在东家真机（iOS Safari/WebKit）被拉伸至 ~160pt（内容仅占一半），Chromium 复现不出——引擎相关的按钮内在尺寸差异，现有 CSS 未钉死宽度。

经东家指示（2026-10-10「不是太挤，是胶囊太大太长了」）确认为需求变更：AC-04 文案条款由「文案为活动」修订为紧凑形态。

## 差距评估

- `PRD.md`：R-01-008/AC-04 含「文案为『活动』」，与紧凑形冲突，需同次修订。
- `src/client.mjs`：`.dap-toggle` 为文字标签+徽标结构、无显式宽度与 `appearance` 声明。
- `scripts/check.mjs`：bundle 契约断言绑定旧文案结构与无加固声明。
- `e2e/specs/mobile-drawer.mjs`：AC-04 断言「文案以『活动』开头」需改紧凑形断言。
- `scripts/acceptance.mjs`：AC-04 人工步骤需同步。
- `SOLUTION.md`、`RATIONALE.md`、`TODO.md` 随同同步。
- 落位守卫、嵌入/兜底机制、显隐语义均不变（T-160 已验证）。

## 收敛方案

- PRD R-01-008/AC-04：文案条款改为「呈紧凑形态（面板图标与计数徽标，不显示文字标签）」，位置与不遮挡条款不变。
- `src/client.mjs`：
  - 开关骨架改为图标 + 计数徽标（`dap-toggle-icon` + `dap-toggle-count`），不再渲染文字标签；aria-label「切换活动会话窗格」保留为可访问名称。
  - 图标为 14 盒「侧栏面板」字形（圆角矩形 + 左侧分隔竖线，stroke 风格与既有图标一致）。
  - `.dap-toggle` 增加 `appearance: none; white-space: nowrap;`，`.dap-toggle[data-embedded]` 增加 `width: max-content`，兜底形态同样 `width: max-content`——显式钉宽，任何引擎的按钮内在尺寸/拉伸路径都不再生效。
  - 内边距 `0 11px` → `0 9px`、`gap 6px` → `5px`，收紧尺寸。
- 测试与文档面按上文同步；TODO 中该需求候选迁出（已立项）。

## 测试计划

- `scripts/check.mjs`：bundle 契约断言更新——新骨架结构、`width: max-content` 与 `appearance: none` 加固声明存在；既有 left:44/data-embedded/留位断言保留。
- `e2e/specs/mobile-drawer.mjs`：AC-04 断言改为——按钮无文字标签（innerText 不含「活动」）、含面板图标 svg、计数徽标匹配 `数字/数字`；嵌入/相对顺序/不遮挡/兜底断言沿用。
- `scripts/acceptance.mjs`：AC-04 人工步骤改为紧凑形观感验收。
- `pnpm build:client && pnpm check`；`pnpm verify:fast`；全量 `pnpm verify`；真实环境（东家运行实例）Playwright 探针深/浅主题双验并截图。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关呈紧凑形（图标+徽标、无文字标签）、宽度钉死为内容宽、嵌入参与布局不遮挡；抽屉开合交互不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：宿主头部不可得回退兜底形态仍可见可点，宽度不因引擎差异被拉伸 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：桌面断点外媒体查询隐藏不变；浅色主题底色覆盖规则继续生效 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：落位守卫/卸载契约/抽屉交互不变；PRD 修订由同次测试证据承接 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::cleanup` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | AC 正文修订（文案条款→紧凑形态） | UNIT/E2E/MANUAL | update | `scripts/check.mjs` 新骨架与加固断言；`e2e/specs/mobile-drawer.mjs` 紧凑形断言；`scripts/acceptance.mjs` 人工步骤同步 |
| SOLUTION | 开关形态段由文字标签改紧凑形并补尺寸加固 | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 终态与证据

（待实现完成后填写）
