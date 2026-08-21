---
doc-type: decisions
mutation: append-only
id-prefix: C
owner: agent 主笔，项目属主审批
---

# DECISIONS — 决策日志

### C-001 新建独立插件仓库，而非 fork dsh-answer-pet
日期: 2026-08-20

#### 上下文
需要把 dsh-answer-pet-companion 的能力改造成「活动会话总览窗格」，产品形态与桌面宠物完全不同，且有大量自定义设计理念。存在「fork 上游完整历史」与「新建独立仓库、借鉴部分代码并声明来源」两条路线。

#### 决策
新建独立仓库 dsh-activity-pane：不 fork 上游历史，只借鉴多会话卡片布局等少量 MIT 代码，并在 README 与 LICENSE 中声明来源与归属。

#### 被否方案及原因
- fork dsh-answer-pet 完整历史：会让仓库身份被锁在桌面宠物上；上游对主题引擎/卡片 CSS 的演进会在我们重写过的文件上反复冲突；窗格插件的真正集成对象是 DSH Web 外壳（AppFrame/槽座），与上游宠物仓库内部结构无关。

#### 影响面
R-02-001 / 活动状态模型、R-02-003 / 活动状态模型；仓库形态、归属与许可管理

### C-002 数据源采用 DSH 原生会话/工作区服务，而非继承第三方状态路由
日期: 2026-08-20

#### 上下文
companion 的进度数据来自第三方插件的 `/answer-pet/state` HTTP 路由与轮询；新插件要完全独立、不依赖第三方宠物插件。

#### 决策
只订阅 DSH 原生 `sessions` / `workspaces` 客户端服务（推送式快照）取得运行、完成、等待行动与层级数据，不发起任何状态轮询，也无自有宿主路由。

#### 被否方案及原因
- 沿用 `/answer-pet/state` 轮询：引入对第三方插件的硬依赖，无法独立装/卸，且轮询带来无谓流量与渲染抖动；与「独立数据源」目标相悖。

#### 影响面
R-02-001 / 活动状态模型；R-01-001 / 活动状态模型

### C-003 桌面挂载采用「左栏旁新列」插入 AppFrame，而非右侧 details 槽或悬浮面板
日期: 2026-08-20

#### 上下文
桌面窗格需要贴边、不遮挡主会话；外壳已提供右侧 details 槽（可拖宽、狭窄时自动收起）与三栏 AppFrame；东家明确要求放在左侧栏旁的新列。

#### 决策
窗格作为 `#root [data-slot="conversation"]` 槽座的前置兄弟列插入外壳 flex 行，让让步链挤压中间栏；窄屏（≤767px）切为固定抽屉 + 浮动开关。

#### 被否方案及原因
- 复用右侧 details 槽：外壳现成、代价低，但位置在右、不满足东家「左侧栏旁新列」的形态要求。
- 独立悬浮覆盖面板：与移动端浮层同源，会遮挡主会话，违背「不遮挡」目标。

#### 影响面
R-01-007 / 窗格渲染器、R-01-008 / 窗格渲染器、R-02-002 / 窗格渲染器

### C-004 桌面窗格以"中间列内真实 flex 行元素"实现，弃用浮层与 margin 推挤
日期: 2026-08-20

#### 上下文
C-003 计划在槽座前置插入列；实现中发现外壳 AppFrame 是 CSS Grid 三列，`[data-slot="conversation"]` 为 `display:contents` 无盒占位、其父级是中间列（flex column）而非 grid 行。先试"绝对定位浮层 + 会话座 margin 推挤"：槽座无盒导致 margin 不产生位移，主会话纹丝不动、窗格像盖子覆盖并拦截主会话区点击；聊天列还出现贴左不居中。东家明确要求：窗格必须真实占据空间、与其它元素一起参与布局，禁止浮层。

#### 决策
桌面下把中间列临时改为行方向，窗格作为其内真实的 flex 行子项（先于会话座）占据左侧固定宽（默认 280px）；经祖先链（跳过 `display:contents`）找到会话根并设 `flex:1 1 0%` 弹性填充余宽，会话内容（标题/tabs/滚动区/输入框）随窗格展开让位、随折叠（窄条）同步恢复；聊天列在增宽的会话带内自动居中。仅桌面生效：移动端抽屉以 `position:fixed` 脱离文档流，并恢复外壳默认列布局。卸载时复位对中间列/会话根的改写。

