---
doc-type: rationale
mutation: append-only
id: C-036
owner: agent
---

# C-036 时间线圆点以同盒实体圆角裁剪取代硬停色 radial-gradient

日期: 2026-08-26

#### 上下文
84846c3 为解决 5px 时间线点与 7px 标题点跨 DPR 光栅相位差，把时间线点改为 7px 同盒并在内部用半径 2.5px 的硬停色 radial-gradient 烘出 5px 实心核。圆心对齐改善，但硬阈值核在 DPR 2 下形成 `4,8,8,10,10,10,10,8,8,4` 的阶梯轮廓，近看为八边形；现有测试仅钉 CSS 字符串，未验证最终光栅圆度。

#### 决策
- 保留 7px 承载盒、left 0 与竖线圆心 x=3.5 的跨 DPR 对齐几何。
- 5px 视觉实心核改由实体背景、`border-radius: 50%`、1px 半透明 border 与 `background-clip: padding-box` 原生裁剪；外半环继续由 1px box-shadow 承载，running 光晕与脉冲不变。
- 自动化契约断言硬停色 radial-gradient 缺席并钉住实体圆角结构；DPR 1/1.25/1.5/2 以 GUI 放大验收最终轮廓与圆心对齐。

#### 被否方案及原因
- 调宽 radial-gradient 停色过渡带：不同 Chromium/DPR 的渐变采样仍可能产生轮廓差异，且继续让视觉核绕过原生圆角裁剪。
- 为每行新增嵌套圆点 DOM：可独立绘制 5px core，但增加节点、渲染与复用逻辑；现有伪元素用 border/background 即可满足。
- 回退为独立 5px 圆盒：恢复平滑轮廓但重新引入 5px/7px 盒跨 DPR 光栅相位差。

#### 影响面
R-01-009 / 窗格渲染器
