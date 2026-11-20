---
doc-type: task
mutation: lifecycle
id: T-199
---

# T-199 当前会话前台/后台态与视觉优先级——完成提醒降权、面板页激活修复

状态: completed
类型: 需求变更
风险等级: major
风险面: 对外行为（卡片激活跳转与卡面视觉层级）、契约（check.mjs 视觉契约串与 PRD 验收点）
关联需求: R-01-006/AC-03、AC-04、AC-05、AC-06（新增）；R-01-002/AC-04（补句）；R-01-008/AC-06（面板在屏时分流，会话视图行为不变）
决策依据: C-104
实证验收: 否

## 背景与目标

- 背景: T-197（C-103）让窗格跨页面常驻后，当前会话卡片在插件页等全局面板页仍保持高亮，但激活该卡片不触发会话切换（无反应）；同时完成提醒卡的绿底绿边与当前会话的细蓝描边同屏，东家反馈「一眼找不到当前会话」。两件事同源于「选中」与「正在查看」被当成同一件事。
- 目标: 当前会话的呈现按「选中 + 主区域是否显示会话视图」两维区分前台态与后台态；后台态保留可辨蓝色但明显弱于前台态、不强于等待提醒卡；当前会话前台态成为窗格最高视觉层（外环、外光晕与内发光）；等待三类卡保留色相语义但降权，不再以整卡铺色压过当前会话；面板页激活当前会话卡一次即关闭面板并显示该会话。
- 非目标: 不改宿主外壳与 `uiWorkspace.openSession` 语义；不改等待三类的色相与末行结构；不改移动端抽屉契约与紧凑档结构；不引入卡片底色变化（当前卡不加蓝色底）；不改普通卡与最近卡的既有弱化呈现。

## 差距评估

- PRD: R-01-006 只承诺「切换时高亮」，未覆盖面板页的后台态、激活回归与两类卡片同屏时的强度关系；R-01-002/AC-04 只承诺等待三类的柔和配色，未承诺不压过当前会话。
- SOLUTION: 视觉规格只描述单卡呈现，无跨卡强度阶梯；DOM 与渲染层无 `data-foreground` 概念，交互面只写「点击 → 切换会话」，未描述面板在屏时同会话激活的 reveal 语义。
- DOMAIN: 「当前会话」定义为「正在查看」，但实现以选中态判定；缺前台态/后台态词汇与跨卡优先级不变量。
- 代码: 卡片激活经 `attemptOpen` 的 `shouldCancelOpenRetry` 判「已到达」，`currentId === targetId` 即收链 return（`src/client.mjs` 的 `attemptOpen` 早退判据），`openSession` 根本不会被调用；高亮只由 `isCurrent`（`src/core.mjs#buildEntries` 的 `isCurrent`）驱动；渲染签名不含面板态，面板切换不触发重绘。
- 测试: `scripts/check.mjs` 以精确串钉住当前卡高亮与等待卡配色（`scripts/check.mjs` 的精确串契约段）；无 `data-foreground`、面板页激活、跨卡强度比较的断言。

## 收敛方案

- 无分叉点: CONVENTIONS 登记「方案研判: 关闭」；数值档位与「三类统一降权、不加蓝底」已由东家在 2026-11-20 对话中逐项拍板（C-104 记录被否方案）。
1. 判据: `src/navigation.mjs` 新增纯函数 `isSessionDisplayed({ targetId, currentId, panelId })`（选中且 `panelId === null`）；`shouldDismissDrawerOnActivation` 同以在屏为条件（面板在屏时激活转为真实导航意图）。
2. 面板态来源: 客户端读 `ctx.get("layout")?.panelInfo?.getSnapshot?.()?.activePanelId`（软依赖，缺失按前台），订阅 `panelInfo` 快照变化触发 `queueSync`，并把面板态并入渲染签名。
3. 激活三分支: 已在屏 → 桌面无操作、移动端收抽屉；选中但面板在屏 → `openSession` 一次且不排重试链（宿主 `replaceMain(..., 'reveal')` 同步 `selectPanel(null)`）；其余走既有 `attemptOpen`（重试链取消判据保持按选中，避免链条把用户从面板拽回会话页）。
   - 抽屉语义（R-01-008/AC-06）：会话视图下抽屉打开时激活当前卡仍只收抽屉；面板在屏时该激活按 R-01-006/AC-04 走 reveal 并收起抽屉，属新增分流，不改写原 AC 的会话视图行为。
4. 属性: 卡片 `data-current` 保持选中语义，新增 `data-foreground` = 选中且在屏；暗态规则 `[data-current]:not([data-foreground])`。
5. 视觉阶梯（R-01-006/AC-06，C-104）:
   - 前台态: 深色 `#8fbcff` 描边 90% + `0 0 0 1.5px` 60% + `0 0 16px` 45% + `inset 0 0 10px` 20%；浅色 `#2f7cf6` 描边 88% + 1.5px 55% + 16px 30% + inset 12%。
   - 后台态: 同色相描边 32%（浅色 30%）+ 1px 外环 14%（12%）+ 10px 光晕 10%（8%），描边低于等待三类卡。
   - 等待三类: 描边统一 34%、外环 22%，投影 `0 4px 12px rgba(0,0,0,.22)`；底色深色 done `rgba(31,36,33,.97)`、blocked `rgba(42,40,30,.97)`、error `rgba(37,31,32,.97)`，浅色三类各以 `color-mix(..., #fff)` 向白收；数量徽标底色与卡面保持完全一致（AC-06）。
