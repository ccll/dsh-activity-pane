---
doc-type: task
mutation: lifecycle
id: T-197
---

# T-197 页面切换期间桌面窗格常驻——移除自动收起判据

状态: completed
类型: 需求变更
风险等级: major
风险面: 对外行为（桌面窗格显隐与展开/收起、全局面板宽度）、兼容性（dsh 0.2.0 无标记与 0.2.2 `data-global-panel` 标记两种宿主）
关联需求: R-01-007/AC-01（改写）、AC-02（改写）、AC-03（改写）、AC-04（改写）、AC-05（新增）
决策依据: C-103（supersedes C-101）；东家 2026-11-17 拍板：窗格常驻，自动收起判据全部移除

## 背景与目标

- 背景: 东家从会话页切到插件页、插件市场等全局面板后，活动会话窗格消失，选回会话才重现；隔离探针确认窗格节点未被宿主卸载，而是插件按 C-101 方案 A 主动 `display:none`。东家要求窗格固定依附左边栏、切页时保持当前展开/收起形态，不再由代码自动收起。
- 目标: 桌面窗格常驻于侧栏右侧；中列始终为「窗格 + 当前 main entry」行布局，当前 entry 根弹性填充余宽；删除全局面板标记判据、会话滚动区缺失回退与自动隐藏路径；页面切换不改变用户折叠形态、宽度与窗格节点身份。
- 非目标: 不改移动端抽屉契约（R-01-008）；不改宿主外壳；不改窗格折叠/拖拽交互本身；不为窄视口另加自动收起阈值（C-103 已否决）；不承诺插件实例重挂载后恢复折叠形态（AC-05 只覆盖页面切换），也不新增折叠形态持久化。

## 差距评估

- PRD: R-01-007 原陈述与 AC-03/AC-04 要求全局面板占屏时收起窗格，与东家目标相反；AC-05 尚未存在。
- SOLUTION: 宿主依赖、窗口形态与窗格渲染器三处均描述「全局面板回退列布局、窗格收起」。
- DOMAIN: 不变量把「全局面板态窗格显隐」列为布局适配例外，未约束显隐只能由用户操作决定。
- 代码: `applyLayout()` 全局面板分支调用 `setPaneHidden(pane, toggle, true)`；`GLOBAL_PANEL_ATTR` 常量与 `centerObserver` 属性观察构成自动判据；面板页无会话滚动区时主内容根取不到。
- 测试: `desktop-layout` 断言 `paneDisplay === "none"` 与 column 布局；`check.mjs` 钉住 `setPaneHidden(pane, toggle, true)` 自动隐藏片段。

## 收敛方案

- 东家已拍板（2026-11-17）：方案 A 实现（窗格留在中列）+ 移除全部自动收起判据；决策与备选见 C-103。
1. 布局: `applyLayout()` 桌面分支始终显示窗格、中列保持 row；主内容根优先取当前 main entry 根（跳过 `display:contents` 包装层，回退到滚动区锚定的会话根），设 `flex:1 1 0%` 与 `min-width:0`。
2. 显隐: 删除 `GLOBAL_PANEL_ATTR`、全局面板分支与 `centerObserver` 属性观察；`setPaneHidden` 收敛为 `ensurePaneVisible`（只清理残留内联 `display:none`，不提供隐藏路径）。
3. 形态: `data-collapsed` 只由用户标题行/窄条操作改写；页面切换不重建窗格节点、不修改宽度与折叠属性。
4. map: PRD R-01-007 陈述与 AC-01～AC-05 改写；SOLUTION 宿主依赖/窗口形态/渲染器同步；DOMAIN 不变量收敛；C-103 取代 C-101；README 中英文宿主差异措辞同步。
5. 测试: `check.mjs` 断言常驻实现进入 bundle 且自动隐藏符号消失；`desktop-layout` 覆盖折叠态切页、展开态切页、containment 回归、0.2.2 标记不误隐藏、节点身份与 hero 反例。

## 测试计划

- `node scripts/check.mjs`: bundle 契约（`ensurePaneVisible`/`mainContentFlexItem`/`entryFlexItem` 存在，`GLOBAL_PANEL_ATTR` 与 `setPaneHidden(pane, toggle, true)` 不存在）。
- `node e2e/run.mjs desktop-layout`: 折叠态/展开态切全局面板常驻、面板余宽、containment 回归、标记不隐藏、节点不重建、hero 反例；折叠态面板以 entry tag 与无会话滚动区判别，返回会话以会话滚动区判别，hero 以 `data-phase` 判别，标记用例断言属性确实落位并跨过 500ms 同步窗再断言形态不变。
- `node e2e/run.mjs mobile-drawer mobile-thermal mobile-shell`: 移动端抽屉与壳层回归。
- `pnpm verify`: 全量门禁。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-007/AC-01 | 改写：未折叠时贴边列、贴侧栏右缘 | E2E | update | `e2e/specs/desktop-layout.mjs` 的 pane/composer 断言与 `paneX = sidebarRight` 断言 |
| R-01-007/AC-02 | 改写：不阻止会话与全局面板操作 | E2E | update | composer 输入 + 面板左缘命中不被窗格遮挡 |
| R-01-007/AC-03 | 改写：页面切换保持窗格可见、不自动隐藏 | E2E | update | 折叠态与展开态切 Plugins，且以面板 entry 判别 |
| R-01-007/AC-04 | 改写：全局面板占窗格右侧剩余主区域 | E2E | update | `rootWidth = centerWidth - paneWidth` 与 containment 回归 |
| R-01-007/AC-05 | 新增：页面切换期间保持贴边列/窄条形态与宽度 | E2E | add | 折叠/展开往返、切页前后同宽度、标记属性落位跨同步窗不改变 |
| SOLUTION | 宿主依赖/窗口形态/渲染器段改写 | UNIT/E2E | update | `check.mjs` 契约断言 + `desktop-layout` 行为断言 |
| DOMAIN | 布局适配不变量收敛为页面切换期间形态不变 | UNIT | update | `check.mjs` 断言 bundle 常驻契约 |
| R-01-008 | 移动端抽屉契约不变 | E2E | none | `mobile-drawer`/`mobile-thermal`/`mobile-shell` 回归通过即证明无可观察变化 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：折叠态与展开态切全局面板后窗格常驻、面板占余宽 | `e2e/specs/desktop-layout.mjs::desktopLayout` |
| 异常 | 适用：0.2.0 无标记与 0.2.2 标记均不触发隐藏；标记属性确实落位并跨过同步窗；containment 面板根不塌 | `e2e/specs/desktop-layout.mjs::desktopLayout` |
| 边界配置 | 适用：hero 页、折叠窄条（宽度下限）、展开用户宽度、切页过渡帧与节点身份 | `e2e/specs/desktop-layout.mjs::desktopLayout` |
| 副作用 | 适用：移动端抽屉与壳层不回归、窗格节点不重建、卸载复位 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`e2e/specs/mobile-thermal.mjs::mobileThermal`、`e2e/specs/mobile-shell.mjs::mobileShellSpec` |

