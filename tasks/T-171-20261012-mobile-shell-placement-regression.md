---
id: T-171
doc-type: task
mutation: lifecycle
状态: active
---

# T-171 修复 dsh 0.2.0 移动壳层开关落位代差与 e2e 壳层覆盖缺口

风险等级: standard

## 背景与目标

东家报告：dsh 0.2.0 升级后移动平台空白会话页不显示窗格入口按钮，并要求排查其它未发现问题。
实测证据（WebKit + iPhone 13 + dsh-web-mobile 3.0.6 staging 探针，0.2.0-rc.2 宿主）：

1. hero 空白页：0.2.0 宿主 hero 页 header 可寻址且首子为 headerLeading 窄条，
   placeToggle 稳定走嵌入路径；而移动壳层 layout.css 以
   `header[class*="headerBlank"] { display:none }` 隐藏 hero 空 header（该规则为
   0.1.5/alpha.2 时代「hero 空 header 无子元素、抽屉入口即 ⊡」设计而写），嵌入开关随
   header 连带不可见。这是空白页入口按钮消失的直接根因（0.1.5 时代 hero header 为空壳，
   `header.firstElementChild === null`，开关走 hero 贴靠分支贴靠 ⊡，无此问题）。
2. active 会话页：壳层把 header 左座（absolute left:8 top:6 28×28 z:2）留给自己的
   目录开关 `button[data-mobile-nav="toggle"]`；旧实现把开关 prepend 进 headerLeading
   流内，x=8，与壳层开关同位叠置；实测开关 [8,1,39,38]，壳层开关 [8,6,28,28]。
3. e2e 覆盖缺口：e2e 隔离环境只装本插件（无 dsh-web-mobile），「移动」= 桌面壳层窄
   视口，壳层代差类缺陷在 e2e 中结构性不可见（T-160~T-165 教训未机制化）。

## 差距评估

1. placeToggle 嵌入判据是「header.firstElementChild 可寻址」这一 DOM 存在性判据，
   不含可见性：0.2.0 起该判据与移动壳层的隐藏规则冲突（差距 1）。
2. 嵌入靶点固定 header 首子，无壳层左座占用检测（差距 2）。
3. e2e 无真实壳层档（差距 3）。

## 收敛方案

- placeToggle（src/client.mjs）：嵌入前提加「header 可呈现」判据
  （`headerRect.width > 0 && headerRect.height > 0`）；不可呈现时回落 hero 贴靠分支
  （几何与 0.1.5 时代同款，锚为壳层 ⊡）。
- 壳层左座检出（在屏 `button[data-mobile-nav="toggle"]`）时嵌入靶点改会话头槽
  `[data-slot="conversation.session.header"]` 首子 titleRow 行首（槽语义属性锚点，
  不耦合宿主哈希类）；titleRow 不可得时维持 header 首子旧行为。
- 宿主 frame 观察增 childList：锚（⊡/壳层开关）出现与开关自身挂载摘除都是 frame 直系
  子节点变动；静默页面上锚出现没有任何其它唤醒点，回归期实测落位会悬置 10s 以上
  （mobile-drawer hero 段间歇超时），观察即检使落位确定化。
- e2e/boot.mjs 增 `mobileShell` 档：按名经 registry 装 dsh-web-mobile（CLI 自动登记
  package.json 依赖与 dsh.profile.bundles），装不上以 `code=E2E_SKIP` 抛错。
- e2e/run.mjs 读 spec 具名导出 `mobileShell`/`contextOptions`；SKIP 显式记账
  （`e2e: SKIP` 行 + 汇总计数），不与 PASS/FAIL 混计。
- 新增 e2e/specs/mobile-shell.mjs（Chromium + iPhone 13 档）：断言 hero 贴靠几何与
  可见性、active 双开关无叠置与职责分离、抽屉状态属性不被窗格开关翻转。
- SOLUTION 落位机制段同步；PRD 不动（R-01-008/AC-04 措辞「嵌入标题行行首、位于
  左边栏切换按钮右侧」已容纳新语义，实现反而更贴 PRD）。

## 测试计划

- bundle 契约：scripts/check.mjs 同步落位断言（headerRect 判据、壳层开关查询、会话头槽
  锚点三条新增），`pnpm check` 全绿。
- 真壳层行为：e2e/specs/mobile-shell.mjs（本 task 新增，经 runner mobileShell 档装配）。
- 回归：全量 e2e 21 spec（含既有 mobile-drawer/desktop-layout 等桌面壳层档）。
- 真机触感与软键盘行为保留人工验收（CONVENTIONS 移动端验证纪律）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| SOLUTION | 方案层演进：落位机制段同步（嵌入前提=header 可呈现；壳层左座占用时嵌入靶点改会话头槽首子 titleRow；锚出现经 frame 直系子节点变动与抽屉属性翻转观察确定唤醒；R-01-008 落点同步） | UNIT/E2E | update | `scripts/check.mjs` 落位契约断言（headerRect 判据、壳层开关查询、会话头槽锚点、frame childList 观察）与 `e2e/specs/mobile-shell.mjs` 真壳层行为档 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：真壳层下 hero 贴靠与 active 嵌入均可见可点，即东家报告的两个缺陷消失 | `e2e/specs/mobile-shell.mjs::mobileShellSpec` |
| 异常 | 适用：壳层包不可安装时 spec 显式 SKIP，不得静默无覆盖 | `e2e/run.mjs::E2E_SKIP` |
| 边界配置 | 适用：无壳层部署维持 header 首子嵌入，桌面行为不变 | `e2e/specs/mobile-drawer.mjs::hero 页开关落位` |
| 副作用 | 适用：窗格开关点击不翻转宿主抽屉状态属性，壳层开关点击不误开窗格 | `e2e/specs/mobile-shell.mjs::collapsedBefore` |

## 终态与证据

（待实现完成后填写）
