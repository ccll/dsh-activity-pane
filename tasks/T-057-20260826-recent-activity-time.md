---
doc-type: task
mutation: lifecycle
id: T-057
---

# T-057 历史区时间口径改为最后活动时间（turn/end 精化）

状态: active
关联: R-01-010、R-01-013 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家发现最近历史卡的「最近 xx:xx」是宿主 `updatedAt`（会话创建时刻与最后一条真人用户消息时刻的较新者），agent 回复结束不推进该值；东家判定最后 agent 回复结束时刻才是会话真实最后更新时间，要求历史区判定、排序与显示改用该口径。

map 演进已同次完成并经东家两道闸口确认：PRD R-01-010 新增 AC-08（max 归一与无回合回退）、AC-09（在途先以宿主列表时间、到达后精化）；DOMAIN 新增「宿主列表时间」并重定义「最后活动时间」；DESIGN 分区不变量/核心结构/产品契约/子系统条目/追溯索引同步演进；DECISIONS 追加 C-020（含跨窗长回合缺口与被否方案）。

## 差距评估

- PRD/DESIGN/DOMAIN/DECISIONS：已同次演进，无差距。
- `src/core.mjs`：缺 `lastTurnEndFromEvents`/`lastTurnEndFromTimings` 纯函数；`buildRecent` 无 `turnEnds` 入参与 max 归一，条目字段仍名 `updatedAt`（排序/显示均用它）。
- `src/client.mjs`：渲染 `fmtRecentTime(entry.updatedAt)`；history 到达后未提取回合结束时刻注入 `buildRecent`；保留快照的 `turnTimings.endTime` 未消费。
- `scripts/check.mjs`：无 AC-08/AC-09 锚定用例；既有用例引用 `updatedAt` 字段名需随改名迁移。
- `scripts/acceptance.mjs`：历史卡人工步骤未覆盖新时间口径。

## 收敛方案

- core：新增 `lastTurnEndFromEvents(events)`（反向扫描取最后 `turn/end` 的 `time`，无则 null）与 `lastTurnEndFromTimings(turnTimings)`（取最大 `endTime`，无则 null）；`buildRecent` 新增 `turnEnds` 入参（id → 回合结束时刻），条目时间取 `max(宿主列表时间, 回合结束时刻)` 并改名 `activityAt`；窗口候选判定仍用宿主列表时间（下界语义不变）；排序与签名改用 `activityAt`。
- client：history 到达时从同批事件提取 `lastTurnEndFromEvents`、保留快照存在时提取 `lastTurnEndFromTimings`，汇入 `turnEnds` 注入 `buildRecent`；渲染改读 `entry.activityAt`；精化后签名变化驱动就地重绘与重排。
- 测试：check.mjs 新增 AC-08/AC-09 锚定用例（两纯函数、max 归一、无数据回退、精化排序、bundle 断言注入链路存在）；既有 `updatedAt` 引用迁移为 `activityAt`；acceptance.mjs 历史卡步骤补新口径人工验收点。

## 测试计划

- `pnpm build:client && pnpm check` 全绿（新增断言先红后绿）。
- `python3 tools/agentmap_lint.py --report` 追溯完整（R-01-010 新 AC 全锚定）。
- GUI 现场验收由东家按 `scripts/acceptance.mjs` 人工核验。
- 独立 `code-review` skill 审核后关闭。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：有回合会话以 max(回合结束, 宿主列表时间) 显示与排序；无回合会话回退宿主列表时间 | `scripts/check.mjs#R-01-010/AC-08`、`src/core.mjs::buildRecent`、`src/core.mjs::lastTurnEndFromEvents` |
| 异常 | 适用：history 无 turn/end（中断会话）、turnTimings 无 endTime（运行中）回退 null 不抛错 | `scripts/check.mjs#R-01-010/AC-08`（null 用例）、`src/core.mjs::lastTurnEndFromTimings` |
| 边界配置 | 适用：数据在途先显示宿主列表时间、到达后精化重排；跨窗长回合不入区（C-020 明示缺口） | `scripts/check.mjs#R-01-010/AC-09`、`src/core.mjs::buildRecent` |
| 副作用 | 适用：不新增 history 请求、不扩大深翻页数；窗口判定下界语义不变（精化不掉出窗口） | `scripts/check.mjs#R-01-010/AC-01`（窗口回归）、`src/client.mjs::loadNativeDetails`（history 拉取块无新增调用） |
| 兼容性 | 适用：时间格式与时区沿用 `fmtRecentTime` 现状 | `scripts/check.mjs#R-01-010/AC-08`（bundle 断言渲染读取 activityAt）、`src/client.mjs::fmtRecentTime` |

## 终态与证据

（待关闭时填写）
