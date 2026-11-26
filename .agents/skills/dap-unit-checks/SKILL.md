---
name: dap-unit-checks
description: 要加或改 scripts/check.mjs 的单元与契约断言时读：分节与断言约定
---

# dap-unit-checks

本技能管 `scripts/check.mjs` 的组织方式与断言写法。它是单元与契约检查的唯一载体。

- 入口：`node scripts/check.mjs`（等同 `pnpm check` 与 `node tools/xtask.mjs unit`）。
- 结构：用 // ---- <主题> ---- 形式的分节注释，一节一个断言主题；新检查加进对应主题节，不另开文件。
- 断言用 node:assert/strict 的 `assert`，每条必须带中文消息，写清可观察语义。
- 被测对象从 `src/core.mjs`、`src/navigation.mjs` 导入；不在测试里复制实现。
- 契约断言也在这里：bundle 产物形状、e2e helper 源码规则、CI 触发块、mock 剧本行为。
- 失败消息写"期望 vs 实际"的判据，不写"应该通过"。
- 计数断言（`assert.equal(x.length, N)`）改 N 前先确认语义变了；只为变绿改数字即违规。
- 不靠 try/catch 吞失败；断言失败必须让进程非零退出。
- 改 `src/` 纯函数签名会连带改这里的导入，同一次提交内对齐。
- 末尾打印 `check: all assertions passed`，CI 与钩子按退出码裁决。
- 浏览器行为不进本文件，去 `e2e/specs/`，见 `dap-e2e`。
