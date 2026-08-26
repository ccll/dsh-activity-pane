---
doc-type: task
mutation: lifecycle
id: T-061
---

# T-061 最近历史卡底色与描边辨识度提升

状态: active
关联: R-01-013/AC-11 / 窗格渲染器
风险等级: standard

## 背景与目标

东家反馈最近历史卡背景色与窗格下层底色太接近、辨识度低，要求适当提升辨识度。现状三因素叠加致卡片边界几乎不可辨：深色底色 `rgba(22,24,29,0.9)` 与窗格底色（`currentColor 3%` 叠加）差值过小，`border-color: transparent` 无描边，`opacity: 0.8` 半透明与下层融合。UI/UX 改进走全链：PRD R-01-013 追加 AC-11（底色与描边可分辨、弱化不得使轮廓不可辨；AC-10 弱化语义不变），DESIGN「最近卡弱化且可辨的视觉呈现」条目与追溯索引落点同步演进，两闸口均经东家确认。

## 差距评估

- 深色 `[data-kind="recent"]` 规则：`background: rgba(22, 24, 29, 0.9)` + `border-color: transparent`（opacity 0.8 保留不动）。
- 浅色覆盖块同名规则：`background: var(--dsw-specific-sidebar-fill, rgb(249,250,251))` + `border-color: transparent`。
- check.mjs R-01-013/AC-10 断言精确锚定旧 CSS 文本（`rgba(22, 24, 29, 0.9)` + transparent + opacity 0.8 三行），需改写并补 AC-11 锚点。
- acceptance.mjs R-01-013/AC-10 人工步骤仅验淡化，需补 AC-11 人工验收条目。
- hover 描边反馈本就被更高优先级的 `[data-kind]` 规则压掉（基态 transparent 时如此），本次加弱描边后行为一致，无回归；亮度反馈不变。

## 收敛方案

- `src/client.mjs`：深色 recent 规则 `background: rgba(31, 34, 42, 0.92)` + `border-color: rgba(255, 255, 255, 0.08)`；浅色块 recent 规则 `background: var(--dsw-alias-bg-layer-2, #ffffff)` + `border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))`；opacity 0.8 与其余声明不动。
- `scripts/check.mjs`：AC-10 断言改写为新底色/描边文本（opacity 0.8 钉住不变），新增 AC-11 断言（深色弱描边与浅色覆盖块底色/描边进入 bundle）。
- `scripts/acceptance.mjs`：新增 R-01-013/AC-11 人工验收条目（深浅主题各验一次轮廓可辨）。

### 迭代调档（东家实机反馈后）

- 首版参数提过了头：深色 `rgba(31,34,42)` 亮于活动卡 `rgba(29,31,37)`，浅色与活动卡同为 `--dsw-alias-bg-layer-2` 纯白，历史卡与活动卡同档抢视线。
- 东家确认中间档（PRD 承诺不变，DESIGN 参数重调，目标区间：背景 < 历史卡 < 活动卡）：深色 `rgba(26,28,34,0.92)`（活动卡与旧值正中）；浅色 `rgb(243,244,246)`（暗于活动卡纯白、深于窗格底色）；弱描边与 opacity 0.8 不变。
- DESIGN 条目同步「介于窗格底色与活动卡底色之间」口径；check.mjs AC-11 断言与 acceptance.mjs 人工条目（补「比活动卡略暗」）同步更新。

## 测试计划

- `scripts/check.mjs`：R-01-013/AC-10 断言改写 + R-01-013/AC-11 新增断言，锚定 AC-ID。
- `scripts/acceptance.mjs`：新增 AC-11 人工步骤。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：深浅两主题最近卡底色与描边均与窗格底色可分辨，轮廓可辨 | `scripts/check.mjs#R-01-013/AC-11`、`scripts/acceptance.mjs#R-01-013/AC-11`、`src/client.mjs::CSS` |
| 异常 | 不适用：纯 CSS 呈现调整，无数据/失败路径 | — |
| 边界配置 | 适用：浅色主题覆盖块正确覆盖底色与描边；hover 亮度反馈不变 | `scripts/check.mjs#R-01-013/AC-11`、`src/client.mjs::CSS` |
| 副作用 | 适用：opacity 0.8 弱化语义（AC-10）、活动卡/subagent 卡样式、迁移动画均不变 | `scripts/check.mjs#R-01-013/AC-10`、`src/client.mjs::CSS` |

## 终态与证据

（关闭时填写）
