---
doc-type: rationale
mutation: append-only
id: C-052
owner: agent
---

# C-052 sessions unary timeout 后允许一次同环境 reload

日期: 2026-08-28

#### 上下文
C-051 的单一 32s 等待在本地完整套件实测失败：4/10 spec 最终失败、337.947s、11 次换环境恢复。对 rc.7 client-runtime 的追踪确认，`SessionManager.refreshList` 首推 transport 失败后把 `listState` 置 error，但 `listPhase` 保持 pending 且不自动重试；`SessionRuntime.projectList` 对插件投影又未携带 state/error，窗格只能继续看到 pending 并显示加载中。因而等待超过 30s 不能自愈，必须触发新的 client-runtime 实例或由上游修复。

#### 决策
- 修订 C-051 的“每环境只建立一个页面连接世代”：每个环境先给首代完整 32s；若超时或列表失败，仅 reload 一次并等待 12s，让已启动服务上的新 SessionManager 重新拉取。
- runner 的全新环境尝试从 3 次收紧为 2 次；恢复仍仅接受 `ERR_PANE_STALL`，普通断言不重试。
- 在 upstream `deepseek-ai/deepseek-harness` 跟踪根因修复；CI 继续使用已发布 coherent rc.7 时保留这一有界兼容路径，上游版本升级并验证后再删除。

#### 被否方案及原因
- 坚持单一 32s 等待：rc.7 首败后没有 manager 内重试，且错误轴被投影掩盖，实测只会永久 pending。
- 恢复 5×6s：过早中断正常冷请求，hosted 已证明会形成 16 次换环境恢复风暴。
- 插件内定时调用 `sessions.list.refresh()`：产品插件不应为宿主 runtime 的传输恢复策略兜底，且会把测试兼容逻辑带入用户运行路径。
- 继续最多 3 个全新环境：同环境已有一次有意义的 post-timeout 重试，第三个冷环境收益低而成本高。

#### 影响面
R-01-002、R-01-008、R-02-002 / E2E 验证基建、验证门禁
