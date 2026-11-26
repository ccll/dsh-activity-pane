---
name: dap-e2e
description: 要加或改浏览器 e2e spec、跑 e2e、或 e2e 失败需要定位时读
---

# dap-e2e

本技能管 27 个 spec 的放置、运行器契约与失败定位纪律。

- spec 放 e2e/specs/ 下的区域文件，一个文件一个场景；不新建 per-bug 文件。
- 运行全量：`pnpm test:e2e`（固定顺序、单并发）；单跑 `node e2e/run.mjs mobile-drawer`。
- 首次装浏览器：PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec playwright install chromium-headless-shell。
- 环境由 `e2e/boot.mjs` 起：mock LLM + 临时 `$DSH_HOME` + 随机端口 `dsh web --no-open`。
- `dsh web` 必须带 --no-open：少了会令系统浏览器累积标签，后续 headless 渲染崩溃成白屏。
- Chromium 的 --disable-dev-shm-usage 与 --js-flags=--max-old-space-size=512 不要删；page crash 必须记录。
- 每 spec 独立 Chromium、context 与单个页面连接世代；spec 默认导出 `async ({ browser, page, url, mock, assert })`。
- 可选具名导出 `mobileShell = true` 与 `contextOptions`，示例见 `e2e/specs/mobile-shell.mjs`。
- 打开页面只用 `e2e/helpers.mjs` 的 `openApp`（单次 goto）；不许 reload 重试。
- 等待判据用身份（会话标题、状态、id），不用下标加几何可见；相位敏感探针用有界重试建前置条件。
- 失败截图落 e2e 目录的 fail-*.png，出现即失败信号；CI 失败时上传为 artifact。
- 先分白屏与断言：整页白屏按 renderer 崩溃/内存处理，先排环境再改判据。
- 不同 spec 轮流失败、单跑均绿时按环境资源耗尽处理；先回收 Chrome 再复核内存与 renderer 计数。
- 环境性缺席（移动壳层装不上）用 `E2E_SKIP` 显式记账，不静默通过。
- 不许放宽期望、忽略用例或改写测试输入来变绿；判据错先改判据。
