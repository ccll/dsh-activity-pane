---
doc-type: task
mutation: lifecycle
id: T-162
---

# T-162 移动端「活动」开关嵌入视图导航行

状态: active
关联: R-01-008/AC-04 / 窗格渲染器
风险等级: standard

## 背景与目标

东家明确指示（2026-10-10，附真机截图）：「我想要的是把胶囊嵌入到它下面的顶部导航栏里，参与布局，而不是让它继续浮空」。即开关应嵌入胶囊正下方的视图导航行（对话/轨迹/上下文 行）参与布局，而非标题行、也非浮层。

同轮反馈两项：

- 面板图标被误读为「多了个边栏按钮」——撤销图标，徽标单挂。
- 真机截图实测：胶囊仍处兜底浮层位（左缘 ≈40pt）、宽 ~147pt 而内容仅 ~65pt（iOS WebKit 对 fixed 态按钮的尺寸行为，Chromium 复现不出；`width:max-content` 在该态未生效）。导航行内嵌入态为文档流 flex 子项（`flex:none` + `width:max-content`），不受该态影响；真机最终观感留人工验收。

## 差距评估

- `PRD.md`：R-01-008/AC-04 位置条款仍为「会话头部左上角、左边栏切换按钮的右侧」（T-161 版），需修订为视图导航行嵌入 + 回退条款。
- `src/client.mjs`：`placeToggle` 锚点为标题行；骨架含图标 span 与 `createDrawerIcon`；需改导航行行尾落位（量测式抵消宿主行距、溢出预检回退）并撤销图标。
- `scripts/check.mjs`：骨架/落位断言绑定标题行与图标，需改写。
- `e2e/specs/mobile-drawer.mjs`：嵌入断言（父行=标题行、位于 crumb 之前）需改为导航行断言。
- `scripts/acceptance.mjs`：AC-04 人工步骤措辞。
- `SOLUTION.md`、`RATIONALE.md` 随同同步。
- 显隐语义（嵌入态留位/兜底 display:none）、抽屉交互、卸载契约不变。

## 收敛方案

- PRD R-01-008/AC-04：位置条款改为「嵌入会话头部的视图导航行参与布局，并位于该行末端」；新增回退子句「视图导航行不存在或容纳不下开关时，回退为浮层形态，显示在会话头部左上角」；不遮挡条款保留。
- `src/client.mjs`：
  - 骨架徽标单挂：`toggle.innerHTML = "<span class=\"dap-toggle-count\"></span>"`，撤销 `dap-toggle-icon` 与 `createDrawerIcon`。
  - `placeToggle` 落位目标改为视图导航行：锚点为 `header` 的最后一个元素子行（且非标题行、flex 行）；行尾 `appendChild`，并按量测的宿主 `columnGap` 写 `margin-left = 12px - gap` 抵消行距（不硬编码宿主几何）；插入前预检投影宽度（既有子项宽 + 行距 + 开关宽 + 自留距 ≤ 行宽），放不下不插入、直接回退，避免插入-回退抖动；已在行尾且未溢出时不动 DOM。
  - 回退分支不变（挂 body、摘 `data-embedded`、兜底 left 按侧栏按钮实测右缘）。
  - CSS：撤销图标 svg 规则；`[data-embedded]` 去掉 `margin-right`（行距由行内 margin-left 承担），保留 `position: static; flex: none; width: max-content`；嵌入态 `min-height` 收为 26px 与导航行行高协调。
- `scripts/check.mjs`、`e2e/specs/mobile-drawer.mjs`、`scripts/acceptance.mjs`、`SOLUTION.md`、`RATIONALE.md`（C-089）按上文同步。

## 测试计划

- `scripts/check.mjs`：骨架徽标单挂断言、导航行落位与行距抵消/溢出预检断言；保留 left:44、data-embedded、留位断言。
- `e2e/specs/mobile-drawer.mjs`：AC-04 断言——开关父行为头部视图导航行（header 最后元素子行）且 `data-embedded`、位于导航行内；标题行不再含开关；不遮挡/兜底/留位断言沿用。
- `scripts/acceptance.mjs`：AC-04 人工步骤改导航行观感验收。
- `pnpm build:client && pnpm check`；`pnpm verify:fast`；全量 `pnpm verify`；真实环境（东家运行实例）Playwright 探针实测导航行落位与截图。
- 独立 Standards/Spec review（code-review skill）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：开关嵌入视图导航行行尾参与布局、标题行不再含开关、不遮挡任何控件；抽屉开合交互不变 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`scripts/check.mjs#R-01-008/AC-04` |
| 异常 | 适用：导航行不可得（欢迎页/视图窗口期）或放不下（窄视口）回退兜底浮层，仍可见可点 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`src/client.mjs::placeToggle` |
| 边界配置 | 适用：桌面断点外媒体查询隐藏不变；宿主行距/标签宽度变化由量测式落位吸收，不硬编码 | `scripts/check.mjs#R-01-008/AC-04`、`src/client.mjs::CSS` |
| 副作用 | 适用：落位守卫幂等不自激（预检不插入即无 DOM 变更）、卸载契约不变、抽屉/遮罩交互不变 | `scripts/check.mjs#R-01-008/AC-05`、`src/client.mjs::cleanup` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-008/AC-04 | AC 正文修订（位置条款：标题行→视图导航行 + 回退子句） | UNIT/E2E/MANUAL | update | `scripts/check.mjs` 导航行落位断言；`e2e/specs/mobile-drawer.mjs` 导航行嵌入断言；`scripts/acceptance.mjs` 人工步骤同步 |
| SOLUTION | 移动端开关落点段由标题行改为视图导航行（C-089） | UNIT | update | 同次变化由本 task 记录：SOLUTION 与实现同步 |

## 终态与证据

（待实现完成后填写）
