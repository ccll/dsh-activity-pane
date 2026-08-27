---
doc-type: task
mutation: lifecycle
id: T-082
---

# T-082 E2E 基建骨架：隔离环境启动器 + mock LLM 剧本服务 + 首条 spec

状态: completed
关联: C-045 → E2E 验证基建
风险等级: standard

## 背景与目标

C-045 决策引入浏览器 E2E：Playwright 驱动隔离测试环境中的真实 dsh web，会话活动由 mock LLM 剧本服务确定性制造。本 task 落地基建骨架并打通第一条端到端 spec，同时实测冷启动成本以决定门禁形态（每次新建 vs 模板缓存复用）。

## 差距评估

- 无 `e2e/` 目录、无 Playwright 依赖、无 mock LLM 服务；`tmp-harness/` 仅有手写 CDP 实验脚本（一次性调试用，不入测试基建）。
- 冷启动成本未知：profile 脚手架 + `dsh plugin --profile web add`（link: 装入）+ 首次 dsh web 启动，需实测。
- mock LLM 需对齐 dsh-llm-deepseek 的 SSE 期望：`stream: true`、`stream_options.include_usage`、tool_calls 增量格式（dsh-llm-deepseek/lib/index.js:100–141）。
- Playwright 浏览器二进制：按 AGENTS.md 系统操作边界，须装入项目内隔离路径（`PLAYWRIGHT_BROWSERS_PATH` 指向仓库本地），不写系统路径；优先 chromium headless shell 控制体积。

## 收敛方案

- `e2e/mock-llm.mjs`：OpenAI 兼容 `POST /chat/completions` SSE 服务；按用户消息关键词选择 E2E 剧本（慢速流式=运行中、`ask_user_question` tool_call=待回复、立即 finish=完成提醒）；监听 OS 分配端口。
- `e2e/boot.mjs`：`$DSH_HOME=临时目录` → 写入预置 settings.yaml（provider 指向 mock LLM）→ `dsh plugin --profile web add ./`（link: 装入本仓库）→ `dsh web --port 0` → 轮询就绪；进程组清理（mock、dsh web、浏览器）。
- `e2e/specs/`：Playwright spec；断言窗格可观察行为，不断言内部 DOM 结构。首条 spec 建议最小闭环：发送慢速流式指令 → 活动区出现运行卡 → 回合结束后出现完成提醒卡（覆盖 R-01-001/AC-01、R-01-002/AC-03 的端到端锚点）。
- 实测并记录冷启动各阶段耗时；超过 pre-push 可接受阈值（目标 ≤ 2 分钟）时实现 DSH_HOME 模板缓存。
- devDependencies 增加 Playwright；`pnpm check` 不受影响（e2e 独立脚本，不进 pre-commit）。
- 实现期取舍补记（独立审核确认）：套件运行器自写（node:assert + playwright 核心库，与 scripts/check.mjs 风格一致，不引入 @playwright/test）；`seedWorkspace` 预置工作区存储免除 UI 选工作区步骤；mock 对含 tool 结果的回合一律 fast 收口；状态断言全部基于可见文字/按钮/页面 URL，结构选择器仅限契约边界（窗格根 `[data-dsh-activity-pane]` 与宿主 composer 等驱动入口元素）；三剧本的 SSE 形状与分流规则在 scripts/check.mjs 做 Node 级行为断言，浏览器 spec 只驱动 slow。

## 测试计划

- 首条 spec 本地跑通（headed 调试一次 + headless 入库）。
- 隔离性验证：跑 spec 期间日常 `~/.dsh` 实例无新会话、无 settings 变更。
- `pnpm check`、`python3 tools/agentmap_lint.py --report`、`git diff --check` 保持绿。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：三剧本 SSE 形状与分流经 Node 级行为断言；首条 spec 端到端驱动 slow 剧本走完运行卡→完成提醒→确认迁移闭环 | `e2e/specs/session-lifecycle.mjs#R-01-001/AC-01`、`e2e/mock-llm.mjs::SCENARIOS`、`scripts/check.mjs::startMockLlm` |
| 异常 | 适用：dsh web 启动失败时启动器报错并完整清理（进程组终止 + 临时目录删除），已以假 dsh 二进制注入失败实测 | `e2e/boot.mjs::cleanup`、`e2e/boot.mjs::killWebGroup` |
| 边界配置 | 适用：并行两套隔离环境端口与目录不冲突（--port 0 + mkdtemp，已实测）；mock 关键词不命中走默认 fast、非 chat/completions 路径 404 | `e2e/mock-llm.mjs::pickScenario`、`scripts/check.mjs::startMockLlm` |
| 副作用 | 适用：日常 `~/.dsh` 零写入（一切状态经 `DSH_HOME` 环境变量重定向）；浏览器二进制落项目内路径（PLAYWRIGHT_BROWSERS_PATH=0）；宿主插件入口契约不变 | `e2e/boot.mjs::killWebGroup`、`src/host.mjs::apply` |
| 性能 | 适用：冷启动各阶段计时实测 2-4 秒（mock 7ms / plugin 0.7-2.5s / webReady 2-3.8s），远低于 2 分钟阈值，不做模板缓存 | `e2e/boot.mjs::timings` |
| 恢复 | 适用：套件经 finally 保证浏览器与环境清理；SIGINT 中断后临时目录清除、可立即重启成功（已实测） | `e2e/run.mjs::env.cleanup`、`e2e/boot.mjs::cleanup` |

