---
doc-type: task
mutation: lifecycle
id: T-085
---

# T-085 测试门禁稳定性与 GitHub Actions CI 加固

状态: active
关联: C-045、C-046 → E2E 验证基建
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

- 全套件只启动一个 Chromium 进程，每个 spec 使用独立 context；每个 spec 保持独立 `$DSH_HOME` 与 dsh web。
- 失败保留 screenshot，并输出 spec、环境启动、恢复次数与套件总耗时；已知 sessions 首推停滞只按稳定错误码恢复，不重试普通断言失败。
- `card-content` 改为等待稳定的用户可观察卡面，不要求不保证进入窗口的「助手」时间线行；确认按钮只激活一次。
- 为 runner 浏览器复用留下 Node 级可执行契约，防止再次出现“声明共享但实际逐条启动”。

### 工作单元二：最小高价值跨边界 E2E

- 扩展移动抽屉 spec：开关展开、标题行收起、遮罩收起、开关显隐、激活当前卡收起、激活其它卡切换。
- 新增完成提醒同步 spec：同一隔离服务的两个 browser context 同时观察完成提醒；一端确认后另一端同步解除；刷新后确认状态保持。
- 其余子代理、失败注入、加载矩阵和视觉截图不在本 task 扩张；待 runner 稳定数据达标后分批承接，避免一次引入过多不确定夹具。

### 工作单元三：统一门禁与 GitHub Actions

- `pnpm verify:fast`：AgentMap lint + core/bundle check。
- `pnpm verify`：快速门禁 + 全量 E2E；作为 agent 任务结束、pre-push 与 CI 的统一入口。
- 将 `@deepseek-ai/dsh` 以精确版本登记为 devDependency，保证 clean checkout 的 E2E 运行时可复现。
- 新增 GitHub Actions：pull request 与 main push 运行 `pnpm verify`；固定 Node/pnpm，安装项目依赖与 Chromium headless shell；失败上传 E2E 截图。
- 更新 DESIGN 与 CONVENTIONS，登记 CI 路径、权威入口和实际 hooks。

## 测试计划

- runner 自身契约先红后绿；目标代码不得依赖注释证明浏览器复用。
- 新增/改写 spec 单条运行通过后执行全套件；完整套件至少连续 3 轮全绿，记录首轮恢复次数与耗时。
- clean-path 验证：`pnpm install --frozen-lockfile` 所需依赖均由 package/lock 声明；`pnpm verify:fast`、`pnpm verify`、AgentMap lint、`git diff --check` 全绿。
- GitHub workflow 以本地 YAML/命令契约检查；真实 hosted runner 结果在 push 后由 GitHub Actions 裁决。
- 独立 `code-review` skill 双轴审核；finding 由同一审核方复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：统一入口覆盖 lint、core/bundle 与全部浏览器 spec；CI 重放相同入口 | `package.json::scripts`、`e2e/run.mjs::specFiles` |
| 异常 | 适用：普通 spec 回归不自动重试；失败保存截图并返回非零 | `e2e/run.mjs::failed`、`e2e/run.mjs::page.screenshot` |
| 边界配置 | 适用：独立 context 验证移动断点及同服务双客户端同步/刷新恢复 | `e2e/specs/mobile-drawer.mjs::mobileDrawer`、`e2e/specs/session-lifecycle.mjs::sessionLifecycle` |
| 副作用 | 适用：每 spec 存储隔离、浏览器进程共享；cleanup 不残留 dsh web 或临时 home | `e2e/run.mjs::context`、`e2e/boot.mjs::cleanup` |
| 性能 | 适用：完整套件目标不超过 2 分钟，记录每 spec 与总耗时 | `e2e/run.mjs::start`、`e2e/boot.mjs::timings` |
| 恢复 | 适用：已知宿主首推停滞按错误码有限恢复并显式计数，不掩盖其它失败 | `e2e/helpers.mjs::ERR_PANE_STALL`、`e2e/run.mjs::lastError` |
| 兼容性 | 适用：clean GitHub runner 使用锁定的 Node、pnpm、dsh 与 Playwright 版本 | `package.json::devDependencies`、`pnpm-lock.yaml::importers` |
| 可观测性 | 适用：失败日志含 spec、耗时、服务端 stderr 尾部与 screenshot artifact | `e2e/run.mjs::webStderr`、`e2e/run.mjs::page.screenshot` |

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
