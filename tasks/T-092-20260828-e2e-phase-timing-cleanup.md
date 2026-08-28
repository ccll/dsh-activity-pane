---
doc-type: task
id: T-092
mutation: lifecycle
---

# T-092 E2E 阶段计时与 cleanup timer 收敛

风险等级: standard
状态: completed

## 背景与目标

- 背景: 当前顺序 E2E 约 130～135s，但 runner 只输出 spec 总耗时，无法区分 boot、浏览器行为与 cleanup。单独测量 `loading-ready` 时 suite 报告 5.847s，而进程 wall 为 11.07s；根因是 `boot.mjs` 的 `Promise.race` 在 web 正常退出后仍遗留 5s SIGKILL timer，拖住 Node 进程。
- 目标: 清除正常 cleanup 的遗留 timer，并让每个 spec 输出 boot/spec/cleanup 阶段耗时；以同一 focused spec A/B 证明 wall 与 suite 差值收敛。
- 非目标: 不缩短断言 timeout、不改 sendHero 行为、不增加并发/retry/reload、不复用 dsh web 或 Chromium；不基于猜测优化其它 spec。

## 差距评估

- `bootE2e().timings` 已记录 mock/settings/plugin/webReady/total，但 runner 未输出。
- 实现进度: 首轮取消 normal cleanup 的 losing escalation timer 后 focused wall 从 11.07s 降到 8.85s；增加 slow disconnect 终止后 runner total 6.340s、wall 6.80s。双轴初审继续发现 cleanup error 被吞及最终 slow 收尾前缺断开复查，已改为显式 `settleCleanupSteps` 错误裁决、最终 guard，并以行为测试验证单步 cleanup 失败仍释放后续资源及断开后 chunk 计数稳定，待复审。
- cleanup 的 5s escalation timer 无取消句柄；正常 web exit 赢得 race 后 timer 仍存活。
- 多次 hosted/main push 已在 2m30～2m48 job 内绿色，当前没有证据支持改变隔离或 timeout 策略。

## 收敛方案

1. `boot.mjs` 为 SIGKILL escalation timer 保存句柄，并在 race 结束后 `clearTimeout`。
2. `run.mjs` 将 PASS 日志拆出 boot/browser/spec/cleanup/total；FAIL 仍即时输出错误、截图和 web stderr，最终 cleanup 不吞结果。
3. `scripts/check.mjs` 增加 timer 取消和阶段日志 contract；DESIGN 登记可观测性与无遗留 timer 约束。
4. 用 `/usr/bin/time node e2e/run.mjs loading-ready` 比较 A/B，再跑完整 `pnpm verify`。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | E2E runner 增加阶段耗时并取消 cleanup 遗留 timer | UNIT/E2E | update | 更新 boot/runner contract、focused wall 基线及完整套件证据 |

## 测试计划

- A 基线：loading-ready suite 5.847s、wall 11.07s，差约 5.22s。
- B 验证：同命令 wall 与 runner total 差值应低于 1s，且输出 boot/spec/cleanup。
- `pnpm check`、`pnpm verify`、staged/pre-push、`git diff --check`。
- 独立 `code-review` 双轴审核并复审 findings。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：正常 web exit 后无遗留 5s timer，阶段耗时可见 | `e2e/boot.mjs::cleanup`、`e2e/run.mjs::runSpec` |
| 异常 | 适用：5s 后仍升级 SIGKILL，spec 失败仍截图并返回非零 | `e2e/boot.mjs::killWebGroup`、`e2e/run.mjs::captureFailure` |
| 边界配置 | 适用：只改变日志和正常 timer 生命周期，不改变 timeout/隔离 | `e2e/boot.mjs::BOOT_TIMEOUT_MS`、`e2e/run.mjs::MAX_CONCURRENCY` |
| 副作用 | 适用：cleanup 始终关闭 context/browser/web/mock/home | `e2e/run.mjs::finally`、`e2e/boot.mjs::cleanup` |
| 性能 | 适用：focused A/B 使用进程 wall 与 runner total 比较 | `e2e/run.mjs::suiteStart` |
| 可观测性 | 适用：每 spec 输出 boot/browser/spec/cleanup/total | `e2e/boot.mjs::timings`、`e2e/boot.mjs::formatPassTimings` |

## 终态与证据

- 实现: `91ee817` 取消正常 web exit 后的 losing SIGKILL timer、在 slow response destroyed 后停止剩余 chunks，并输出 boot/browser/spec/cleanup/total；`80747d5` 让 context/browser/environment cleanup 逐项执行且错误显式使 spec 失败，补最终 slow 收尾 guard 与行为测试。
- 测试: focused A 基线 `loading-ready` runner 5.847s、wall 11.07s（差 5.22s）；仅取消 escalation timer 后 wall 8.85s；最终实现 runner 6.571s、wall 7.11s（差 0.54s），消除约 4.68s 进程尾部空等。`pnpm verify` 最终 12/12 通过，runner suite 135.511s；PASS 日志已分列每 spec 阶段。`pnpm check` 的直接行为测试证明 cleanup 首步失败后仍执行第二步且错误返回、AbortController 断流后 slow chunk 少于 24 且 350ms 后计数稳定；lint、staged bundle、`git diff --check` 通过。
- DESIGN 对照: `DESIGN.md#E2E 验证基建` 已同步阶段可观测性、5s SIGKILL 仅在 SIGTERM 未收敛时升级、slow destroyed 停止剩余 timer/收尾、cleanup 错误显式裁决；MAX_CONCURRENCY=1、独立环境/Chromium/context、6s readiness、零 retry/reload 与 sendHero 均未改变。
- commit: 91ee817 80747d5
- review:
  - 审核方: Standards reviewer `dd1ce0b9-204a-474f-ab46-e48c66f58a85`；Spec reviewer `3198a5cb-a212-4d4d-ac7b-df0b151a70d1`
  - 目的理解: 两位 reviewer 先确认 T-092 只修有 A/B 证据的 E2E 进程尾部 timer，并增加阶段耗时；不得改变 timeout、隔离、并发、sendHero 或零重试策略。
  - 执行方式: `code-review` skill，固定基线 `21a57ac...HEAD`；Standards 与 Spec 双轴并行，修复后由同一 reviewer 复审。
  - 问题与修复: Standards 初审发现 cleanup error 被吞会误报 PASS、源码 includes 不能证明行为；Spec 发现最后一次 slow sleep 后断开仍可能写 stop/usage/DONE。修复为 `settleCleanupSteps` 聚合错误并继续释放、`formatPassTimings` 直接行为断言、AbortController + streamLog 断流行为测试，以及最终收尾前 destroyed guard。
  - 复审结论: Standards 与 Spec 原 findings 全部关闭，无新增问题；focused wall-total 差值低于 1s，完整 12/12 通过。
