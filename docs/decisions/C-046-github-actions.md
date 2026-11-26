---
doc-type: rationale
mutation: append-only
id: C-046
owner: agent
---

# C-046 统一验证入口并以 GitHub Actions 重放完整门禁

日期: 2026-08-28

#### 上下文
C-045 建立了本地 pre-push E2E，但实测暴露三项缺口：runner 声称共享浏览器却仍逐 spec 冷启动；9 条套件出现 `card-content` 偶发失败且耗时约 181 秒；本地 hooks 可被跳过，agent 完成工作但未 push 时也不会触发完整门禁。项目已托管在 GitHub，clean runner 可作为独立裁决环境。

#### 决策
- 提供 `pnpm verify:fast` 与 `pnpm verify` 两个权威入口：前者执行 AgentMap lint 与 core/bundle 检查，后者在前者基础上执行完整浏览器 E2E；agent 完成任务、pre-push 与 CI 重放同一完整入口。
- GitHub Actions 在 pull request 与 main push 上运行 `pnpm verify`，使用锁定的 Node、pnpm、项目内 dsh CLI 与 Playwright Chromium；失败上传 E2E 取证文件。
- E2E 全套件共享一个 Chromium 进程、每 spec 独立 browser context 与隔离 dsh web 环境；普通断言失败不重试，只有已知 sessions 首推停滞错误码允许有限环境恢复并显式记录。
- E2E 扩展优先覆盖跨模块接缝而非追求 AC 百分比：本批先覆盖移动抽屉完整交互与完成提醒跨客户端同步/刷新恢复；视觉观感、子代理复杂编排和失败矩阵后续分批处理。

#### 被否方案及原因
- 只保留本地 hooks：无法防止 hooks 未安装、被跳过或 agent 未执行 push，缺少独立集成裁决。
- CI 只运行 `pnpm check`：速度快但无法覆盖真实 dsh web、client bundle、宿主服务和浏览器交互接缝，不能解决“改东坏西”。
- 每个 AC 都增加 E2E：会重复纯函数单测并扩大慢速、易波动夹具，不符合快速稳定目标；按风险接缝补覆盖更有效。
- CI 临时全局安装未锁定的最新版 dsh：上游发布变化会使同一提交得到不同结果；项目 devDependency 精确锁定更可复现。

#### 影响面
R-01-002、R-01-005、R-01-008 / E2E 验证基建、验证门禁
