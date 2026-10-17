---
doc-type: rationale
mutation: append-only
id: C-017
owner: agent
---

# C-017 时间线只保留折叠分组呈现，移除逐项镜像与 dsh-auto-collapse 检测切换

日期: 2026-08-25

#### 上下文
R-01-017 落地后东家实际使用中始终偏好折叠分组呈现；逐项镜像只在未装或未生效 dsh-auto-collapse 时出现。双路径使 core 维持两套时间线与槽位派生家族，client 维持生效探测、memo 键切换维度，以及一套仅服务逐项镜像的宿主 DOM 匹配/图标克隆呈现机器（约 200 行）。而折叠分组本身是 vendor 数据层移植（C-016），不依赖该插件存在，检测切换并无功能必要性。

#### 决策
工作项时间线一律采用折叠分组呈现：删除逐项时间线家族（`conversationTimeline`/`conversationTimelineWithSlot`/`historyTimelineWithSlot`/`SLOT_SCAN_BUDGET`）、dsh-auto-collapse 生效探测与条件切换，连同失去消费者的原生行匹配/图标克隆机器；core 以 `conversationWorkItems` 扁平内核作为折叠输入与分组成员级观察接缝。R-01-009/R-01-012 相关 AC 同次改写为分组行语义。

#### 被否方案及原因
- 保留检测仅把默认切为折叠：双路径与全部维护成本原样保留，只换默认值，收益不成比例。
- 仅删数据路径、暂留 DOM 匹配死代码：消费者已不存在，留置即成无守卫死代码，且本次收口后无回归风险面。

#### 影响面
R-01-009、R-01-012、R-01-017 / 活动状态模型、窗格渲染器