6. 文档: PRD R-01-006 增 AC-03～AC-06、R-01-002/AC-04 补句；SOLUTION 产品契约与窗格渲染器同步；DOMAIN 增前台态/后台态术语与优先级不变量；C-104 记录决策。

## 测试计划

- `node scripts/check.mjs`: 新增 `isSessionDisplayed` 单测（在屏/面板在屏/非当前/空目标/数字与字符串 id）与 `shouldDismissDrawerOnActivation` 面板在屏用例；契约串更新（前台态三层、暗态规则、等待三类描边统一 34%、徽标与卡面同值、档位无关、`data-foreground` 写入、panelInfo 订阅）；跨卡强度断言（前台态外环 1.5px/光晕 16px 大于等待卡、后台态描边 32%/30% 低于等待卡 34%）。
- `node e2e/run.mjs visual-hierarchy`: 面板页用例——切 Plugins 后当前卡有 `data-current`、无 `data-foreground`，描边与外环 alpha 落在后台态区间；点击该卡后面板关闭（`conversationScroll === true`）且 `data-foreground` 落位、前台态光晕半径与外环宽度恢复；经原生侧栏槽位返回会话同样恢复；完成提醒卡与当前卡同屏时，前台态外环宽/光晕半径/描边 alpha 均大于完成卡；浅色前台/后台态与紧凑档光效同验。
- 移动端抽屉：面板在屏时的激活分流由 `scripts/check.mjs` 的 `shouldDismissDrawerOnActivation` 面板用例覆盖；移动壳层打开全局面板的观感路径由人工验收清单复核（移动壳层面板入口与抽屉叠加属真机路径）。
- `pnpm verify:fast` 与全量 `node e2e/run.mjs`；真实宿主双主题截图供东家观感验收。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-006/AC-03 | 新增 | E2E | add | `e2e/specs/visual-hierarchy.mjs` 面板页 `data-foreground` 缺失与后台态数值断言 |
| R-01-006/AC-04 | 新增 | E2E | add | 同上：面板页点击当前卡后面板关闭、前台态恢复 |
| R-01-006/AC-05 | 新增 | E2E | add | 原生侧栏返回会话后前台态恢复，不依赖该卡被激活 |
| R-01-006/AC-06 | 新增 | UNIT/E2E | add | `scripts/check.mjs` 契约串与强度比较；e2e computed style 比较 |
| R-01-002/AC-08 | 改写（强度一致） | UNIT/E2E | update | `scripts/check.mjs` 三类描边统一 34% 断言；e2e 后台态与完成卡描边比较 |
| R-01-002/AC-04 | 改写（补句） | UNIT/E2E | update | 等待三类配色契约串更新；e2e 完成卡底色色偏断言 |
| R-01-008/AC-06 | 改写（增在屏条件） | UNIT | update | `shouldDismissDrawerOnActivation` 面板在屏用例 |
| R-01-005 | 增强（面板页的同会话激活） | UNIT/E2E | update | `isSessionDisplayed` 单测与 `e2e/specs/visual-hierarchy.mjs` 点击路径 |
| SOLUTION | 产品契约、交互面、窗格渲染器段改写 | UNIT/E2E | update | 契约串与浏览器断言同步 |
| DOMAIN | 当前会话/前台态/后台态术语与不变量 | UNIT | update | `check.mjs` 断言 bundle 承载 `data-foreground` 与暗态规则 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：面板页后台态、点击回前台、等待三类降权、前台态最强 | `e2e/specs/visual-hierarchy.mjs::R-01-006/AC-06` |
| 异常 | 适用：`layout` 服务缺失按前台回退；`openSession` 不可用不发起；面板关闭失败不排重试链 | `scripts/check.mjs::isSessionDisplayed` |
| 边界配置 | 适用：完成提醒卡即当前会话的叠加、浅色主题取色、紧凑/中间档 | `scripts/check.mjs::data-foreground`、`e2e/specs/visual-hierarchy.mjs::R-01-002/AC-04` |
| 副作用 | 适用：`data-current` 语义不变、滚动锚定与轨道测量不因外环改变、徽标底色与卡面同值 | `scripts/check.mjs::renderCardIntoList(activeList, entry, cardsById, index, 1, colorByWorkspace, foreground)`、`e2e/specs/long-list.mjs::data-current` |
| 主题 | 适用：深浅主题前台/后台/等待卡取值分别校验 | `scripts/check.mjs::#2f7cf6` |
| 移动端 | 适用：抽屉打开 + 面板在屏的激活分流 | `scripts/check.mjs::panelId: "plugins"` |