#### 被否方案及原因
- 绝对定位浮层 + 会话座 margin 推挤：槽座 `display:contents` 无盒，margin 无位移 → 内容不动、窗格覆盖、点击被拦截；与"真实占据空间"相悖。
- 收紧聊天列 max-width（748→620）：根因是会话根未弹性填充（缩至内容最小宽）而非列宽，方向错误无效。

#### 影响面
R-01-007 / 窗格渲染器、R-01-008 / 窗格渲染器、R-01-011 / 窗格渲染器

### C-005 富卡内容经客户端原生订阅快照复刻 answer-pet 卡片，而非移植宿主侧事件折叠 + HTTP 路由
日期: 2026-08-21

#### 上下文
东家要求活动卡片内容向 answer-pet 的卡片靠拢（阶段文案、工具白名单参数摘要、token 计数与速率、阶段进度、最近流程节点轨迹）。调研确认 answer-pet 的 `/answer-pet/state` 本身源自 DSH 原生 `session/event` 事件流（宿主侧折叠 progress/trace 后经 HTTP 轮询下发），不含任何私有数据；存在两条复刻路线。

#### 决策
不移植 answer-pet 的宿主侧会话事件折叠与自有 HTTP 路由，而是从纯客户端原生订阅快照复刻等价字段：
- 阶段/工具名/参数摘要：`sessions.binding(id).session` 的 `runningCalls`（name/argsRaw）、`partial`（stream/reasoning 块）、`turnTimings`（回合时长）；
- 已定案流程节点：`chat.legacy.nodes` 中的工具调用节点（`call.name`/`call.argsRaw`/`callTime`/`time`/`isError`）；
- token/速率：`sessions.list` 条目 `projectionValues.tokenUsage`（累计输出/输入）与 `sessionStats`（decodeTokens/decodeMs 吞吐），复用既有列表订阅，无新增轮询；
- 阶段进度：由阶段 + 输出 token 累计估计，渲染层按回合叠加单调下限，同回合不倒退。

#### 被否方案及原因
- 移植 answer-pet 宿主侧 `session/event` 折叠 + 自有 `/answer-pet/state` HTTP 路由：字段最精确（逐 chunk usage、速率 EMA、textSnippet 都在宿主侧可算），但要求引入 Node 宿主半端并维护自有状态路由与轮询，违背 NG-4 与 R-02-004「无自有路由、无状态轮询」纪律；且客户端订阅快照已带齐等价原语，精度损失仅外观级（token 累计口径、速率/进度近似、trace 由节点派生而非逐 chunk 重建）。

#### 影响面
R-01-009 / 活动状态模型、R-01-009 / 窗格渲染器

### C-006 最近卡片「最后做的事情」取列表投影 timelineUserMessages，投影缺失时优雅降级
日期: 2026-08-21

#### 上下文
东家要求历史会话卡片的信息更全面：补上工作区名称与「最后做的事情」。工作区名称缺口在于 `buildRecent` 已计算 `workspaceTitle` 但最近卡骨架从未渲染徽标（收口 R-01-003/AC-03 的实现缺口）。「最后做的事情」需要新的数据源：CLI 侧会话摘要不携带消息正文，运行期对非活动会话的 `binding().session` 是 cold（窗口未开、无 nodes），无法在不打开会话窗口的前提下读取最近一条用户消息；而宿主 `sessions.list` 条目本就推送 `projectionValues`（含第三方时间轴插件 `dsh-session-timeline` 注册的 `timelineUserMessages`：最近用户消息文本 + 回复预览）。

#### 决策
- 工作区名称：在最近卡骨架补 `.dap-workspace` 徽标元素，已有 `workspaceTitle` 直接上卡（实现缺口收口，不新增数据流）。
- 最后做的事情：新增核心纯函数 `lastActivityPreview(projectionValues)`，从列表条目 `projectionValues.timelineUserMessages` 取 **`seq` 最大条目**（不假设数组顺序）的用户消息文本（`text`），缺失时回退该条回复预览（`reply`），经 `cleanPreview` 截断后上卡；并入 `cardSignature` 触发去重重绘。
- 该投影经既有列表订阅推送（无新增轮询、无自有路由），仅有该投影的插件未装入时不产生该 key，卡片退化为仅显示时间；以下一次渲染的自然降级为边界，不报错。命名与语义保持「可留意」，但对缺失的容忍完全兼容 R-02-001「未装第三方插件仍可用」：窗格整体功能不依赖该 key 存在。

