# dsh-activity-pane

[![npm version](https://img.shields.io/npm/v/dsh-activity-pane)](https://www.npmjs.com/package/dsh-activity-pane)
[![npm downloads](https://img.shields.io/npm/dm/dsh-activity-pane)](https://www.npmjs.com/package/dsh-activity-pane)
[![GitHub stars](https://img.shields.io/github/stars/ccll/dsh-activity-pane?style=social&label=Star)](https://github.com/ccll/dsh-activity-pane/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 简体中文

DSH (DeepSeek Harness) 一大痛点是缺少活动会话与历史会话的管理，重度用户在同时运行跨越多个工作区的多个会话时，无法一目了然的掌控全局，尤其当 DSH 原生左边栏工作区的会话积累过多之后，活动会话的信息过于分散，无法解答以下问题：
- 现在有多少个会话在并行跑？
- 哪些会话启动了子代理甚至孙代理会话？它们有多少？
- 每个会话现在正在做什么？它们的进度如何？跑了多长时间？
- 每个会话使用什么模型？什么推理级别？输出速率、缓存命中率和 token 使用情况如何？
- 哪些会话的 agent 轮次最近刚结束，需要我行动？
- 过去一段时间我在哪些会话里交互过？最近的指令与结论是什么？
- ...

本插件试图解决这些问题，提供了一个**活动会话总览窗格**：将正在运行的会话、子会话、轮次完成后等待行动的会话、近期活跃过的历史会话，集中在一个窗格内进行整体展示。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-desktop-dark.png">
    <img src="assets/screenshot-desktop-light.png" width="1000" alt="隔离演示环境中的活动会话总览窗格（默认中间显示档）：展示实时会话状态、子代理层级、提问等待、完成提醒、错误提醒和最近历史">
  </picture>
</p>
<p align="center"><sub>同一干净隔离环境中模拟编程任务的 <a href="assets/screenshot-mobile-dark.png">移动端深色抽屉</a> · <a href="assets/screenshot-mobile-light.png">移动端浅色抽屉</a></sub></p>

## 安装

```sh
dsh plugin --profile web add dsh-activity-pane
```

npm 包内置预构建产物，无需本地构建步骤。安装后如窗格未出现，重启一次 `dsh web` 即可。

## 环境要求

- DSH (DeepSeek Harness) Web，经 `@deepseek-ai/dsh@0.1.5-rc.1` 实测验证。
- 无第三方插件依赖：窗格只消费 DSH 原生会话与工作区服务，卸载可逆。

## 感谢与声明

- 本项目灵感来自 [`dsh-answer-pet`](https://github.com/Nanki-nn/dsh-answer-pet) 插件，借鉴了其中会话卡片的设计思路，并按自己的使用习惯与喜好做了调整与重新实现，感谢原作者的创意！
- 折叠时间线的分组语义改编自 MIT 许可的 [`dsh-auto-collapse`](https://github.com/a179-sanae/dsh-auto-collapse) 插件（数据层移植，无运行时依赖），感谢原作者。
- 时间线正文行与最近卡的 agent 角色机器人图标采用 ISC 许可的 [Lucide](https://lucide.dev) `bot` 图标几何，感谢 Lucide 贡献者。
- 本项目代码与文档 99.99% 由 AI 编写与审核，大概率存在 bug 与文档/代码不同步等问题，使用中如遇到问题请提交 issue。

## 相比 dsh-answer-pet 的调整

> 本项目始于对 [`dsh-answer-pet`](https://github.com/Nanki-nn/dsh-answer-pet) 的个人再造，下表以该插件为对照写成——如果您没用过它，直接当作功能清单阅读即可。

- [x] **从浮层改为固定窗格**：桌面端在左边栏工作区的右侧增加常驻贴边列；移动端使用默认隐藏的固定抽屉，通过会话头部的「活动」按钮展开，不挤压主会话布局。
- [x] **去除宠物图标功能**：不支持宠物相关功能，界面聚焦于会话活动本身。
- [x] **原生数据源订阅**：直接订阅 DSH 原生 `sessions` / `workspaces` 服务的推送式快照；时间线最多显示 4 个折叠工作项行，保留最近用户指令与真实执行中的工作项。
- [x] **增加历史会话列表**：窗格分为「活动会话」和「最近历史」两个区域，非活动主会话按最近活动时间分批呈现；历史区底部提供「加载更多...」按钮，点击后才继续找回更早会话；卡片同时显示绝对日期时间与相对活动时间。
- [x] **强化等待行动提醒**：阻塞等待、完成提醒与错误提醒分别以金色、绿色和红色卡片标识；提问直接预览问题列表，完成提醒经卡片上的「移入历史」按钮显式确认；状态由宿主侧持久化并在所有客户端间同步，刷新页面或另开窗口不会丢失未确认的完成提醒和尚未被新回合覆盖的错误提醒。状态胶囊右侧还会显示进入当前状态的相对时间（如「5 分钟前」），随分钟级时钟更新，进入时刻不可得时不显示。
- [x] **显示子/孙会话层级**：子代理以连接线和紧凑卡片嵌套在母会话下；母会话自身回合结束但仍有活动后代时继续按运行中呈现，子代理结束且没有活动后代后从活动区消失；历史区只保留主会话。子代理卡显示模型溯源、reasoning effort 与回合进度。
- [x] **工作区徽标稳定配色**：会话卡片显示工作区徽标，前景/背景颜色按工作区身份稳定派生——增删或变更其它工作区、页面刷新均不改变既有配色。
- [x] **活动会话新近度排序**：运行中会话置顶并按最后用户指令时间从新到旧排列；等待行动会话按进入等待状态的时刻从新到旧排列。
- [x] **展示当前工作与运行统计**：活动卡以最多 4 行折叠时间线展示最近指令、思考与工具调用，标题行显示累计运行时长（超一小时按时分秒显示）；完整呈现档的运行中卡片还显示回合进度、输出速率、缓存命中率、输入/输出 token 与运行时长，进入完成、阻塞或错误等待后在统计行末尾与 tok/s 等内容并列保留上一轮耗时及最后已知统计；迁入最近历史后，历史卡在助手预览与活动时间之间继续保留最后一轮的可用统计。
- [x] **三档显示密度一键切换**：标题行工具区的切换按钮按紧凑→中间→完整循环切换全部卡片的呈现密度，默认中间档——中间档保留标题、工作区徽标、时间线最新一行（运行中实时更新）与等待正文（完成提醒收合为单行），紧凑档仅保留标题行；切换时滚动锚定当前卡片，档位持久化、刷新后恢复。
- [x] **标题行三区布局**：最左独立区常显 GitHub 仓库入口（悬停提示「报告问题，点赞收藏」），中部标题区悬停显现收起方向图标，右侧工具区常显档位切换按钮——两按钮分处标题行两端，消除触屏误触。
- [x] **加入会话导航跳转**：点击或键盘激活会话卡片可跳转到对应会话页面，当前会话保持高亮；从 DSH 原生左侧栏选择会话时，对应窗格卡片会滚动到完整可见，不强制居中。
- [x] **增加会话元信息**：会话卡片中显示当前使用的模型名称和推理级别。
- [x] **完善桌面与移动交互**：桌面窗格可折叠、拖拽调宽并记忆宽度；移动端使用不挤压主会话布局的固定抽屉；长列表提供独立滚动与回到顶部按钮。

## 支持本项目

如果这个插件让您的 DSH 会话管理更顺手，欢迎到 [GitHub](https://github.com/ccll/dsh-activity-pane) 点一个 ⭐——只需一秒，就能帮更多 DSH 用户发现它。想法与问题欢迎到 [Issues](https://github.com/ccll/dsh-activity-pane/issues) 与 [Discussions](https://github.com/ccll/dsh-activity-pane/discussions) 提交。

## 许可证

MIT，完整文本见 [LICENSE](LICENSE)。