## 自查清单

- 边界：完成提醒卡同时是当前会话时蓝环压过绿底；浅色主题用深蓝且光晕 alpha 低于深色；紧凑档与窄窗格下外环与内发光不改变卡片矩形与内容排布。
- 异常路径：`layout` 服务缺失时按前台处理（不出现永远暗态）；`openSession` 不存在时激活不产生半态；面板在屏时激活不排重试链，不会在面板关闭失败时反复发导航。
- 回归影响：`data-current` 仍表示选中（既有 e2e 选择器与滚动锚定不变）；重试链取消判据仍按选中判定；数量徽标底色与卡面严格一致；轨道线测量不因外环变化偏移。

## 终态与证据

- 实现: b4b704d 主实现（`data-current` 与新增 `data-foreground` 分离、`activePanelId()` 读 `layout.panelInfo` 并入渲染签名、`installPanelSubscription` 补订、激活三分支：已在屏无操作/面板在屏 reveal 不排重试链/其余 `attemptOpen`；视觉阶梯前台态 1.5px 外环 + 16px 光晕 + 内发光、后台态 32%/30%、等待三类统一 34% 且徽标同值）与 c40499b、41d0017 两笔评审修复；PRD R-01-006 增 AC-03～AC-06、R-01-002/AC-04 补句，SOLUTION/DOMAIN/README/人工验收清单与 C-104 同步。实现期间发现并移除卡片 `transition`：其 0-3-0 优先级覆盖 `.dap-move-ghost` 的过渡，导致迁移动画 ghost 永不回收（compact-density 完成卡计数不降），由 e2e 捕获后修正。
- 测试: `pnpm verify:fast` 通过；`node scripts/check.mjs` 全断言通过；受影响 10 spec 全绿（visual-hierarchy/desktop-layout/compact-density/auto-update/error-reminder/navigation/long-list/session-lifecycle/completion-sync/density-resource，其中 navigation 子集首轮一次摘要在 until 与二次读取间的宿主选择竞态，单发两次均绿，属既有 flake）；全量 `node e2e/run.mjs` 22/27（656692ms），5 项失败（background-jobs/card-content/loading-ready/mobile-drawer/mobile-shell）在改动前 bundle 基线（`git stash` src/navigation/bundle）以同一等待失败复现：宿主模型显示名为 DeepSeek-V4.1-Flash 而 spec 常量仍为 DeepSeek-V41-Flash、移动壳层 New session/send 未受理，非本次回归；pre-push 在该环境仍被这 5 项阻断，已登记为环境漂移与后续跟进。
- SOLUTION 对照: PRD R-01-006/AC-03～AC-06 与 R-01-002/AC-04 补句 ↔ SOLUTION 产品契约第 398～399 行与窗格渲染器第 462 行一致（面板态判定、`data-current`/`data-foreground` 分工、三分支激活、数值 90%/88%、32%/30%、34%）；DOMAIN「当前会话/前台态/后台态」与跨模块不变量同口径；C-104 记录决策与被否方案；AC-08 强度一致由统一 34% 兑现。
- commit: b4b704d、c40499b、41d0017、7812952（窗口复位前的收口提交）
- review:
  - 审核方: review-standards 与 review-spec 独立子代理（Spec/Standards 双轴，初轮与复审各一轮；与实现上下文分离）
  - 目的理解: 让窗格跨页常驻时当前会话在面板页仍可辨认且一次激活回到前台，并把「选中」与「正在查看」拆成两维：前台态为最高视觉层、后台态可辨但不强于等待卡、等待三类降权且强度一致；同时修复面板页点击无反应的到达判据缺陷（C-104）。
  - 问题与修复: 初轮 blocking 2——AC-08 要求三类等待卡强度一致而实现 34%/40% 分档，已统一为 34%；全量门禁未绿，已以改动前 bundle 基线复现证明 5 项失败为环境漂移并写入本证据。non-blocking 13 项已修复或登记：layout 订阅晚到不补订（改为 render 前补订）、移动端从面板返回未抑制软键盘（补 1200ms 窗）、e2e 浅色取色与侧栏锚定可绕过（改校验 #2f7cf6 与 `[data-slot="sidebar.workspaces"]`）、外环/光晕仅字符串包含（改为宽度/半径/alpha 数值比较）、底色断言以当前卡为基色恒真（改活动卡基色）、徽标同值仅按次数（改卡面/徽标两侧字面值）、重复 `jobsUnsubscribe` 退订、文档「在屏态」未登记术语与证据路径漂移、task 证据位置与 AC-08 测试影响行。复审两轴 blocking 清零。
  - 复审结论: 通过（Spec/Standards 两轴）；残余风险：`layout.panelInfo.subscribe` 首次抛错后不重试直到服务代际变化；全量 pre-push 仍被 5 项环境漂移失败阻断，需另开修复宿主/harness 对齐的跟进项。