#### 被否方案及原因
- 原生 `sessionStats` 摘要（共 X 轮 · Y 步）：纯原生、无第三方依赖，但只是工作量统计，不是「最后做了什么」的消息级内容，与东家意图不符。
- 打开发行会话读取最近消息节点：能拿到消息正文，但要求对每个历史会话执行 `session.open()`/拉历史分页，违背「不主动轮询、轻量常驻」的既有纪律，且一次性拉取多会话历史开销不可控。
- 仅靠 `updatedAt` 时间行：已在卡片上，不构成「最后做的事情」。

#### 影响面
R-01-010 / 活动状态模型、R-01-010 / 窗格渲染器；R-01-003/AC-03 / 活动状态模型、R-01-003/AC-03 / 窗格渲染器

### C-007 撤回 T-004 最近卡增强，恢复基础历史卡行为
日期: 2026-08-21

#### 上下文
东家反馈 T-004 的最近历史卡增强方案不理想，要求撤回。T-004 的实现提交为 `886d1ad`，关闭提交为 `dfdd24a`；代码、当前 PRD/DESIGN/DOMAIN 与测试需要回到 T-004 之前的基线 `b2b416f`。C-006 保留为历史记录，不改写决策日志。

#### 决策
废弃 C-006 对当前产品行为的影响，恢复 T-004 之前的最近历史卡：仅保留既有标题与最近时间呈现，不读取 `timelineUserMessages` 投影，不新增最近卡工作区徽标或最后活动预览。以新的撤回提交与 T-005 记录审计链，不通过改写历史 commit 消除 C-006/T-004。

#### 被否方案及原因
- 仅隐藏预览但保留 `lastActivity` 数据链：仍保留东家认为不理想的数据依赖与契约复杂度，未达到撤回目的。
- 直接删除 C-006 或 T-004：违反 `DECISIONS.md` 只追加与 terminal task 不可修改的审计纪律。

#### 影响面
R-01-010 / 活动状态模型、R-01-010 / 窗格渲染器；R-01-003 / 活动状态模型、R-01-003 / 窗格渲染器

### C-008 工作项与历史预览使用 DSH native conversation 数据，不重新依赖 timelineUserMessages
日期: 2026-08-21

#### 上下文

新的 R-01-012/R-01-013 要求活动卡复用主会话窗口最近 4 个工作项（含当前实时项），并要求历史卡分别显示最近用户消息与 agent reply 的第一个非空物理行。当前会话快照已经提供 `chat.order`、`chat.nodes`、`partial`、`runningCalls`；冷会话可通过 native `sessions.history` 只读读取原始事件，模型上下文可通过 native `sessions.models` 读取。旧 C-006/T-004 的 `timelineUserMessages` 投影会折叠空白且只表达用户消息/回复对，不能保证工作项顺序与物理首行。

#### 决策

使用 DSH native conversation snapshot、native history API 与 native model catalog 作为数据源：当前会话优先读 `chat.order`/`chat.nodes` 并由 `session.subscribe` 推送刷新；冷会话仅做一次 history/model 读取并在缺失时降级为空字段。不得新增第三方路由、不得把 `agentPreset` 当模型名称，也不重新引入 `timelineUserMessages` 作为必需依赖。

#### 被否方案及原因

- 复用 `timelineUserMessages` 投影：只能提供压平后的用户/回复预览，不能证明主窗口工作项的完整顺序，也丢失物理换行语义。
- 打开每个会话窗口再克隆主窗口 DOM：会改变当前会话选择并产生不可控的布局/网络副作用。
- 自建宿主 projection/HTTP route：会扩大插件部署边界，违背原生只读服务与无自有状态路由约束。

#### 影响面

R-01-012 / 活动状态模型；R-01-013 / 活动状态模型、窗格渲染器；R-02-004 / 窗格渲染器

