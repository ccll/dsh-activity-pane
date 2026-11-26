# 宿主兼容：0.2.0 与 0.2.2

同一份 bundle 在两代宿主上工作。差异只出现在客户端探测点与 e2e 夹具，宿主侧代码不按版本分支。宿主版本矩阵与已验证范围见 `docs/compatibility.md`。

## 版本面

- 主要测试基线：`@deepseek-ai/dsh@0.2.0-rc.2`。
- 兼容验证宿主：`0.2.2-rc.1`。
- 移动壳层 `dsh-web-mobile`：0.2.2+ 装 `3.3.6`，0.2.0/0.2.1 装 `3.2.0`。
- 夹具版本选择在 `e2e/boot.mjs`：解析 `dsh --version` 得代际后再装壳层。
- 0.2.0 与 0.2.2 的模型显示名不同（`DeepSeek-V41-Flash` 对 `DeepSeek-V4.1-Flash`），e2e 只断言共享前缀 `DeepSeek-V4` 与 reasoning level。

## 会话面差异

| 关注点 | 现状实现 |
|---|---|
| 当前会话 | 行上 `retainedBy.mainView > 0` 推导，`src/core.mjs` 的 `currentIdOf`；列表快照不再携带 `current` |
| 会话状态 | `uiSession.sessionStatus` 统一状态面；客户端把 `pendingInteraction` 回填到行副本 |
| 会话引用 | `sessions.retain(target, { source })` 持有代际，`reference.ready` 后接 `binding`；`binding()` 只借用已保留代际 |
| 子代理寻址 | `sessions.subagentAddress(childId)` 解析持久父地址；事件流只接受该地址 |
| 子代理目录 | 母会话行 `projectionsBySession[parentId].values.subagentCatalog`；未加载时 `refreshProjections` 后再试 |
| 日志读取 | `remote.session.page`；会话快照不携带会话内容 |
| 任务 roster | `jobs.watchRows(id)` 与 `jobs.state.rows`；列表快照不再携带 `jobsBySession` |
| 会话导航 | `uiWorkspace.openSession(target)`；`sessions.open` 不存在 |
| 模型目录 | `remote.session.modelCatalog()` 与可选 `modelDirectories` store |

## 布局面差异

- 中间列定位：`#root [data-slot="main"]` 的 `parentElement` 是 flex 列。
- 槽容器与页面根：`main` 槽容器可 `display: contents`，找弹性盒须跳过该占位层。
- 页面根优先：先取当前 entry 根，回退会话滚动区锚定的会话根。
- 全局面板：`ctx.get("layout")?.panelInfo.getSnapshot().activePanelId` 非 null 即面板在屏。
- 显隐：桌面窗格常驻，不按页面类型自动收起；`ensurePaneVisible` 只做防御性清理。
- 不读取 `data-global-panel` 标记：当前布局判定完全由槽结构与 `panelInfo` 承担。
- 移动断点：媒体查询 `(min-width: 768px)` 判桌面；≤767px 为抽屉，布局复位为外壳默认列。

## 移动壳层差异

| 关注点 | 0.2.0 壳层（3.2.0） | 0.2.2 壳层（3.3.x） |
|---|---|---|
| header 首子 | `headerLeading` 窄条 | 同左，窄视口另有宿主浮动侧栏开关 |
| hero 页 | header 被 `display:none` 隐藏 | 同左 |
| 壳层开关 | `data-mobile-nav="toggle"` 占 header 左座 | 同左；另有 `aria-label="Open sidebar"`/`"Collapse sidebar"` 按钮不在 header 子树 |
| 侧栏状态机 | frame 的 `data-sidebar-collapsed` | 同左 |
| 标题行下方 | 无标签行 | 新增 Chat/Trajectory 标签行，透明命中带上缘伸入标题行底部 |
| ⊡ 几何 | `offsetParent` 为 frame | ⊡ 移入 transform 容器，`offsetParent` 不再可信 |

## 补丁点（`src/client.mjs`）

### 开关落位

- 几何感知：header 包围盒宽高均非零才算可嵌；宽高归零回落 hero。
- 壳层开关占座：检出在屏的 `button[data-mobile-nav="toggle"]` 时改嵌会话头标题行行首。
- 避让：取行内可交互元素、壳层开关与宿主浮钮三者的最大右缘，按 `+8px` 增量修正 `margin-left`，幂等不振荡。
- 插入点：标题簇之前；无簇时行首 prepend。
- 叠置：嵌入态 `position: relative; z-index: 2`，高于壳层标签行容器、低于遮罩与抽屉。
- 命中盒：外层 44×38，内层徽标 36×24，文字 12px。

### hero 回落

- 锚：首个在屏的 `data-mobile-nav="toggle"` 或 `"fab"`，在屏判据 `x > -10px`。
- 挂载点：`[data-shell-overlay]` 的 `parentElement`。
- 几何：锚与 frame 的 rect 差，`left = fab.left - frame.left + fab.width + 8`，垂直居中；38 为量测失败保底高。
- 用 rect 差而非 `offsetLeft`：frame 位移在差中抵消，3.3.x 的 transform 容器不影响算式。
- 不可得分支：锚或 frame 缺失时已落位开关保留原位；frame 缺失才摘除。
- 两落位均不可得：开关不进入文档（不可嵌即不渲染）。

### 观察与唤醒

- body 级 `MutationObserver` 唤醒迟到槽座。
- 祖先链逐级 `childList` 观察：任一级断裂即重装窗格。
- frame 属性观察 `data-sidebar-collapsed`，翻转即检并 400ms 复检。
- 宿主重渲染丢弃嵌入节点后，下一轮渲染守卫重插。

### 软依赖

- `connection` 不在 `inject` 清单：取不到即通道降级。
- `modelDirectories`、`layout.panelInfo`、`EventSource`、`fetch` 任一缺失均静默降级。
- 服务代际更替：先释放旧引用与订阅，再绑定新服务并重置订阅基线。

## 验证

- `e2e/specs/mobile-shell.mjs`：真移动壳层，覆盖 hero 与 active 两态落位、叠置判定按有无标签行分流。
- `e2e/specs/desktop-layout.mjs`：桌面布局、全局面板切换与窗格形态保持。
- `e2e/specs/mobile-drawer.mjs`：移动抽屉、开关与遮罩交互。
- `e2e/specs/connection-resume.mjs`、`e2e/specs/connection-resume-desktop.mjs`：回前台壳层连接重建的触发面。
- `e2e/boot.mjs`：壳层版本按宿主代际分流。
- `e2e/helpers.mjs`：模型断言共享前缀。

## 残余边界

- 嵌入态层级数值耦合壳层层级契约，壳层改版会漂移。
- 标签行命中带的几何依赖壳层样式，改版后需重测叠置。
- 宿主锚长期不回归时，已落位开关停在最后有效位置。
- 0.2.2 的真实桌面安装版 PWA 未纳入自动验证。
