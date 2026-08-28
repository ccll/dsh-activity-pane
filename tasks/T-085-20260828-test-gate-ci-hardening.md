---
doc-type: task
mutation: lifecycle
id: T-085
---

# T-085 测试门禁稳定性与 GitHub Actions CI 加固

状态: completed
关联: C-045、C-046、C-047、C-048、C-049 → E2E 验证基建
风险等级: standard

## 背景与目标

现有快速门禁约 5 秒且 128/128 验收点均有自动化锚点，但完整 E2E 实测 9 条中 1 条失败、耗时约 181 秒；runner 声称共享浏览器却仍逐 spec 启动浏览器，`card-content` 依赖不稳定的时间线行。门禁只存在于本地 hooks，agent 完成工作但未 push 或 hooks 被绕过时没有独立裁决。本 task 收敛为统一、快速、稳定、可由 GitHub Actions 重放的验证入口，并补最小高价值跨边界行为。

## 差距评估

- `e2e/run.mjs` 创建未使用的 shared browser，同时在循环内重复 `chromium.launch()`。
- `card-content.mjs` 把「助手」行进入四行时间线当作卡片就绪条件，并重复点击确认按钮，既不确定又可能掩盖真实 click 回归。
- `package.json` 没有统一 `verify:fast` / `verify` 入口，pre-push 也不重跑快速代码门禁。
- clean checkout 没有项目内 `dsh` CLI 依赖，GitHub runner 无法直接启动隔离 dsh web。
- 无 GitHub Actions workflow；`CONVENTIONS.md` 仍声明 CI 不适用。
- 高风险接缝中，移动抽屉完整交互与完成提醒跨客户端同步/刷新恢复仍主要依赖单元或人工验收。

## 收敛方案

### 工作单元一：稳定且可度量的 E2E runner

- 每个 spec/恢复尝试使用独立 Chromium、context、`$DSH_HOME` 与 dsh web；C-047 对照实测确认跨环境共享 Chromium 会放大宿主 sessions 首推竞态。
- 失败保留 screenshot，并输出 spec、环境启动、恢复次数与套件总耗时；已知 sessions 首推停滞只按稳定错误码恢复，不重试普通断言失败。
- `card-content` 改为等待稳定的用户可观察卡面，不要求不保证进入窗口的「助手」时间线行；确认按钮只激活一次；最终门禁暴露的完成瞬间最近卡 agent 预览缺失由 history 单次补读根因修复。
- 为 runner 单一启动路径与逐尝试关闭留下 Node 级可执行契约，防止再次出现额外浏览器进程或跨环境泄漏；固定 2 worker 并行独立 spec 以压缩墙钟时间（C-049）。

### 工作单元二：最小高价值跨边界 E2E

- 扩展移动抽屉 spec：开关展开、标题行收起、遮罩收起、开关显隐、激活当前卡收起、激活其它卡切换。
- 新增完成提醒同步 spec：同一隔离服务的两个 browser context 同时观察完成提醒；一端确认后另一端同步解除；刷新后确认状态保持。
- 其余子代理、失败注入、加载矩阵和视觉截图不在本 task 扩张；待 runner 稳定数据达标后分批承接，避免一次引入过多不确定夹具。

### 工作单元三：统一门禁与 GitHub Actions

- `pnpm verify:fast`：AgentMap lint + core/bundle check。
- `pnpm verify`：快速门禁 + 全量 E2E；作为 agent 任务结束、pre-push 与 CI 的统一入口。
- GitHub Actions 以精确顶层版本 + registry 历史截止时间安装隔离的 rc.7 DSH 运行时，避免 caret 传递依赖漂移且不改变插件项目 peer 图（C-048）。
- 新增 GitHub Actions：pull request 与 main push 运行 `pnpm verify`；固定 Node/pnpm，安装项目依赖与 Chromium headless shell；失败上传 E2E 截图。
- 更新 DESIGN 与 CONVENTIONS，登记 CI 路径、权威入口和实际 hooks。

## 测试计划

