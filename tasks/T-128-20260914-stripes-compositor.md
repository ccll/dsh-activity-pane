---
doc-type: task
mutation: lifecycle
id: T-128
---

# T-128 运行卡进度条纹动画合成器化：background-position 平移改 transform 载体

状态: completed
关联: R-01-009 → 活动状态模型（AC-08 进度条纹呈现）；R-01-014 → 窗格渲染器
风险等级: standard

## 背景与目标

- 背景: T-127 调研确认运行卡进度条纹动画 `dap-stripes` 以 `background-position` 实现滚动——background-position 不是可合成属性，每帧触发重绘（paint）；在移动端抽屉打开时与宿主流式重绘叠加放大 GPU/CPU 开销。T-127 已治理屏外休眠与渲染频率，本 task 处理剩余的逐帧重绘源。
- 目标: 条纹滚动改为合成器驱动的 transform 平移，视觉等价（同周期 20px 双色条纹、同滚动速度、同裁切形态），消除逐帧重绘。
- 非目标: 不改条纹呈现语义（R-01-009/AC-08「持续向右滚动」不变）；不改等待卡脉冲与徽标 brightness 脉冲（filter 为可合成属性，非重绘源）；不动 reduced-motion 行为（保留条纹动画，仅关宽度过渡，现状注释明确）。

## 差距评估

- client.mjs: `.dap-fill` 以 `background: repeating-linear-gradient` + `animation: dap-stripes`（background-position 0 → 40px，0.8s linear infinite）实现；无独立条带载体可供合成。
- 测试: check.mjs:3874 断言 `animation: dap-stripes 0.8s linear infinite;`（动画声明保留即可继续命中）；无 keyframes 内部机制断言。

## 收敛方案

1. `.dap-fill` 保留 width %（进度）+ width 过渡 + box-shadow + border-radius，新增 `overflow: hidden` 裁切载体（自身 box-shadow 不受 overflow 影响，子内容被裁）；移除背景与 animation。
2. 新增 `.dap-fill::after` 伪元素条带：`width: calc(100% + 40px)`（相对 fill 宽度自适应，位移全程覆盖 fill 可视区）、背景 repeating-linear-gradient 原样、`animation: dap-stripes` 改为 `transform: translateX(0) → translateX(-40px)`（40px = 2 个 20px 条纹周期，无缝循环且保持原感知速度）。
3. check.mjs 补 keyframes transform 机制断言。

## 测试计划

- 契约: `scripts/check.mjs`（既有 stripes 动画断言继续命中 + 新增 transform keyframes 断言）。
- E2E: `card-content.mjs`（进度条呈现）、`auto-update.mjs`（运行卡实时更新）、`mobile-thermal.mjs`（功耗回归）。
- 人工: 条纹滚动观感与速度对照由东家验收（acceptance.mjs 既有 AC-08 条目覆盖）。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：运行卡进度条条纹持续向右滚动，视觉等价原 background-position 实现 | `e2e/specs/card-content.mjs::cardContent`、`scripts/check.mjs#dap-stripes` |
| 异常 | 适用：进度为 null/零宽度时条纹无可视面积，无渲染开销 | `e2e/specs/card-content.mjs::cardContent`、`scripts/check.mjs#dap-stripes` |
| 边界配置 | 适用：极小进度宽度下位移全程仍覆盖填充区（calc(100%+40px) 载体）；reduced-motion 行为不变 | `e2e/specs/card-content.mjs::cardContent`、`scripts/check.mjs#dap-stripes` |
| 副作用 | 适用：width 过渡动画保留；功耗回归不劣化 | `e2e/specs/mobile-thermal.mjs::mobileThermal` |

## 终态与证据

