---
name: dap-performance
description: 改渲染、折叠、派生或时钟路径，或要做性能 A/B 与预算判定时读
---

# dap-performance

本技能管静态功耗、渲染节流、性能 A/B 与只减预算。优化只做达标类：不改可观察行为。

- 静默契约：`e2e/specs/idle-quiescence.mjs` 要求空闲 5s 内 rAF 请求 <=25 次。
- 移动契约：`e2e/specs/mobile-thermal.mjs` 要求抽屉关闭时 `content-visibility: hidden` 且 5s 内 <=80 次。
- 两条阈值只许变严；放宽等于取消契约。
- 渲染入口按签名去重并用 `SYNC_MIN_INTERVAL_MS` 合帧节流，别绕开闸口直接画。
- 时钟只在存在运行中会话时走；低档位不为任务时长逐秒重绘。
- 折叠/派生改动跑 `pnpm perf:ab`：默认只报告，加 --check 才断言 1.2 倍折叠工作量比值。
- `pnpm perf:ab` 不进门禁（绝对 CPU 随机器漂移）；发布前自检用它，结果写进 PR 正文。
- 纯函数基准：`node scripts/bench.mjs [iterations]`，对比 steady 与 push 两工况单次渲染成本。
- 只减预算（bundle 字节、perf 预算）只能变小；变大要在 PR 正文说明并获属主同意。
- 一次只改一个变量，同环境同负载对照；不用肉眼替代测量。
- 移动端发热先确认休眠与节流未被破坏，再谈新机制。
