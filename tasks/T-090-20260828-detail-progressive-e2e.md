---
doc-type: task
id: T-090
mutation: lifecycle
---

# T-090 卡片 detail 渐进就绪浏览器证据

风险等级: standard
状态: completed

## 背景与目标

- 背景: R-01-014/AC-03 已由 core/bundle contract 证明 detail promise 逐个完成逐个 `queueSync`，但浏览器层仍只有列表 pending→ready 证据；T-089 已明确移除对 AC-03 的过度锚定。
- 目标: 在同一页面、同一连接世代内，以真实 slow 会话证明卡片标题与时间线先呈现，model detail 随后就地补齐；不增加 reload、retry、跨 spec 共享或通用 detail mock 框架。
- 非目标: 不覆盖 history/session.open 的所有组合；不改变 load plan、并发池、签名或生产默认时序；不修改 PRD。

## 差距评估

- `src/client.mjs` 已有 model/history 独立 inflight 记账及逐 promise 重绘，缺确定性 browser 中间帧。
- 当前会话的 `modelDirectories` store 可同步抢先填入 model，单纯延迟 `sessions.models` RPC 不足以稳定制造窗口。
- `e2e/specs/loading-ready.mjs` 已有 init-script MutationObserver 和显式 fragment 接缝，可复用而不新增一套隔离环境。

## 收敛方案

1. 在现有 E2E fragment 配置旁增加上限 1s 的 `dap-e2e-model-delay`；默认值 0。
2. 仅 fixture 模式跳过 model directory 初值订阅，在正式 `sessions.models` API 调用前延迟；不伪造 response。
3. 扩展 `loading-ready.mjs`：列表 ready 后发送真实 `e2e:slow` 会话，记录“标题/用户时间线已出现而 model 尚未出现”及“model/reasoning 随后出现”的有序证据。
4. `scripts/check.mjs` 增加接缝边界 contract；重建 client bundle并同步 DESIGN/acceptance 映射。

实现进度: 已按上述边界落地 model delay、同页 MutationObserver 两阶段断言及 DESIGN/acceptance 对照；Standards 初审指出实现字符串断言过度脆弱及 delay timer 卸载未清理，首轮修复收敛为 `delayedModelCall` 边界、waiter 清理与 inflight 下限保护；复审补充同步 `api.models` 抛错会逃出 timer，已改为 Promise 链吸收并沿用既有 `.catch` 降级，待最终复审。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-014/AC-03 | 浏览器层补齐 detail 渐进中间帧，需求不变 | E2E | update | 扩展 e2e/specs/loading-ready.mjs，证明真实卡片先呈现、model 后补齐 |
| DESIGN | E2E 验证基建新增 model delay 确定性接缝 | E2E | update | 仅显式 fragment 启用、默认零分支、正式 native models API 不变 |

## 测试计划

- `pnpm check`：fragment、上限、modelDirectories 绕开、RPC 前延迟与逐 promise 重绘 contract。
- `node e2e/run.mjs loading-ready`：同页列表 loading→ready 与 detail 渐进两阶段通过。
- `pnpm verify`、staged bundle 门禁、`git diff --check` 全绿。
- 固定基线独立 `code-review` 双轴审核，findings 由原 reviewer 复审。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：已有卡片内容先呈现，model 后续补齐 | `src/client.mjs::loadNativeDetails`、`e2e/specs/loading-ready.mjs::loadingReady` |
| 异常 | 适用：fixture 不得伪造 model response 或吞 RPC 失败 | `src/client.mjs::api.models`、`scripts/check.mjs::clientSource` |
| 边界配置 | 适用：fragment 缺失/非法/过大时分别为 0/0/上限 1s | `src/client.mjs::requestedListDelay`、`scripts/check.mjs::clientSource` |
| 副作用 | 适用：默认 URL、load plan、并发池、签名和零重试模型保持不变 | `src/client.mjs::detailLoadPlan`、`e2e/run.mjs::MAX_CONCURRENCY` |
| 性能 | 适用：复用现有 loading-ready spec，不新增隔离环境；fixture 最多增加 1s | `e2e/specs/loading-ready.mjs::loadingReady` |
| 兼容性 | 适用：生产 bundle 包含零默认测试接缝，不新增依赖 | `scripts/build-client.mjs::export async function build` |

## 终态与证据

- 实现: `6ff8756` 在现有 `loading-ready.mjs` 增加 R-01-014/AC-03 同页两阶段证据，并以显式 `dap-e2e-model-delay` 延迟正式 native models RPC；`94eae7a` 增加可结清 waiter、卸载 timer 清理与 inflight 下限保护；`8e30798` 保留同步 RPC throw 进入既有 Promise catch 的失败语义。默认 URL、load plan、并发池、签名与零重试模型不变。
- 测试: `node e2e/run.mjs loading-ready` 在最终实现上通过（5.651s），证明真实 slow 卡标题/用户时间线先呈现、model/reasoning 后补齐；`pnpm check`、`pnpm lint`、staged bundle 门禁与 `git diff --check` 通过，E2E 锚定由 62 提升到 63。实现首版完整 `pnpm verify` 12/12 通过（132.342s）；最终 cleanup 修复后的完整运行 11/12，唯一失败为未进入本 spec 的 `desktop-layout` 首页 readiness 6s 超时，随后独立诊断 `desktop-layout` 通过（7.333s），作为后续稳定性 task 的基线线索而不由本 task 加 retry。
- DESIGN 对照: `DESIGN.md#E2E 验证基建` 已登记 `dap-e2e-model-delay` 仅显式 fragment 启用、上限 1s、跳过 model directory 抢先初值但不伪造 native response；实现复用同一页面连接世代与现有 loading-ready spec，无 reload、跨 spec 共享或通用 fixture registry。
- commit: 6ff8756 94eae7a 8e30798
- review:
  - 审核方: Standards reviewer `2a4f24d7-9a5c-412e-9db8-1fd0c672ae98`；Spec reviewer `741515e3-a294-478c-a8ba-b6969a03793a`
  - 目的理解: 审核方先确认 T-090 只需证明同页真实卡片可用内容先呈现、model detail 后补齐；接缝默认零分支、正式 native models response 不伪造，且不得改变 load plan、零重试和隔离模型。
  - 执行方式: `code-review` skill，固定基线 `459b5fa...HEAD`；Standards 与 Spec 双轴并行，修复均由原 Standards reviewer 复审。
  - 问题与修复: Standards 初审发现完整实现字符串断言脆弱、delay timer 卸载未清理；修复后复审发现 timer 内同步 RPC throw 会逃出 Promise。分别改为 seam 调用/清理边界 contract、可结清 waiters + inflight 下限，以及 `Promise.resolve().then(call)` 同化同步异常。Spec 初审直接通过，确认观察范围限定 activity pane 同一卡片且 AC-03 覆盖准确。
  - 复审结论: Standards 最终无 hard/judgement/Fowler finding；Spec 无缺失、行为错误或 scope creep；双轴通过。
