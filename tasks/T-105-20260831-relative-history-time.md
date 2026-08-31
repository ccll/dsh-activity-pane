---
doc-type: task
mutation: lifecycle
id: T-105
---

# T-105 历史卡绝对日期与相对活动时间

状态: active
关联: R-01-013/AC-05 → 窗格渲染器、活动状态模型
风险等级: standard

## 背景与目标

- 背景: 历史分页后列表可跨天、跨月甚至跨年，历史卡当前只显示小时与分钟，无法判断具体日期或距离当前多久。
- 目标: 历史卡第五行同时显示 `activityAt` 的本地绝对日期时间与相对活动时间，保留紧凑可读性。
- 保持: `activityAt` 来源与排序、历史卡布局层次、详情加载、活动/历史互斥、桌面与移动抽屉行为不变。
- 非目标: 不修改时间戳来源、历史分页候选集合、时区设置或卡片排序；不引入时间处理依赖。

## 差距评估

- `src/client.mjs::fmtRecentTime` 当前仅调用 `toLocaleTimeString` 输出小时与分钟，并带有「最近」前缀。
- 历史卡没有同时表达绝对日期和相对年龄的显示契约；`activityAt` 已具备精化后的最后活动时间，可直接作为显示输入。
- 现有运行时仅在活动卡存在时启动 1 秒时钟，历史卡没有独立的分钟级相对时间刷新。

## 收敛方案

1. PRD 将 R-01-013/AC-05 更新为本地绝对日期时间（跨年份显示年份）与分钟级相对活动时间并列显示；DESIGN、DOMAIN、README 同步术语与显示契约，DECISIONS 追加选型理由。
2. `src/core.mjs` 增加可单测的相对年龄分级函数，按刚刚/分钟/小时/天/周/月/年输出中文短文案，异常或负值不输出虚假时间。
3. `src/client.mjs` 将历史卡时间改为绝对日期时分 + 相对时间，复用本地时区格式化；增加分钟级历史时间刷新，并把时间文案纳入渲染签名以便就地更新。
4. 在核心断言、历史分页 E2E 和人工验收中覆盖今天/跨天/跨年、各相对时间档位、异常时间与桌面/移动窄宽度显示。
5. 本轮只实现并验证，不创建 commit；待东家查看效果后再决定是否提交。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-013/AC-05 | 最近卡时间从时分改为绝对日期时间 + 相对活动时间 | UNIT/E2E/MANUAL | update | `scripts/check.mjs#R-01-013/AC-05`、`e2e/specs/recent-infinite-scroll.mjs#R-01-013/AC-05`、`scripts/acceptance.mjs#R-01-013/AC-05` |
| R-01-010/AC-03、AC-08、AC-09 | 时间来源、精化排序与显示保持不变 | UNIT/E2E | regression | 既有 `activityAt`/turn end 断言与历史分页顺序断言 |
| DESIGN | 增加历史卡绝对/相对时间显示与分钟级刷新设计 | UNIT/E2E/MANUAL | update | `package.json::lint:agentmap`、`DESIGN.md#R-01-013`、`DOMAIN.md#相对活动时间` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：历史卡同时显示绝对日期时间和相对时间 | `package.json::check`、`scripts/check.mjs#R-01-013/AC-05`、`package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-013/AC-05` |
| 异常 | 适用：非法、负值或将来时间不显示虚假负年龄；缺失时间不抛错 | `package.json::check`、`scripts/check.mjs#R-01-013/AC-05`、`package.json::test:e2e` |
| 边界配置 | 适用：刚刚、分钟/小时/天/周/月/年分界，以及跨年份日期 | `package.json::check`、`scripts/check.mjs#R-01-013/AC-05`、`package.json::test:e2e`、`e2e/specs/recent-infinite-scroll.mjs#R-01-013/AC-05` |
| 副作用 | 适用：分钟级刷新不改变排序、滚动位置或桌面/移动布局 | `package.json::check`、`scripts/check.mjs#R-01-013/AC-05`、`package.json::test:e2e`、`e2e/specs/long-list.mjs#R-01-004/AC-01`、`package.json::accept:manual`、`scripts/acceptance.mjs#R-01-013/AC-05` |
| 性能 | 适用：历史时间不使用 1 秒运行时钟，只有可见历史卡存在时启用分钟级刷新 | `package.json::check`、`scripts/check.mjs#R-01-013/AC-05` |

## 测试计划

- 先运行 `pnpm check`，确认相对年龄纯函数与 bundle 契约通过。
- 运行 `pnpm test:e2e recent-infinite-scroll`，观察历史卡第五行的绝对日期与相对时间。
- 刷新 `http://127.0.0.1:3080/` 做人工验收，检查桌面与移动抽屉的窄宽度换行和分钟级更新。
- 不提交 commit；等东家查看实现效果后再决定下一步。

## 终态与证据

待东家查看实现效果后补充。
