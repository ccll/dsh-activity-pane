---
doc-type: task
mutation: lifecycle
id: T-087
---

# T-087 E2E sessions 首次就绪等待根因修复

状态: completed
关联: C-047、C-049、C-051、C-052、C-053、C-054、C-055、C-056、C-057、C-058 → E2E 验证基建
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
- upstream staging 已在 `fix/session-list-initial-retry` 形成本地 commit `6686472`：每个 connection generation 只为 pending 初始列表保留一次尾随重试，direct refresh 与公开 list state 不变；manager 50 tests、root typecheck、build、doc-sync 32 gates 与 staged lint 均通过，尚未 fork 或公开 PR。
- patched alpha.1 与本项目 rc.7 E2E boot 不能直接作同构对比：新 runtime 的 token URL 首次 GET 返回 303，跟随且无 cookie jar 时为 401，而 `boot.mjs` 只接受最终 `response.ok`，导致 readiness 60s 超时；该 auth 差异仍使 alpha.1 不能直接替代 rc.7 门禁 runtime。
- C-058 的实时探针推翻了「manager 首拉失败」作为本项目停滞根因的假设：失败页面中 `SessionManager.refreshList()` 在 40～450ms 内成功进入 `phase=ready/state=idle`，活动窗格订阅也收到通知并在 render 中读到 `phase=ready`，但 DOM 仍可冻结 45s。
- 真正根因是 `cardSignature([])` 不含 `listState`：空列表 pending 与 ready 两帧签名相同，早退发生在 `ensureListStatus()` 前，DOM 永久保留「加载中」；reload 只是让新页面首次 render 偶尔赶上 ready。
- `listState` 加入渲染签名后，单页面、6s、零恢复的 `desktop-layout.mjs` 连续 10/10 通过；因此 upstream 有界首拉重试仍可作为独立鲁棒性候选，但不再是本项目收紧恢复预算的前置条件。

## 收敛方案

- 保持 C-053 的固定顺序执行，使本地与 hosted 使用同一单宿主负载模型。
- 把 `listState` 纳入活动窗格渲染签名，在卡集合未变化时仍提交 pending/error → ready 的可观察状态转换。
- 删除 `ERR_PANE_STALL`、五个页面世代与 fresh-environment recovery；每个 spec 只建立一个页面连接世代，6s 未就绪即直接失败。
- 增加 client/helper/runner 源契约，钉住状态签名与零恢复策略；hosted job timeout 保持 30 分钟作为顺序全套上限。

## 测试计划

- `pnpm verify:fast` 验证状态签名、单世代零恢复契约与 128/128 AC 锚定。
- `desktop-layout.mjs` 在单页面 6s 预算下连续 10 轮通过；随后本地连续 3 轮 `pnpm verify`，记录墙钟且不得出现任何 recovery 日志。
- 自动 hosted CI 按 C-057 继续暂停；推送后手工 `workflow_dispatch` 验证同一零恢复门禁，失败不恢复自动触发。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：空列表 pending → ready 时状态签名改变，DOM 从「加载中」即时落到空态并继续 spec | `src/client.mjs::sig`、`e2e/helpers.mjs::openApp` |
| 异常 | 适用：6s 后仍 loading、明确列表失败或普通断言失败均立即失败 | `e2e/helpers.mjs::openApp`、`e2e/run.mjs::runSpec` |
| 边界配置 | 适用：每个 spec 恰好一个页面连接世代、一个隔离环境，不存在 sessions 专用重试 | `scripts/check.mjs::e2eHelperSource`、`e2e/run.mjs::runSpec` |
| 副作用 | 适用：修复只扩展已有渲染签名输入；不主动 refresh、不读取内部 manager、不改变 Host 协议 | `src/client.mjs::cardSignature` |
| 性能 | 适用：删除最多 10 个页面世代的最坏恢复预算；顺序全套仍由 hosted 30 分钟封顶 | `e2e/run.mjs::runSpec`、`.github/workflows/ci.yml::verify` |
| 并发 | 适用：固定顺序执行，使本地/hosted 同时只有一套 dsh web + Chromium | `e2e/run.mjs::MAX_CONCURRENCY` |
| 恢复 | 适用：根因修复后零恢复；同类停滞直接暴露，不再由 reload/fresh environment 掩盖 | `e2e/helpers.mjs::openApp`、`scripts/check.mjs::e2eHelperSource` |
| 可观测性 | 适用：suite 逐 spec 输出 PASS/FAIL 与墙钟；失败保留 screenshot 和 dsh web stderr 尾部 | `e2e/run.mjs::runSpec` |

## 终态与证据

- 实现: 实时 manager/pane 探针证明 DSH list 已 ready，根因改判为活动窗格空卡集合签名未含 `listState`；渲染签名改为 `JSON.stringify([listState, cardSignature(...)])`。删除 `ERR_PANE_STALL`、五页面世代、fresh-environment recovery 与恢复计数；每 spec 单页面 6s，失败即回归。折叠 timeline detail 断言改为等待真实可观察行，发布 bundle 同步。
- 测试: 探针失败样本中 manager 40～450ms ready、pane notify/render phase ready 而 DOM 45s loading；修复后单页面 `desktop-layout.mjs` 连续 10/10。完整 `pnpm verify` 连续三轮 11/11（125.270s、124.241s、131.200s），审核修复后 11/11（124.756s），pre-push 11/11（128.277s）。手工 hosted run `33159348747` 在 commit `663b62a` 上 11/11、107.625s，job 3m3s 成功且无任何 recovery 路径。
- DESIGN 对照: C-058 与 `DESIGN.md#E2E 验证基建` 均描述 listState+cardSignature 结构化签名、每 spec 单页面 6s、零 reload/零换环境；C-053 仅保留固定顺序。`CONVENTIONS.md` 与 runner/helper/check 当前实现一致。自动 hosted 与 Release 仍按 C-057 保持手工，单次 hosted 绿色不改变既有治理决策。
- commit: cb20709 c02f221 663b62a（根因修复与预算删除、审核收口、异步断言与 DESIGN 最终对齐）
- review:
  - 审核方: Standards reviewer `ff31c02a-088c-4c4b-8055-663832cc681d`；Spec reviewer `72724383-7713-425b-8b19-23c2a814392c`
  - 目的理解: 找出用户可见列表长期「加载中」的真实层级，在产品最小层修复状态投影，并删除会掩盖回归的 sessions 专用 E2E 恢复；保持 C-057 的手工 hosted/Release 治理。
  - 执行方式: `code-review` skill，固定基线 `a7f3722...HEAD`，Standards/Spec 双轴并行审核；每轮修复由同一审核方复审。
  - 问题与修复: 初审发现 DESIGN 浏览器生命周期残留旧 sessions 归因、CONVENTIONS 零恢复措辞过宽、分隔符签名、快失败契约缺失和 C-049/C-058 引用归属；`c02f221` 以结构化签名、精确措辞和正向快失败契约修复，`663b62a` 对齐 C-053/C-058 并补稳定签名设计。零恢复终验另暴露完成提醒早于 timeline detail 的测试竞态，改为等待可观察折叠行。
  - 复审结论: Standards 与 Spec 最终均通过；原 findings 全部关闭，无新增 finding，source/bundle、map/code 与零恢复行为一致。
