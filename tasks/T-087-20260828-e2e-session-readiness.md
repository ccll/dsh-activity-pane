---
doc-type: task
mutation: lifecycle
id: T-087
---

# T-087 E2E sessions 首次就绪等待根因修复

状态: active
关联: C-047、C-049、C-051、C-052、C-053、C-054、C-055、C-056、C-057 → E2E 验证基建
风险等级: standard

## 背景与目标

首次 GitHub hosted 完整 E2E 在固定 2 worker 下运行 468.179s，10 个 spec 中 8 个最终失败并触发 16 次换环境恢复；失败均为 `E2E_PANE_STALL`。本地 pre-push 同版本可 10/10 通过，但近期两轮分别出现 3 次恢复，说明现有 readiness 策略在较慢执行环境中会放大 sessions 首次拉取延迟。

## 差距评估

- `openApp` 给每个页面连接世代仅 6s，未就绪便 reload，最多 5 代；而 DSH bounded unary RPC 的默认 timeout 是 30s。
- hosted 日志显示正常 spec 也可用 24～30s 才就绪，现有 6s 阈值不能区分“较慢但正常”与“永久停滞”。
- 连续 reload 会中断尚可完成的 `sessions.list`，重开 SSE 与 unary 请求；总预算虽约 30s，却从不给同一请求完整 30s，形成自诱导重试风暴。
- C-051 单一 32s 等待实测仍有 4/10 spec 失败、337.947s、11 次换环境恢复：rc.7 `refreshList` 首败后不自重试，且 plugin list 投影丢弃 state/error，等待本身无法解除永久 pending。
- C-052 首代 32s + 一次 12s reload 在双 worker 下仍有 2/10 spec 失败、297.907s、4 次恢复，证明资源竞争仍会让两代均失败；既有顺序基线为 10/10、226.119s、0 恢复。
- C-053 顺序执行一轮 10/10、183.589s、0 恢复，但另一次清理陈旧测试进程后的纯净顺序轮仍 1/10 失败、463.537s、4 恢复；成功 spec 可达 40～54s，证明第二代 12s 仍低于真实 unary 边界。
- C-054 两代各 32s 实测仍 1/10 失败、798.176s、7 次恢复；等待不能修复已失败且不自愈的 manager。三套独立 host 直接 `session.list` probe 均在 24～26ms 成功，排除服务端 API 冷就绪，根因收敛到 browser runtime 启动期一次性 pull。
- C-055 顺序 + 五个 6s 世代在本地 Node 24.16.0 两轮均 10/10、168.948s/186.818s、0 fresh recovery；同提交 hosted Node 22.23.2 却 0/10、753.617s、10 次恢复，因此下一单变量实验按 C-056 对齐 Node 24.16.0。
- runner 原有最多 3 个全新 Chromium + dsh web 环境；多冷环境恢复与双宿主并发均过量，但顺序环境内短连接世代仍是 rc.7 必需兼容路径。

## 收敛方案

- 按 C-053 固定顺序执行，使本地与 hosted 使用同一单宿主负载模型。
- 每环境允许最多五个 6s 页面连接世代；rc.7 首败不自重试时由新 SessionManager 重拉，仍失败才抛 `ERR_PANE_STALL`。
- runner 从最多 3 个环境收紧为 2 个环境，hosted job timeout 调整为 30 分钟。
- 增加 helper/runner 源契约，钉住“顺序 + 五个短世代 + 最多一次 fresh environment”的组合；不修改产品行为或放宽普通 spec 断言。

## 测试计划

- `pnpm verify:fast` 验证 readiness 契约与 128/128 AC 锚定。
- 本地连续 3 轮 `pnpm verify`，记录恢复次数与墙钟。
- push 后观察 GitHub hosted `pnpm verify`，要求 10/10 spec 通过并记录 readiness/恢复数据。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：rc.7 首败后由下一页面连接世代的新 SessionManager 重拉，连接稳定即继续 spec | `e2e/helpers.mjs::openApp` + hosted run |
| 异常 | 适用：五个 6s 世代后仍 loading 或列表加载失败进入一次 fresh-environment recovery | `e2e/helpers.mjs::ERR_PANE_STALL` |
| 边界配置 | 适用：每个环境最多五个页面连接世代；runner 最多恢复一次 | `scripts/check.mjs::e2eHelperSource`、`e2e/run.mjs::runSpec` |
| 副作用 | 适用：普通断言失败仍不重试，不改变产品 bundle | `e2e/run.mjs::worker` |
| 性能 | 适用：固定顺序消除双宿主竞争，单环境 readiness 最多 30s；hosted 以 30 分钟封顶 | `package.json::scripts`、`.github/workflows/ci.yml::verify` |
| 并发 | 适用：固定顺序执行，使本地/hosted 同时只有一套 dsh web + Chromium | `e2e/run.mjs::MAX_CONCURRENCY` |
| 恢复 | 适用：保留五个同环境短世代与一次全新 Chromium + dsh web 恢复 | `e2e/helpers.mjs::openApp`、`e2e/run.mjs::runSpec` |
| 可观测性 | 适用：suite 汇总继续打印 fresh-environment sessions 恢复次数 | `e2e/run.mjs::stallRecoveries` |

## 终态与证据

- 实现: 待填写
- 测试: 待填写
- DESIGN 对照: 待填写
- commit: 待填写
- review:
  - 审核方: 待填写
  - 目的理解: 待填写
  - 执行方式: 待填写
  - 问题与修复: 待填写
  - 复审结论: 待填写
