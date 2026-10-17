---
doc-type: rationale
mutation: append-only
id: C-045
owner: agent
---

# C-045 浏览器 E2E 基建：DSH_HOME 隔离实例 + OpenAI 兼容 mock LLM 剧本 + Playwright 真实 UI 驱动

日期: 2026-08-27

#### 上下文
近三周约 70 个修复提交集中在 `src/client.mjs` DOM 交互层；该层无行为测试——127 个验收点中 11 个仅有 scripts/acceptance.mjs 人工锚点，其余自动化锚点中 335 处为 `bundle.includes` 静态字符串断言，测的是实现文本而非可观察行为，改东边坏西边的回归只能靠人肉验收发现。TODO 已登记浏览器 E2E 基建想法。已查证：`$DSH_HOME` 环境变量隔离为 DSH 原生支持（dsh-home-paths 优先级链），`dsh web --port 0` 由 OS 分配空闲端口，dsh-llm-deepseek 向 `{baseURL}/chat/completions` 发 OpenAI 兼容 SSE 流式请求。

#### 决策
- 引入浏览器 E2E：Playwright 驱动真实 dsh web 页面与 composer UI 发起会话，断言窗格可观察行为；不断言内部 DOM 结构（结构断言仅限宿主槽座等显式契约边界）。
- 测试环境为隔离测试环境：`$DSH_HOME` 临时目录 + 预置 settings.yaml + `dsh web --port 0`，插件经 `dsh plugin --profile web add` 以 link: 装入。
- 会话活动由 mock LLM 剧本服务制造：OpenAI 兼容 SSE 端点，按用户消息关键词选择预编排剧本（慢速流式=运行中、ask_user_question tool_call=待回复、立即 finish=完成提醒）。
- E2E 属 pre-push 重门禁；是否缓存隔离环境模板由 T-082 实测冷启动成本后决定。
- 分两个 task 落地：T-082 基建骨架（mock LLM + 隔离环境启动器 + 首条 spec 打通 + 冷启动实测），T-083 迁移 acceptance.mjs 可自动化条目并登记 pre-push 门禁与 CONVENTIONS。

#### 被否方案及原因
- 复用 tmp-harness 裸 CDP 脚本：手写 WebSocket 协议拼装、无选择器引擎与自动等待，调试与维护成本高，且与既有测试基建（Node assert）风格割裂。
- 真实大模型驱动会话活动：调用成本、响应非确定性、外网依赖三者都使门禁不可用。
- 以 happy-dom 纯 Node 测试取代浏览器 E2E：无法覆盖宿主外壳真实集成（重挂载自愈、PWA 后台恢复、HMR 热装、移动视口），只配作中间层补充，是否引入另行评估。
- 经内部 API 直接注入会话状态代替真实 UI 驱动：绕过 composer 到会话服务的真实链路，保真度不足，且依赖未公开的内部接口形状。

#### 影响面
R-01-005、R-01-008、R-02-002（首批由 E2E 承接自动化锚定的交互类验收点）/ 窗格渲染器、E2E 验证基建
