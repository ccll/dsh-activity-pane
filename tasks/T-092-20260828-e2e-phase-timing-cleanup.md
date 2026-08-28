---
doc-type: task
id: T-092
mutation: lifecycle
---

# T-092 E2E 阶段计时与 cleanup timer 收敛

风险等级: standard
状态: active

## 背景与目标

- 背景: 当前顺序 E2E 约 130～135s，但 runner 只输出 spec 总耗时，无法区分 boot、浏览器行为与 cleanup。单独测量 `loading-ready` 时 suite 报告 5.847s，而进程 wall 为 11.07s；根因是 `boot.mjs` 的 `Promise.race` 在 web 正常退出后仍遗留 5s SIGKILL timer，拖住 Node 进程。
- 目标: 清除正常 cleanup 的遗留 timer，并让每个 spec 输出 boot/spec/cleanup 阶段耗时；以同一 focused spec A/B 证明 wall 与 suite 差值收敛。
- 非目标: 不缩短断言 timeout、不改 sendHero 行为、不增加并发/retry/reload、不复用 dsh web 或 Chromium；不基于猜测优化其它 spec。

## 差距评估

- `bootE2e().timings` 已记录 mock/settings/plugin/webReady/total，但 runner 未输出。
- cleanup 的 5s escalation timer 无取消句柄；正常 web exit 赢得 race 后 timer 仍存活。
- 多次 hosted/main push 已在 2m30～2m48 job 内绿色，当前没有证据支持改变隔离或 timeout 策略。

## 收敛方案

1. `boot.mjs` 为 SIGKILL escalation timer 保存句柄，并在 race 结束后 `clearTimeout`。
2. `run.mjs` 将 PASS 日志拆出 boot/spec/cleanup/total；FAIL 仍即时输出错误、截图和 web stderr，最终 cleanup 不吞结果。
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
| 可观测性 | 适用：每 spec 输出 boot/spec/cleanup/total | `e2e/boot.mjs::timings`、`e2e/run.mjs::PASS` |

## 终态与证据

待实现完成后填写。