## 终态与证据

- 实现: `e2e/mock-llm.mjs`（OpenAI 兼容 SSE 剧本服务：slow 24 块×150ms 流式 / ask 的 ask_user_question tool_calls 增量 / fast 立即 stop；关键词取最后一条带 `e2e:` 前缀的用户消息，tool 结果回合一律 fast 收口；`scenarioLog` 记录分流）；`e2e/boot.mjs`（mkdtemp `$DSH_HOME` + 预置 settings.yaml 指向 mock + `seedWorkspace` 预置工作区存储 + `dsh plugin --profile web add` link 装入 + `dsh web --port 0` detached 进程组 + 就绪轮询；`cleanup` 进程组 SIGTERM/SIGKILL + mock 关闭 + 临时目录删除；`timings` 分阶段计时）；`e2e/run.mjs`（套件运行器，`PLAYWRIGHT_BROWSERS_PATH ??= "0"`，spec 失败截图 `e2e/fail-*.png`，finally 保证清理）；`e2e/specs/session-lifecycle.mjs`（首条 spec：空态 → composer 发送 e2e:slow → 活动区出现条目且无「已完成」→ 完成提醒与「移入历史」按钮 → 确认不跳转且条目迁入历史区，锚定 R-01-001/AC-01、AC-02，R-01-002/AC-03、AC-10，R-01-010/AC-01、AC-02）。
- 测试: `node e2e/run.mjs` 通过（spec 7.0s，真实 3.6s 慢速流式期间观测运行卡）；`scripts/check.mjs` 新增 mock 三剧本 Node 级行为断言（SSE 形状、[DONE] 收尾、tool_calls 增量重组、tool 结果收口、默认 fast、404、scenarioLog 分流序列）；失败注入实测（假 dsh 二进制）：bootE2e 抛出可读错误、临时目录与 mock 无残留；并行两套隔离环境端口/目录不冲突实测；SIGINT 清理与重启恢复实测；`pnpm check`、`python3 tools/agentmap_lint.py --report`（128/128 锚定）、`git diff --check` 全绿。
- DESIGN 对照: `DESIGN.md`「E2E 验证基建」条目与实现一致——隔离测试环境四要素、mock 三剧本、Playwright 真实 composer 驱动、断言边界约定均已落地；职责行注明 T-082 实际锚点（R-01-001/002/010）与 T-083 承接范围（R-01-005/008、R-02-002）；「是否缓存环境模板由 T-082 实测决定」已裁决：冷启动 2-4s 远低于 2 分钟阈值，不做模板缓存。
- commit: c3c5defc117f818bd5938cd4714223166c80a0e9
- review:
  - 审核方: Standards reviewer（subagent 初审 + 同一复审）；Spec reviewer（subagent 初审 + 同一复审）
  - 目的理解: 为窗格交互层建立浏览器 E2E 防线——mock LLM 剧本（OpenAI 兼容 SSE）驱动确定性会话活动，隔离测试环境（$DSH_HOME 临时目录 + 随机端口 dsh web + link: 装插件）承载，Playwright 经真实 composer 驱动并只断言可观察呈现；关联 C-045 与 R-01-001/R-01-002/R-01-010 验收点锚定。
  - 执行方式: `code-review` skill 双轴并行审核，评审基线 `HEAD~1...HEAD`（初始 2dcdf8a，修复后 amend 为 dc385f3 并复审，措辞修复后最终 amend 为 c3c5def）。
  - 问题与修复: Standards 初审 2 硬违规（①头注「进程组清理」失真 → detached + killWebGroup 进程组终止；②验证矩阵证据占位 → 六行全部改 e2e/ 真实锚点）+ 2 气味关闭（spec 改写消除 read() 重复、DESIGN 口径收敛）；Spec 初审 5 项（进程组清理同①；三剧本仅 slow 被驱动 → check.mjs Node 级三剧本断言；浏览器安装命令入 CONVENTIONS；自写 runner/seedWorkspace/tool-fast 取舍补记收敛方案；内部 DOM 断言 → 改写为区域文字/按钮/URL 断言并补 AC-10 不跳转折言）；复审后措辞级建议 2 项（默认剧本改为无关键词直接断言、补记措辞放宽至宿主驱动入口元素）均已修复。
  - 复审结论: 两轴复审均通过，无未解决 hard violation、spec 偏差或 scope creep。
