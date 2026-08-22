---
doc-type: task
id: T-020
mutation: lifecycle
---

# T-020 历史卡消息预览行角色图标

风险等级: standard
状态: active

## 背景与目标

- 背景: TODO 条目「在历史会话的用户消息和 agent 回复前添加合适的图标，以便区分消息角色」升级为需求；R-01-013 演进追加 AC-07/AC-08（东家确认 PRD 演进，并拍板图标常驻策略）。
- 目标: 最近卡第三行（最近用户消息首行）文本前常驻人物图标、第四行（最近 agent reply 首行）文本前常驻 sparkle 图标，图标语义与工作项时间线的用户/assistant 一致；文本缺失时仅显示图标。
- 非目标: 不改变预览取数（messagePreviews/深翻页）与加载状态模型；不调整两行文本的字号、颜色与截断规则。

## 差距评估

- 现状基线:
  - 最近卡两条 `.dap-history-line` 为纯文本行；`data-role` 在每次渲染时写入。
  - 加载态 `line.replaceChildren(spinner)`、离开加载态 `restoreTextField(line, text)`，均直接作用于行元素。
  - 人物/sparkle 图标工厂（`createUserIcon`/`createSparkleIcon`）已存在，供工作项时间线使用。
- 目标差距:
  - 骨架改为「角色图标 + 文本」双段结构，`data-role` 转为骨架静态写入。
  - 渲染写回目标从行元素改为文本段，图标不被文本/spinner 覆盖。
  - CSS 行改为 flex 布局，截断规则下放到文本段。

## 收敛方案

1. `src/client.mjs`:
   - `cardChildren("recent")`：两条 history line 各为 `图标段(.dap-history-icon) + 文本段(.dap-history-text)`，静态 `data-role`，图标分别取 `createUserIcon()` / `createSparkleIcon()`。
   - recent 渲染分支：加载 spinner 与文本写回均作用于文本段（`line.lastElementChild`），删除每渲染写入 `data-role` 的 `roles` 数组。
   - CSS：`.dap-history-line` 改 flex（gap 4px、垂直居中）；新增 `.dap-history-icon`（10px）与 `.dap-history-text`（min-width:0 + ellipsis）规则；spinner 既有尺寸规则不变。
2. `scripts/check.mjs`：bundle 契约断言锚定 R-01-013/AC-07、AC-08。
3. `scripts/acceptance.mjs`：更新最近卡人工验收步骤，纳入两行常驻角色图标。
4. `pnpm build:client` 同步 `.dsh-plugin/client.js`。

## 测试计划

- `scripts/check.mjs` 增补：
  - R-01-013/AC-07、AC-08: bundle 断言骨架静态 `data-role`、`.dap-history-icon` 图标段与 `.dap-history-text` 独立文本段存在。
- `scripts/acceptance.mjs` 人工步骤：最近卡两行预览文本前分别常驻人物/sparkle 图标；无内容行仅显示图标；加载中 spinner 出现在图标之后。
- `pnpm build:client && pnpm check`；`python3 tools/agentmap_lint.py --report`；`git diff --check`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：两行预览带常驻角色图标且文本/截断行为不变 | `scripts/check.mjs#R-01-013/AC-07`、`scripts/check.mjs#R-01-013/AC-08`、`src/client.mjs::cardChildren` |
| 异常 | 适用：加载失败降级为空字段时仅显示图标，不报错 | `scripts/acceptance.mjs#R-01-013/AC-07`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：文本缺失/加载中/长文本截断三种边界 | `scripts/acceptance.mjs#R-01-013/AC-08`、`src/client.mjs::cardChildren` |
| 副作用 | 适用：签名去重与 DOM 复用语义不变（写回目标改为文本段，仍走相等守卫） | `scripts/check.mjs#R-01-013/AC-07`、`src/client.mjs::restoreTextField` |

## 终态与证据

（待填写）
