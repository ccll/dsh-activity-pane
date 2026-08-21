# dsh-activity-pane

<h2 align="center">本项目基于 <a href="https://github.com/Nanki-nn/dsh-answer-pet">dsh-answer-pet</a> 的设计，并按自己的喜好做了调整。</h2>

DeepSeek Harness Web 的**活动会话总览窗格**插件：把正在运行的会话、以及完成一轮后等待你行动的会话，集中显示在一个可贴边、可滚动的窗格里；在移动端则收起为抽屉，用浮动按钮切换，不遮挡当前会话内容。

## 对 `dsh-answer-pet` 的调整

本项目保留 `dsh-answer-pet` 的运行卡核心信息，但将呈现形态、数据来源和会话管理方式改造成独立的活动会话总览窗格。

- **去除宠物图标功能**：不再显示桌面宠物、宠物主题、动画、拖拽定位及其角落/尺寸/透明度配置，界面聚焦于会话活动本身。
- **从浮层改为固定窗格**：桌面上作为 `AppFrame` 中主会话左侧的固定列参与布局，支持独立滚动和折叠；手机端变为从左侧滑出的固定抽屉，通过浮动按钮开关，不遮挡主会话内容。
- **数据源完全独立**：不再依赖 `dsh-answer-pet` 的 DOM、`/answer-pet/state` 轮询或第三方状态路由，直接订阅 DSH 原生 `sessions` / `workspaces` 服务的推送式快照。
- **会话绑定更可靠**：由自有卡片直接绑定真实 `sessionId`，避免依赖上游 DOM 结构或卡片顺序导致会话错配。
- **显示工作区名称并参与排序**：会话卡片显示所属工作区名称，会话排序与左侧边栏中的工作区顺序保持一致。
- **增加会话元信息**：计划在卡片中补充当前使用的模型名称和推理级别（当前版本尚未接入对应字段）。
- **增加历史会话列表**：窗格分为「活动会话」和「最近历史」两个区域，非活动主会话在最近 24 小时内仍可快速找回。
- **强化等待响应提醒**：会话轮次结束后保留卡片并高亮提醒用户响应；同时区分待确认、待审查、待回复等等待状态。
- **增加当前会话高亮**：实时标识用户正在查看的会话，切换会话后高亮随之更新。
- **保留并迁移运行卡信息**：继续展示工具名、工具参数安全摘要、输出 token、近似速率、已运行时长、阶段进度和最近流程节点，但改为从 DSH 原生订阅快照派生，不复制 answer-pet 的宿主路由。
- **补充会话层级**：运行中的子代理以紧凑卡片嵌套在母会话下，结束后自动消失；历史区只保留主会话。
- **会话导航内建化**：点击或按 `Enter` / `Space` 可跳转到对应会话，由窗格自有卡片直接处理交互。
- **补充空态与桌面收起**：活动区无会话时显示明确空态；桌面窗格可收起为窄条，移动端则使用独立抽屉开关。

- **桌面**：窗格作为左侧栏旁的新列插入外壳 AppFrame（位于侧边栏与主会话之间），会话多了在窗格内滚动即可，不再出现"卡片向上溢出屏幕"的问题。
- **移动端（≤767px）**：窗格离开文档流变为从左侧滑出的抽屉，通过浮动按钮开关显示。
- **数据来源**：使用 DSH 原生 `sessions` / `workspaces` 推送快照，以及 native `sessions.history` / `sessions.models` 的一次性读取；**不依赖** `dsh-answer-pet`、无状态轮询、无自有宿主路由。

## 卡片信息

- 每个活动会话一张卡片：工作区、会话标题、模型名称/reasoning level、最近工作项与运行/等待状态；等待用户行动的会话带徽标（待确认 / 待审查 / 待回复 / 需要响应）并以琥珀色高亮。
- 最近历史卡固定为五层：工作区 + 模型、会话标题、最近用户首个非空物理行、最近 agent reply 首个非空物理行、最后活动时间，并沿用卡片 hover 高亮。
- **运行卡沿用 `dsh-answer-pet` 的卡片质感**：右上角模型名称/reasoning level + 主会话窗口最近 4 个工作项（图标语义、文字、详情、状态与顺序），进度条下方输出 token/近似速率/已运行时长；工具白名单参数摘要（path/url/query 等，不含完整命令或原始 JSON）与 answer-pet 风格轨迹/进度条继续保留，但不再渲染独立「思考中」「回答中」状态行。
- 子代理以紧凑卡片嵌套在母会话下，显示当前阶段摘要，结束后自动消失。
- 点击卡片（或 Enter/Space）跳转到对应会话。
- 卡片动态一律取自 DSH 原生会话快照（`chat.order` / `chat.nodes` / `runningCalls` / `partial` / `turnTimings` / `legacy.nodes` + 列表快照的 `projectionValues`）；冷会话只做 native history/model 一次性读取，不依赖 `dsh-answer-pet`、无状态轮询。

## 安装与开发

```sh
# 本地开发安装（在 profile 中挂载；pnpm `link:` 使 profile 内为指向本仓库的符号链接）
dsh plugin --profile web add ./dsh-activity-pane

pnpm build:client   # 生成 .dsh-plugin/client.js
pnpm check          # core 单元检查 + bundle 校验
pnpm dev:watch      # 热更开发：监视 src/*.mjs，变化即重建 bundle
```

### 热更开发工作流

DSH 通过 `dsh-client-hmr` 监视已安装插件的 **client bundle 文件**，内容一变就推送
`rebuilt` 帧，浏览器单独热装该插件——**不需要整页刷新，也不需要重启 `dsh web`**
（host 侧改动除外，本项目 host 侧为空）。

由于本插件以 `link:` 依赖装入 profile（profile 内为指向本仓库的符号链接），且
`scripts/build-client.mjs` 采用**原子写入**（临时文件 + rename），流程是：

1. `dsh plugin --profile web add ./dsh-activity-pane`，然后**重启一次 `dsh web`**
   （新增 bundle 需重启才进入加载名单；之后的热更无需再重启）。
2. 在本仓库运行 `pnpm dev:watch`（或 `node scripts/watch.mjs`）。
3. 改 `src/core.mjs` / `src/client.mjs` → watch 自动重建
   `.dsh-plugin/client.js` → profile 侧同一文件同步更新 → 浏览器热装生效。

> 注意：`dsh-activity-pane` 会改动 profile 的 `package.json`（加 `file:` 依赖）
> 并把插件加入 `dsh.profile.bundles`；离线快速实验可改用 DSH 会话内的
> `cordis_define` / `cordis_run` 动态加载，不落盘。

## 归属

`dsh-activity-pane` 是独立的新插件，非 `dsh-answer-pet` 的 fork，也不依赖它。多会话卡片布局（`src/client.mjs` 的 CSS 与 `src/core.mjs` 的归一化思路）借鉴自 [`dsh-answer-pet`](https://github.com/Nanki-nn/dsh-answer-pet)（MIT，Copyright (c) Nanki-nn）；本项目不包含其宠物主题、动画系统与 `/answer-pet/state` 数据源。相关来源声明见 [LICENSE](./LICENSE) 的 Third-party notices。

## 状态

v0.1 初始骨架：窗格挂载 + 卡片渲染 + 点击跳转 + 移动端抽屉。PRD 与 DESIGN 初版见仓库根目录 `PRD.md` / `DESIGN.md`（AgentMap 系统的一部分），后续按需求细化迭代。
