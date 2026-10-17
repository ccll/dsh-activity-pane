---
doc-type: rationale
mutation: append-only
id: C-063
owner: agent
---

# C-063 透明 7px 承载盒内仅绘制 5px 圆核，光晕跟随圆核 alpha（修订 C-062）

日期: 2026-08-28

#### 上下文
C-062 恢复 7px 同盒后解决了竖线视觉偏移，也恢复了半透明外围；但可见 1px border 与沿 7px 盒绘制的 box-shadow 使节点整体轮廓再次与标题前 7px 圆点同大。东家现场指出「时间线节点又变回和标题圆点一样大」。问题不在承载盒尺寸，而在承载盒被当作可见图形：对齐所需的 7px 几何与用户应看到的 5px 圆核没有分离。

#### 决策
- 保留 `left:0; top:3px; width:7px; height:7px` 的同心承载盒，以维持与标题点和 1px 竖线相同的跨 DPR 光栅相位；承载盒 1px border 改为完全透明。
- 实体背景继续使用 `background-clip: padding-box`，因此只在透明 border 内显示 5px 圆核；删除全部按 7px 盒绘制的 box-shadow。
- 普通节点使用基于可见圆核 alpha 的 1px `filter: drop-shadow` 生成半透明 halo；running 节点使用同源 1px halo + 3px glow，并保留 `dap-pulse`。
  - halo 可以超出 5px 核，但不形成 7px 实线轮廓。
- 自动化验证透明承载盒、5px 核、box-shadow 缺席、drop-shadow 分层、页面绝对同心与脉冲实际变化；DPR 放大验收确认视觉主体小于标题点且 halo 跟随小圆核。

#### 被否方案及原因
- 再次回退为实际 5px 元素：会重现 C-062 已证实的跨 DPR 光栅相位偏移。
- 保留可见 7px border、仅降低 alpha：仍会形成与标题点同尺寸的完整轮廓，只是更淡。
- 用硬停色 radial-gradient 在 7px 盒内烘 5px 核：C-036 已证实近看产生八边形阶梯轮廓。
- 新增嵌套 DOM：透明 border + padding-box 背景 + alpha drop-shadow 已能在单个伪元素内分离承载盒与可见图形，无需增加节点。

#### 影响面
R-01-009 / 窗格渲染器
