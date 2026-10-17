---
doc-type: rationale
mutation: append-only
id: C-071
owner: agent
---

# C-071 沿用外壳透明调宽手柄并将活动窗格滚动条内缩

日期: 2026-08-31

#### 上下文

activity-pane 的右缘调宽手柄目前覆盖 native scrollbar 的大部分命中区，导致指针进入右侧时优先进入调宽逻辑。东家对照 DSH 左边栏确认：调宽区域应保持在列边界的窄透明命中条，只改变光标、不绘制 hover 高亮；滚动条应在其左侧保留可拖动区域。DSH AppFrame 的调宽本身也是 pointer capture，而不是 CSS `resize`。

#### 决策

保留 activity-pane 的 `.dap-resize` 在 pane 右缘及现有 pointer-capture 调宽实现，删除 hover/拖动背景高亮；让 `.dap-scroll` 按 `--dsh-scrollbar-width` 派生的小右侧 inset 配合 `scrollbar-gutter: stable`，使 native scrollbar 位于调宽手柄左侧；鼠标指针进入窗格时显示滚动条，停止滚动且指针离开后隐藏。

#### 被否方案及原因

- 整体左移调宽手柄：会改变用户熟悉的列边界命中位置，和 DSH 左边栏的交互几何不一致。
- 使用 CSS `resize: horizontal`：浏览器原生控件只适合元素自身的调整尺寸，无法直接承接当前 flex 列让位、宽度夹取、localStorage 持久化和现有折叠/移动端门控。
- 继续提高或降低 `z-index`、切换 `pointer-events`：只能决定调宽手柄或 native scrollbar 谁命中，不能同时保留两者的交互。

#### 影响面
R-01-004 · 窗格渲染器；R-01-015 · 窗格渲染器、活动状态模型