- runner 自身契约先红后绿；目标代码不得依赖注释证明浏览器复用。
- 新增/改写 spec 单条运行通过后执行全套件；完整套件至少连续 3 轮全绿，记录首轮恢复次数与耗时。
- clean-path 验证：`pnpm install --frozen-lockfile` 保持插件 lockfile；CI 的历史截止 dsh 安装解析为完整 rc.7 家族；`pnpm verify:fast`、`pnpm verify`、AgentMap lint、`git diff --check` 全绿。
- GitHub workflow 以本地 YAML/命令契约检查；真实 hosted runner 结果在 push 后由 GitHub Actions 裁决。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：统一入口覆盖 lint、core/bundle 与全部浏览器 spec；CI 重放相同入口 | `package.json::scripts`、`e2e/run.mjs::specFiles` |
| 异常 | 适用：普通 spec 回归不自动重试；失败保存截图并返回非零 | `e2e/run.mjs::failed`、`e2e/run.mjs::captureFailure` |
| 边界配置 | 适用：独立 context 验证移动断点及同服务双客户端同步/刷新恢复 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`e2e/specs/completion-sync.mjs::completionSync` |
| 副作用 | 适用：每 spec 存储/浏览器隔离；cleanup 不残留 Chromium、dsh web 或临时 home | `e2e/run.mjs::context`、`e2e/boot.mjs::cleanup` |
| 性能 | 适用：无宿主恢复时完整套件目标不超过 2 分钟；触发恢复时允许延长并记录次数 | `e2e/run.mjs::suiteStart`、`e2e/boot.mjs::timings` |
| 恢复 | 适用：已知宿主首推停滞按错误码有限恢复并显式计数，不掩盖其它失败 | `e2e/helpers.mjs::ERR_PANE_STALL`、`e2e/run.mjs::lastError` |
| 兼容性 | 适用：clean GitHub runner 使用锁定的 Node、pnpm、rc.7 DSH 家族与 Playwright 版本 | `package.json::packageManager`、`.github/workflows/ci.yml::Install coherent DSH runtime` |
| 可观测性 | 适用：失败日志含 spec、耗时、服务端 stderr 尾部与 screenshot artifact | `e2e/run.mjs::webStderr`、`e2e/run.mjs::captureFailure` |

## 终态与证据

- 实现: `872a898` 统一 fast/full 门禁、GitHub Actions、固定 2 worker 隔离 E2E、移动抽屉与双客户端完成同步；`1121c12` 修复最终门禁发现的最近卡完成瞬间 user-only history 竞态，并收敛 card 激活、失败 artifact 清理与 AC 锚定声明。
- 测试: `pnpm verify` 在最终 `1121c12` 上连续 3 轮全绿（10/10 spec；E2E 114.736s / 133.560s / 121.177s；每轮均显式恢复 1 次宿主 sessions stall；完整命令 129.06s / 147.78s / 136.02s）；`card-content` 根因修复前后均做 3 轮定向复现/回归，最终与 `completion-sync`、`mobile-drawer` 联跑通过；`pnpm install --frozen-lockfile`、`pnpm verify:fast`、`git diff --check` 通过；历史截止安装实测 `dsh`、dsh-base、client-runtime、session-projection、web-app 均解析为 rc.7；CI YAML 本地解析并确认 coherent DSH 与 `pnpm verify` 步骤。GitHub hosted 结果待 push 后由 workflow 裁决。
- DESIGN 对照: DESIGN 的 E2E 验证基建已与 C-047/C-048/C-049 及实现一致：每 spec/恢复尝试独立 Chromium + dsh web、固定 2 worker、CI 隔离 coherent rc.7、最近卡预览缺口单次 history fallback；PRD 未变，128/128 AC 保持自动化锚定。
- commit: 1121c12
- review:
  - 审核方: Standards reviewer `01529703-ddf8-4bd5-a90b-5a58dd06fd63`；Spec reviewer `a44a9e98-fcdf-40f1-a582-aa482debc36e`
  - 目的理解: 两位 reviewer 均先确认 T-085 要统一 agent/pre-push/CI 完整门禁，稳定并提速真实 dsh web E2E，只对已知 sessions stall 有限恢复，补移动抽屉与完成提醒跨客户端/刷新边界，并保持 AgentMap 与失败取证一致。
  - 执行方式: `code-review` skill 双轴审核，固定基线 `d10aeee...872a898`，随后对 working tree 修复与最终 `1121c12` 由同一审核方连续复审；Standards 读取 AGENTS/CONVENTIONS，Spec 读取 T-085、DESIGN 与 C-046～C-049。
  - 问题与修复: Standards 发现 AC-09 与移动 AC 子集过度声明、`ERR_PANE_STALL` 魔法串、重复且脆弱的 card 定位、注释错位及 artifact 清理命名/异常传播；分别通过收紧锚定映射、复用常量、`activateCard`、注释归位、`clearFailureArtifact` 吞非关键清理错误修复。Spec 发现恢复后陈旧 screenshot、`getByText(...).first()` 定位风险与终态证据待填；前两项已修复，本节补齐证据。最终完整门禁另暴露最近卡 agent preview 竞态，补 `previewFallbackLoaded` 单次 history 刷新及正反单测，双轴均复审通过。
  - 复审结论: Standards 终审“通过，无新增 hard violation”；Spec 终审“全部 findings 关闭，无新增缺失、越界或行为错误”，允许关闭 T-085。
