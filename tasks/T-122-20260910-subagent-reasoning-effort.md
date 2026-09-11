---
doc-type: task
mutation: lifecycle
id: T-122
---

# T-122 子代理卡显示 reasoning effort：请求头提取 + 目录条目回退

状态: active
关联: R-01-012 → 活动状态模型
风险等级: standard

## 背景与目标

- 背景: 东家在 T-121 演示后提出：子会话按理也应设置 reasoning effort，卡片不应缺失。查证宿主源码推翻了 T-120「事件流无 reasoning level」的旧结论——`request/header` 会话日志事件携带 `config.{provider, model, reasoningEffort}`（宿主 selection getter 即从它读取），且 history RPC 不做事件类型过滤，effort 就在已读取的同一 history 页内。
- 定性: 需求变更（东家确认）：PRD AC-18 旧文「子代理卡不显示 reasoning level」作废，AC-17/AC-18 演进为显示 effort 与不可得时的空白语义。
- 目标: 子代理卡标题行右缘显示 `模型显示名 · effort`；提取链为「日志最新请求头 `config.reasoningEffort` → 模型目录条目 `reasoning` → 空白」，不以预设值或母会话取值冒充。
- 非目标: 不为子代理新增 RPC、订阅或轮询（R-02-004）；不改主会话模型上下文路径；不改进度/统计行为。

## 差距评估

- core.mjs: 无请求头 effort 提取函数；`catalogModelNames` 只产出显示名索引，条目的 `reasoning` 字段被丢弃。
- client.mjs: 子代理 history 落地处只折叠模型溯源不折叠 effort；渲染只解析显示名不解析 effort。
- PRD: AC-18 含已作废措辞「子代理卡不显示 reasoning level」（本次演进）。

## 收敛方案

1. PRD: AC-17 补「与 reasoning effort」及请求头来源；AC-18 换掉不显示措辞，改为 effort 不可得时空白、不冒充。
2. DOMAIN: 「模型上下文」词条的子代理溯源定义扩展 effort 与回退链。DESIGN: 「模型上下文」机制、条目结构、产品契约、追溯索引四处同步；acceptance 步骤措辞更新。
3. core.mjs: 新增 `reasoningEffortFromHistoryEvents(history)`（反向扫描最新一条 `request/header`，命中即停——更早请求头属已废弃纪元；未声明 effort 返回 null）；`catalogModelNames` 重构为 `catalogModelEntries(groups)` 产出 `modelId → {name, reasoning}` 索引（一次遍历同时供显示名与 effort 回退）。
4. client.mjs: 子代理 history 落地处折叠请求头 effort 进 `detail.model.reasoning`；部署级索引收割 `catalogModelEntries`；渲染时对子代理条目先按原始溯源 id 解析显示名与 effort 回退，再写显示名。
5. 测试先行: check.mjs 单测（effort 提取四态、目录索引重构）+ 契约钉子更新；`pnpm verify` 全量回归。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-012/AC-17 | 新增：子代理卡显示 reasoning effort | UNIT | add | `scripts/check.mjs#R-01-012/AC-17` `reasoningEffortFromHistoryEvents` 提取单测 + `catalogModelEntries` 重构单测 + 渲染契约钉子更新 |
| R-01-012/AC-18 | 修改：effort 不可得时空白、不冒充 | UNIT | update | `scripts/check.mjs#R-01-012/AC-18` 无请求头/未声明 effort 返回 null 单测；目录未覆盖回退断言保留 |
| PRD | AC-17/AC-18 措辞演进（effort 显示） | MANUAL | update | 同次变化由本 task 记录：`scripts/acceptance.mjs::R-01-012/AC-17` 人工步骤补 effort 观察点 |
| DESIGN | 机制/契约/条目结构/追溯索引四处同步 | UNIT | update | 同次变化由本 task 记录：DESIGN.md 与实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：子代理卡显示 `显示名 · effort` | `scripts/check.mjs#R-01-012/AC-17`（effort 提取 + 索引单测）、`scripts/acceptance.mjs::R-01-012/AC-17` |
| 异常 | 适用：无请求头/未声明 effort/目录未覆盖时空白或原始 id 回退 | `scripts/check.mjs#R-01-012/AC-18`、`scripts/acceptance.mjs::R-01-012/AC-18` |
| 边界配置 | 适用：主会话卡行为不变、多请求头纪元取最新、畸形事件跳过 | `scripts/check.mjs#R-01-012/AC-16`、`scripts/acceptance.mjs::R-01-012/AC-16` |
| 副作用 | 适用：渲染签名稳定、既有 E2E 不回归 | `e2e/specs/card-content.mjs::R-01-012/AC-01`、`e2e/specs/session-lifecycle.mjs::R-01-013/AC-12` |

## 测试计划

- `scripts/check.mjs` 新增/更新 AC 锚定单测与契约钉子。
- `pnpm verify:fast` 编辑循环；`pnpm verify` 全量回归。
- `.dsh-plugin/client.js` 随实现重建。
- 备注（2026-09-11）：本机 dsh 升级 0.1.5-rc.1 后 web 外壳挂载与数据 RPC 面破坏，`pnpm verify` 全量回归在 T-123（dsh 0.1.5 适配）内兑现；本 task 单元证据（`pnpm check`）已落。

## 终态与证据

（active 期间待填）
