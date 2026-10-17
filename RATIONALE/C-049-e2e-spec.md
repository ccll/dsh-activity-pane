---
doc-type: rationale
mutation: append-only
id: C-049
owner: agent
---

# C-049 E2E 最多并行两条独立 spec

日期: 2026-08-28

#### 上下文
C-047 恢复每 spec 独立 Chromium 后，coherent rc.7 DSH 上 10 条 spec 首轮全部通过且无 sessions 恢复，但顺序执行墙钟约 226 秒；各 spec 已拥有独立 Chromium、context、dsh web、`$DSH_HOME` 与 mock，不共享可变测试状态。单条峰值内存约 272MB，GitHub hosted runner 可承载两套并行环境。

#### 决策
- runner 使用固定上限 2 的 worker pool 并行执行独立 spec；单 spec 内部步骤仍保持顺序。
- 不提供可配置并发度：门禁只维护一个经验证的资源/速度平衡点，避免本地与 CI 口径漂移。
- 失败与恢复按 spec 独立计数，全部 worker 结束后统一返回套件结果；任一普通断言失败仍使门禁失败。

#### 被否方案及原因
- 继续完全顺序：稳定但约 226 秒，未达到快速门禁目标，而现有隔离边界已允许安全并发。
- 不限并发一次启动全部 spec：GitHub runner 的 CPU、内存与进程调度会放大宿主冷启动竞态，稳定性风险高。
- 动态按 CPU 数决定并发度：本地与 CI 会得到不同执行压力，复现困难；固定 2 更可预测。

#### 影响面
R-01-002、R-01-008、R-02-002 / E2E 验证基建、验证门禁
