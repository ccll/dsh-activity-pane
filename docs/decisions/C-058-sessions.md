---
doc-type: rationale
mutation: append-only
id: C-058
owner: agent
---

# C-058 sessions「首推停滞」根因是空列表状态转换被客户端渲染签名短路

日期: 2026-08-28

#### 上下文
在 coherent rc.7 的 `SessionManager` 注入首拉重试与时间戳探针后，单页面 45s 复现实验仍出现停滞；浏览器日志同时证明 manager 的初始 `session.list` 已在 40～450ms 内成功进入 `phase=ready/state=idle`，活动窗格也收到 list store 通知并在 render 中读取到 `phase=ready`。真正冻结点位于活动窗格自身：空列表的 `cardSignature([])` 在 pending 与 ready 两帧相同，`sig === lastSig` 提前返回发生在列表状态 DOM 更新之前，故页面永久保留「加载中」；reload 偶尔成功只是因为新页面首次 render 已赶上 ready。此前将症状归因于 DSH 首拉失败的 C-051～C-055 因观测层级不足而误判。

#### 决策
- 列表 `listState` 进入客户端渲染签名；即使卡片集合为空，pending/error → ready 也必须提交 DOM 状态转换。
- 废弃 C-053/C-055 的 sessions 专用恢复：每个 spec 只建立一个页面连接世代并观察 6s；超时、明确列表失败与普通断言都立即失败，不 reload、不换环境。
- 保留 upstream `SessionManager` 有界首拉重试本地补丁作为独立鲁棒性候选，但不再把它视为本项目停滞根因或缩减恢复预算的前置条件。
- Hosted CI 与 Release 仍按 C-057 保持手工，不因本次根因修复自动恢复。

#### 被否方案及原因
- 继续等待兼容 upstream runtime 后再收预算：实时探针已证明失败样本中 manager 与 outward list store 均为 ready，等待 upstream retry 不能修复客户端 DOM 签名短路。
- 保留一次 fresh-environment recovery 兜底：根因已在产品最小层修复，重试只会掩盖同类状态投影回归并增加墙钟。
- 让 E2E helper 主动 refresh 或读取内部 store：测试不应补偿产品渲染缺陷，也不应绕过用户可观察 DOM。

#### 影响面
R-01-002、R-01-010、R-02-002 / 活动状态模型、E2E 验证基建、验证门禁