- 实现: `.dap-fill` 保留 width 过渡/`overflow:hidden` 裁切/阴影/圆角，移除背景与 animation；新增 `.dap-fill::after` 伪元素条带（`width: calc(100% + 40px)`）承载 repeating-linear-gradient，滚动改 `dap-stripes` transform 平移，滚动帧全程合成器驱动；`scripts/check.mjs` 基础断言迁移到 ::after 载体并新增 transform 机制断言与 background-position 无残留反向断言；reduced-motion 行为不变（仅关宽度过渡）。supersession 如实记录：本 task 现场的视觉等价存在两处偏差——①方向翻转（`translateX(0→-40px)` 使条纹视觉左移，与 AC-08「持续向右滚动」不符）；②周期加倍（色带 10px→20px，依据「background-size:200% 拉伸后观感等价」的错误假设——px 色标不受拉伸）；两者均由 T-129（提交 3c56a08）校正为右移、10px 色带。提交 3f12c6e 正文中「渐变周期 40px 与原 background-size 200% 拉伸观感等价」一句基于该错误假设且不可改史，以 T-129 校正后状态为准。
- 测试: 本 task 现场（3f12c6e 提交正文「验证」段）：`pnpm check` 全绿；card-content / auto-update / mobile-thermal E2E 全绿（证据在提交正文，task 终态当时未回填）。当前 HEAD 新鲜回归（2026-09-22）：pre-push 重放完整 `pnpm verify` 通过——agentmap lint、test impact、`scripts/check.mjs` 全部断言（含 `animation: dap-stripes` 锚定 R-01-009/AC-08、transform keyframes 机制断言、`background-position: 40px` 无残留反向断言）与 19 个浏览器 E2E spec（含 card-content、auto-update、mobile-thermal）。达标类性能收敛的量化守恒（C-082）：mobile-thermal E2E rAF 请求次数阈值断言通过（流式回合 5s rAF 请求 69 次，阈值 80）。人工观感验收无独立记录，按 acceptance AC-08 条目与全绿 E2E 推断守恒——此为推断而非观测，属如实记录的残余缺口。
- SOLUTION 对照: SOLUTION 不承载条纹滚动实现机制（机制属实现自由，R-01-009/AC-08 行为承诺「持续向右滚动条纹」不变）；本变更为纯机制迁移，无 map 漂移、无 PRD 变化；豁免依据见 RATIONALE C-082 与 CONVENTIONS 验证门禁对应条目。
- commit: 3f12c6e31796049890150c74ae1a442e0344dd46
- review:
  - 审核方: code-review skill（Standards reviewer `44e049fe-d266-4869-a59a-94e111daf1de`、Spec reviewer `b6168a5d-d1e0-42ec-b6b3-192887e3a058`，双轴并行独立）
  - 目的理解: 在不改变 R-01-009/AC-08「持续向右滚动条纹」可观察行为与 reduced-motion 行为的前提下，把 dap-stripes 从不可合成的 background-position 逐帧重绘改为 transform 合成器驱动载体，消除移动端与宿主流式重绘叠加的逐帧重绘源（T-127 调研确认的剩余项）；约束为视觉等价、无 map 漂移、断言迁移锚定 AC-08。
  - 执行方式: code-review skill 双轴并行独立 reviewer；评审基线 `git diff c1714c3...3f12c6e`；修复处置复审范围含 commit 622d2c3（C-082 豁免决策）与拟议终态文本。
  - 问题与修复: ① Standards 硬违规（性能优化无 PRD 承诺、无量化基线，违反 AGENTS.md 性能优化入口规则）→ 经东家确认（2026-09-22）以 RATIONALE C-082 豁免留痕处置（commit 622d2c3）：达标类性能收敛按 map 不变短路，量化守恒由 mobile-thermal rAF 阈值门禁承载，CONVENTIONS 同步落过程条目；两轴复审确认闭环。② 视觉等价两处现场偏差（方向、周期）→ 不改史，在终态如实记录 supersession（T-129 校正），终态 commit 取 3f12c6e。③ E2E/人工验收证据缺口 → 以当前 HEAD 全量 verify（19 spec 全绿）为新鲜守恒回归，现场证据位置如实注明，人工观感验收标注为推断。④ 判断性说明（无代码修复）：单提交搭车 T-127 遗留 TODO 登记（Divergent Change，轻）；性能优化使用 🐛 修复类型（格式合规，类型选择偏 🐛，后续此类宜用 ✨/♻️）。
  - 复审结论: 双轴复审通过，无「残余需处理」项。残余风险与测试缺口：人工观感验收为推断而非实测（staging 环境无真实移动设备，观感对照依赖 E2E 像素/行为断言与东家日常使用）；`scripts/check.mjs:4359` 机制断言硬绑定具体 keyframes 数值，后续调参须同步（T-129 已同步无残留）；3f12c6e 提交正文中周期等价论断不实（不可改史，已在本终态注明，防 git blame 反查误导）。
