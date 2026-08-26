---
doc-type: task
mutation: lifecycle
id: T-067
---

# T-067 回到顶部按钮图标化与右下角定位

状态: completed
关联: R-01-018 / 窗格渲染器
风险等级: standard

## 背景与目标

东家变更 R-01-018 呈现：按钮改为纯图标（无文字）、定位于窗格右下角（不居中）、不透明底色。行为语义（阈值显隐、激活回顶、reduced-motion、窄条/移动端）不变。

## 差距评估

- 现状：`.dap-top` 为底部居中文字胶囊（`left:50%; transform:translateX(-50%)`），底色为 `color-mix(currentColor 10%)` 半透明，文案「↑ 回到顶部」。
- 需改：骨架去文字、加 `aria-label`/`title`；JS 侧注入向上箭头 SVG 图标（复用 `createInlineIcon` 工厂，canonical 图标集无现成箭头，自绘 Lucide arrow-up 几何描边路径）；CSS 改右下角定位 + 圆形 28px 盒 + 不透明底色（深浅主题）。

## 收敛方案

- 骨架：`<button class="dap-top" type="button" aria-label="回到顶部" title="回到顶部" hidden></button>`；`ensurePane` 创建后 `append(createTopIcon())`。
- 图标：`createTopIcon()` 经 `createInlineIcon` 产出 14px 向上箭头（14 盒描边 1.5px 圆角线帽，几何改编自 Lucide arrow-up——留白 24 盒被 R-01-012/AC-11 守卫全局禁用；`aria-hidden` 由工厂保证）。
- CSS：`bottom:12px; right:12px`（去 left/transform），28px 圆形盒 flex 居中图标；深色不透明底 `#1d1f25` + 细描边，浅色覆盖块取 `--dsw-alias-bg-layer-2`/`--dsw-alias-border-l2`。
- 行为代码（syncTopBtn/onTopClick/阈值/清理）不变。

## 测试计划

- `scripts/check.mjs`：更新 R-01-018 断言——图标按钮骨架（无文字、aria-label）、右下角定位、不透明底色双主题、图标注入；保留行为断言。
- `scripts/acceptance.mjs`：更新 R-01-018 人工验收步骤（图标/右下角/不透明）。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`。
- 独立 Standards/Spec review。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：右下角图标按钮，激活回顶 | `scripts/acceptance.mjs#R-01-018`、`src/client.mjs::bindPaneControls` |
| 异常 | 适用：reduced-motion 直接定位（行为不变，回归） | `scripts/check.mjs#R-01-018/AC-02`、`src/client.mjs::bindPaneControls` |
| 边界配置 | 适用：深浅主题底色均不透明；窄条隐藏、移动端抽屉适用不变 | `scripts/check.mjs#R-01-018/AC-05`、`src/client.mjs::CSS` |
| 副作用 | 适用：可访问名称保留（无文字不失可访问性）；监听清理不变 | `scripts/check.mjs#R-01-018/AC-05`、`src/client.mjs::ensurePane` |

## 终态与证据

- 实现: `src/client.mjs` 骨架按钮去文字、补 `aria-label`/`title`；新增 `createTopIcon()`（14 盒 1.5px 描边向上箭头，改编自 ISC 许可 Lucide arrow-up，避让 R-01-012/AC-11 的 24 盒守卫）并在 `ensurePane` 创建时注入；`.dap-top` 改右下角 28px 圆形盒、不透明底色（深色 `#1d1f25`、浅色外壳 layer-2/border-l2 别名含 hover 覆盖），显式补 `[hidden]` 隐藏规则。行为代码不变。`.dsh-plugin/client.js` 已重建。
- 测试: `node scripts/check.mjs` 通过（R-01-018 断言更新为图标骨架/图标注入/右下角定位/不透明双主题/hidden 规则，行为断言原样保留，锚定 R-01-018/AC-01～AC-05 与 R-02-003/AC-02）；`pnpm build:client && pnpm check` 通过；`python3 tools/agentmap_lint.py --report` 通过（test-anchored=117/117）。`scripts/acceptance.mjs` R-01-018 步骤更新为图标/右下角/不透明验收，真实呈现仍需人工 GUI 验收。
- DESIGN 对照: PRD R-01-018 修订 AC-01 并新增 AC-05（G-3 / 窗格渲染器），DESIGN「窗格渲染器」回到顶部条目同步为右下角图标按钮与不透明底色描述，与实现一致。
- commit: 0a5dcbdc0803c9b24a83a316718c97a073c7c6f5
- 编号说明: 本任务以 T-066 立项开发；集成前 main 已被其它 worktree 推进并占用 T-066（进度条全程移动条纹），按未发布冲突规则 rebase 到最新 main 并重排为 T-067（文件名、frontmatter 与提交内引用同步）。
- review:
  - 审核方: Standards 子代理 `909b016b-9af5-470c-8d49-251e46d8033f`；Spec 子代理 `c643989f-db63-4013-a354-0a0c3f12337f`。
  - 目的理解: 变更 R-01-018 呈现——回到顶部按钮改右下角纯图标（无文字、aria-label 可访问名称、createTopIcon 注入）、不透明双主题底色；阈值显隐/回顶/reduced-motion/窄条隐藏/监听清理行为不回归；测试锚定 AC-ID。
  - 执行方式: `code-review` skill；固定基线 `main`（a794d62736efa8be22f2e606a9b44a728e6bcdc2），范围为 `git diff main...HEAD` 的 T-067 工作单元；Standards/Spec 双轴并行审核。
  - 问题与修复: 双轴共同发现 1 处——task 收敛方案图标参数（viewBox 24 / stroke 2px）与最终实现（14 盒 / 1.5px）漂移；修复为关闭前对齐收敛方案文案（本提交）。Spec 另记 1 条轻微 scope 项 `title="回到顶部"`（AC-05 仅要求可访问名称），判定无害保留。Standards 另 1 条 judgement call（深浅底色取值不对称）仓库有先例，按审核方「不建议改」结论保留。
  - 复审结论: Standards 无硬性违规、通过；Spec 核验 hidden 特异性/浅色覆盖/断言逐字一致均通过，finding 已修复，双轴闭环。
