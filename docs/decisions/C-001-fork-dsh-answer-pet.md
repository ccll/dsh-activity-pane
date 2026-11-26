---
doc-type: rationale
mutation: append-only
id: C-001
owner: agent
---

# C-001 新建独立插件仓库，而非 fork dsh-answer-pet

日期: 2026-08-20

#### 上下文
需要把 dsh-answer-pet-companion 的能力改造成「活动会话总览窗格」，产品形态与桌面宠物完全不同，且有大量自定义设计理念。存在「fork 上游完整历史」与「新建独立仓库、借鉴部分代码并声明来源」两条路线。

#### 决策
新建独立仓库 dsh-activity-pane：不 fork 上游历史，只借鉴多会话卡片布局等少量 MIT 代码，并在 README 与 LICENSE 中声明来源与归属。

#### 被否方案及原因
- fork dsh-answer-pet 完整历史：会让仓库身份被锁在桌面宠物上。
  - 上游对主题引擎/卡片 CSS 的演进会在我们重写过的文件上反复冲突。
  - 窗格插件的真正集成对象是 DSH Web 外壳（AppFrame/槽座），与上游宠物仓库内部结构无关。

#### 影响面
R-02-001 / 活动状态模型、R-02-003 / 活动状态模型；仓库形态、归属与许可管理