## 自查清单

- 边界：折叠窄条与展开态切页均保持用户形态；折叠条宽度落在 24–60px 且非零；展开态宽度取拖拽后的非默认值；hero 页窗格不被误收起。
- 异常路径：宿主带 `data-global-panel` 标记时属性确实落位、跨过 500ms 同步窗后仍不隐藏窗格；面板根声明 `container-type: inline-size` 时仍从窗格右侧取得弹性余宽，不塌成窄条；折叠态面板、返回会话与 hero 均由独立页面判据确认后再断言。
- 回归影响：移动端抽屉与壳层行为不变；窗格节点在切页前后为同一节点；卸载时主内容根弹性填充与中间列方向被复位。
- 残余风险：dsh 0.2.2 真实全局面板 DOM 未在本机复测（仅以合成标记模拟），需在 0.2.2 隔离环境补一次几何回执；插件实例重挂载不恢复折叠形态（AC-05 只承诺页面切换，超出范围）；切页过渡帧在 250ms 同步节流内可能短暂以非弹性宽度渲染，e2e 等收敛后断言、未做逐帧约束；e2e 宿主固定 0.2.0。

## 终态与证据

- 实现: 桌面分支改为常驻——删除 `GLOBAL_PANEL_ATTR`、全局面板分支与 `centerObserver` 属性观察；`applyLayout` 始终显示窗格并保持 row，主内容根取当前 main entry 根（跳过 `display:contents`，读取异常回退滚动区会话根）并设 `flex:1 1 0%` + `min-width:0`；`setPaneHidden` 收敛为 `ensurePaneVisible`（src/client.mjs:1767、1781、1811、1838）；契约与 e2e 同步（scripts/check.mjs:4631、e2e/specs/desktop-layout.mjs:152）；PRD R-01-007 陈述与 AC-01～AC-05 改写、SOLUTION/DOMAIN/README/C-103/acceptance 同步。
- 测试: `node scripts/check.mjs` 通过（新契约对旧实现可判红：把 src/client.mjs 换回 HEAD 版本后新断言失败）；`node e2e/run.mjs desktop-layout` 多次 PASS（5.0–7.7s），覆盖折叠态/展开态切页、面板余宽、containment 回归、标记属性落位跨 500ms 不改变、切页前后同宽度与节点身份、hero；`node e2e/run.mjs mobile-drawer mobile-thermal mobile-shell` 3/3 PASS；最终版全量 `node e2e/run.mjs` 26/26 通过（410998ms）；`agentmap_lint --report` 与 `test_impact_lint --report` 通过。
- SOLUTION 对照: 宿主依赖/窗口形态/渲染器与实现一致（常驻行布局、当前 entry 根弹性填充、不再按标记自动收起）；需求追溯 R-01-007 一行；核对日期 2026-11-17；DOMAIN 不变量与 PRD AC 一一对应；C-103 取代 C-101 且 PRD 出处已改。
- commit: 3727a3c（实现）
- review:
  - 审核方: code-review skill 双轴独立子代理（三轮复审）
  - 目的理解: 删除 C-101 的全局面板自动收起判据，桌面窗格在会话视图与全局面板之间的页面切换期间常驻侧栏右侧；中列始终按「窗格 + 当前 entry」行布局并让当前 entry 根弹性填充；切页不改用户形态/宽度、不重建节点；移动端抽屉不变。
  - 问题与修复: 首轮 2 条 blocking——B1 AC-05 含无证据的「宿主重渲染」子句、B2 切页/返回/标记/hero 等待条件不区分页面。B1 收窄 AC-05 并同步 PRD 陈述/DOMAIN/SOLUTION/C-103 到页面切换口径，实例重挂载不恢复折叠记为非目标；B2 加 entryTag/conversationScroll/heroPhase/globalPanelMarker 判别、标记落位断言与 500ms 沉降。复审指出承诺层仍有广义「只由用户决定」表述，遂把五处承诺句统一收窄；N1–N6 与 J2/J3/J6 一并处置（折叠宽度下限、侧栏语义锚与命中遮挡、删死回退、README 0.2.2 口径、acceptance 映射、catch 回退加一次性 warn、C-103 裁机制），返回路径补窄条高度与节点身份断言。
  - 复审结论: 第三轮 blocking 清零（0 条）；N6 catch 回退真实生效，e2e 页面判别与精度断言成立；非 blocking 仅剩 AC-02 面板内容单点代理与 0.2.2 几何回执等记录项。

