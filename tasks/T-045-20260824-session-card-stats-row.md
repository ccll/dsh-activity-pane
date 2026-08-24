---
doc-type: task
mutation: lifecycle
id: T-045
---

# T-045 会话卡统计行重排：左列输入/输出/速率/缓存命中，时长固定最右

状态: active
关联: R-01-009 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

运行中活动卡底部统计行当前为一段文本「输出 tok · 速率 · 时长」用小圆点连接，无左右分布，速率带约等于符号。东家要求：本回合时长固定到该行最右侧，左列显示输入 token、输出 token、tok/s（去掉约等于符号）与缓存命中率，字段之间以小圆点区隔；后续东家再调整左列顺序与会话主窗口一致：tok/s、缓存命中率、输入 token、输出 token。经东家闸口确认：字段文案用中文短标签（输入/输出/缓存）；输入口径为计费输入（未缓存输入+缓存读+缓存写，对齐原生统计行与命中率分母同口径）；全链执行。

## 差距评估

- PRD R-01-009 原陈述只含「输出 token 计数与速率」，AC-05 未约定布局、输入 token 与命中率 → 已演进：改写陈述并重写 AC-05（左列四字段顺序、小圆点区隔、速率无约等于符号、时长固定最右）。
- DESIGN 关键机制（轮内状态/富卡统计）、核心数据（轮内状态输入）、产品契约（轮内状态数据）、活动状态模型富卡辅助及需求追溯索引落点名已同步。
- 数据源已具备：`projectionValues.tokenUsage` 含 `uncachedInputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` 四桶（dsh-token-meter 投影），复用既有列表订阅，无新增轮询。
- `src/core.mjs`：`runtimeStats` 无计费输入与命中率派生；`cardSignature` 的 tokenStats 默认数组缺新字段（缺位会导致统计变化不触发重绘）。
- `src/client.mjs`：`.dap-token-stats` 为单文本段，渲染把输出/速率/时长拼进同一个 textContent；骨架无左右分布结构；热装后旧版单文本段骨架会被更新路径静默跳过，骨架创建到首次更新之间存在空行窗口（审核发现）。
- `scripts/check.mjs`：R-01-009/AC-05 段无派生函数断言与双段结构锚点。
- `scripts/acceptance.mjs`：R-01-009/AC-05 人工验收步骤仍为旧版单段描述。

## 收敛方案

- `src/core.mjs`：
  - 新增纯函数 `usageSummary({ uncachedInputTokens, cacheReadTokens, cacheWriteTokens })` 返回 `{ inputTokens, cacheHitPct }`：计费输入=三桶之和（非法桶不计入），命中率=缓存读÷计费输入百分比四舍五入；全空归 null，有输入无读桶时命中率为 null，零读显示 0%。
  - `cardSignature` 的 tokenStats 默认数组补 `inputTokens` / `cacheHitPct`，保证统计变化必变签名。
- `src/client.mjs`：
  - 运行卡骨架 `.dap-token-stats` 改为容器 + `.dap-token-main`（左列文本，省略号截断）+ `.dap-token-time`（右侧时长，`flex: none`）双段结构。
  - `renderCardInto` 左列依次写「N tok/s · 缓存 Z% · 输入 X · 输出 Y」（与会话主窗口同序，小圆点区隔、速率不带约等于符号），右段写 `fmtElapsedMs` 时长；两段皆空时整行置 hidden；骨架创建即预置 hidden，更新时双段缺失（热装旧骨架）就地重建自愈。
  - running 条目富化处追加 `Object.assign(entry, usageSummary(projection?.tokenUsage ?? {}))`。
  - 样式：容器改 flex、baseline 对齐、space-between；`:empty` 显隐规则改为 `[hidden]`；浅色主题沿用容器级 color 继承。
- `scripts/check.mjs`：导入 `usageSummary`；R-01-009/AC-05 段新增派生断言（求和与舍入、缺桶、零命中、空归一、非法桶）；签名断言以等长替换首条目方式验证命中率字段敏感性（追加整条会使签名无条件变化，审核修正）；bundle 锚定双段结构、中文短标签与约等符号移除。
- `scripts/acceptance.mjs`：更新 AC-05 人工验收步骤为新布局描述。
- 不新增依赖；数据流、订阅与轮询不变。

## 测试计划

- `pnpm build:client && pnpm check`：纯函数断言 + bundle 契约（含新锚点）。
- `python3 tools/agentmap_lint.py --report`：追溯完整（R-01-009 全 AC 锚定）。
- `git diff --check`：空白检查。
- GUI 现场验收（运行中卡片统计行左列顺序与小圆点区隔、时长贴最右、速率无约等于符号、深浅主题协调）由东家按 scripts/acceptance.mjs 验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：统计行左列依次显示 tok/s/缓存命中率/输入/输出（主窗口同序）并以小圆点区隔，时长固定最右 | `scripts/check.mjs#R-01-009/AC-05`、`scripts/check.mjs#左列顺序对齐主窗口`、`scripts/acceptance.mjs#R-01-009/AC-05`、`src/client.mjs::renderCardInto`、GUI 现场验收 |
| 异常 | 适用：token 投影缺失时对应字段隐藏、两段皆空整行隐藏不残留空壳；非法桶不计入 | `src/core.mjs::usageSummary`、`scripts/check.mjs#R-01-009/AC-05`、`src/client.mjs::statsHidden` |
| 边界配置 | 适用：窄卡下左列省略号截断而时长完整可见；命中率 0% 显示、无读桶隐藏 | `src/client.mjs::.dap-token-main`、`src/client.mjs::.dap-token-time`、`scripts/check.mjs#R-01-009/AC-05` |
| 副作用 | 适用：签名含新字段防漏重绘；不改订阅、不新增轮询、浅色主题继承不受破坏 | `scripts/check.mjs#缓存命中率变化签名必变`、`src/core.mjs::cardSignature` |

## 终态与证据

（关闭时填写）
