# dsh-activity-pane

DeepSeek Harness Web 的**活动会话总览窗格**插件：把正在运行的会话、以及完成一轮后等待你行动的会话，集中显示在一个可贴边、可滚动的窗格里；在移动端则收起为抽屉，用浮动按钮切换，不遮挡当前会话内容。

- **桌面**：窗格作为左侧栏旁的新列插入外壳 AppFrame（位于侧边栏与主会话之间），会话多了在窗格内滚动即可，不再出现"卡片向上溢出屏幕"的问题。
- **移动端（≤767px）**：窗格离开文档流变为从左侧滑出的抽屉，通过浮动按钮开关显示。
- **数据来源**：100% 使用 DSH 原生 `sessions` / `workspaces` 客户端服务（推送式快照），**不依赖** `dsh-answer-pet`、无轮询、无自有宿主路由。

## 卡片信息

- 每个活动会话一张卡片：工作区徽标、会话标题、运行/等待状态；等待用户行动的会话带徽标（待确认 / 待审查 / 待回复 / 需要响应）并以琥珀色高亮。
- 子代理以紧凑卡片嵌套在母会话下，结束后自动消失。
- 点击卡片（或 Enter/Space）跳转到对应会话。

## 安装与开发

```sh
# 本地开发安装（在 profile 中挂载；`file:` 依赖在磁盘上硬链接到本仓库）
dsh plugin --profile web add ./dsh-activity-pane

pnpm build:client   # 生成 .dsh-plugin/client.js
pnpm check          # core 单元检查 + bundle 校验
pnpm dev:watch      # 热更开发：监视 src/*.mjs，变化即重建 bundle
```

### 热更开发工作流

DSH 通过 `dsh-client-hmr` 监视已安装插件的 **client bundle 文件**，内容一变就推送
`rebuilt` 帧，浏览器单独热装该插件——**不需要整页刷新，也不需要重启 `dsh web`**
（host 侧改动除外，本项目 host 侧为空）。

由于本插件以 `file:` 依赖装入 profile（硬链接），且 `scripts/build-client.mjs`
采用**原地写入**，流程是：

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
