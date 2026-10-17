---
doc-type: rationale
mutation: append-only
id: C-079
owner: agent
---

# C-079 CI runtime pin 随插件 dsh 基线升级到 0.1.5-rc.1 coherent 窗口（接替 C-051 的 rc7 pin）

日期: 2026-09-16

#### 上下文
C-051 以 `--before=2026-08-18` 把 CI runtime 冻结在 `@deepseek-ai/dsh@0.1.0-rc.7`（当时 rc.8 有 sessions 首推停滞）。2026-09-11 起 main CI 连续 5 次全红：18/18 spec 在 `openApp` 等窗格就绪超时，失败截图显示宿主页报 `1 entry did not activate dsh-activity-pane: pending (waiting for services: uiSession, remote.session)`——`906da61`（适配 dsh 0.1.5）使客户端插件声明依赖 `uiSession`/`remote.session`，rc7 不提供这两个服务，窗格永不挂载。同时实锤第二层障碍：原版 dsh 0.1.5 首页鉴权走 token→303→Set-Cookie→带 cookie 的 `/`，`e2e/boot.mjs` 的无 cookie 裸 fetch 轮询在原版 runtime 上永远不可达——本地能跑只因全局 dsh 带 `AUTH-DISABLED` 运维补丁（2026-09-11，tailscale 部署）。runtime 探针还复现了 C-051 同型的传递依赖漂移：cutoff 卡在 dsh rc.2（09-10 14:57Z）之前会把内部家族冻成全 rc.1 组合（web 不可服务），cutoff 过晚又会引入 zod 4.6.2（09-10 21:44Z，与已验证组合 4.6.1 行为有差）。

#### 决策
CI runtime pin 升至 `@deepseek-ai/dsh@0.1.5-rc.1`（本地全套件已验证基线：顶层 rc.1 + caret 内部家族 rc.2），coherent cutoff 取 `--before=2026-09-10T18:00:00Z`——晚于 dsh rc.2 家族发布（14:50–14:57Z）、早于 zod 4.6.2（21:44Z），cache key 同步换代；`e2e/boot.mjs` 就绪轮询改为走完整鉴权链（token→303→取 Set-Cookie→带 cookie 重放 `/`），对鉴权关闭的部署（直接 200）同样兼容。

#### 被否方案及原因
- 插件回退兼容 rc7（移除 uiSession/remote.session 依赖）：与 dsh 0.1.5 数据层迁移方向相反，为过期 CI 环境逆向产品演进，违反根因优先。
- pin 到 0.1.5-rc.2 顶层：本地全套件验证基线是顶层 rc.1 组合，rc.2 顶层未经验证；同 tuple caret 已把内部家族带到 rc.2，无必要再冒顶层组合风险。
- 就绪轮询降级为「端口可达即就绪」（接受 401）：就绪语义是应用真实可服务，401 不能区分「鉴权正常」与「启动残废」，会掩盖真实回归。

#### 影响面
R-02-003 · 验证门禁（CONVENTIONS 权威验证入口 .githooks/pre-push 与 CI 门禁）
