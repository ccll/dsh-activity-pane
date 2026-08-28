---
doc-type: task
id: T-090
mutation: lifecycle
---

# T-090 卡片 detail 渐进就绪浏览器证据

风险等级: standard
状态: active

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

实现进度: 已按上述边界落地 model delay、同页 MutationObserver 两阶段断言及 DESIGN/acceptance 对照；Standards 初审指出实现字符串断言过度脆弱及 delay timer 卸载未清理，已收敛为 `delayedModelCall` 边界、waiter 清理与 inflight 下限保护，待原 reviewer 复审。

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

待实现完成后填写。
