---
doc-type: task
mutation: lifecycle
id: T-005
---

# T-005 撤回最近历史卡增强

状态: active
关联: C-007 → R-01-010 / 活动状态模型、窗格渲染器；R-01-003 / 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

东家反馈 T-004 的最近历史卡工作区徽标与最后活动概览方案不理想，要求撤回。恢复 T-004 之前的基线 `b2b416f`，保留最近历史原有的标题与最近时间行为；不删除已完成的 T-004 task 或 C-006 决策历史。

## 差距评估

- T-004 新增的 `lastActivityPreview`、`lastActivity`、`.dap-lastact` 与 `timelineUserMessages` 数据链需要移除。
- T-004 对 PRD/DESIGN/DOMAIN 的当前态扩展需要恢复到 `b2b416f`；C-006 与 T-004 作为历史审计保留。
- 共享工作树中 `README.md`、`TODO.md` 属于并发 agent 的未提交改动，不得触碰。

## 收敛方案

- 将 T-004 修改的代码、生成 bundle、当前 PRD/DESIGN/DOMAIN 与测试恢复到 `b2b416f`。
- 在 `DECISIONS.md` 追加 C-007 声明撤回，不改写只追加的决策日志。
- 创建本 task 记录撤回验证；完成后在独立提交中关闭。

## 测试计划

- `pnpm build:client && pnpm check`：确认基线历史区、活动卡、签名去重与 bundle 契约恢复并通过。
- `python3 tools/agentmap_lint.py --report`：确认撤回后的 PRD/DESIGN/测试追溯一致。
- GUI：确认最近卡恢复为标题 + 最近时间，且不出现 `.dap-lastact` 或新工作区徽标布局。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：撤回后最近历史仍按既有规则显示 | `scripts/check.mjs#R-01-010/AC-01`、`src/core.mjs::buildRecent`、`src/client.mjs::cardChildren` |
| 异常 | 适用：无活动/过期/空白会话过滤行为不回归 | `scripts/check.mjs#R-01-010/AC-01`、`src/core.mjs::buildRecent` |
| 边界配置 | 适用：24h 窗口、排序与子代理过滤恢复基线 | `scripts/check.mjs#R-01-010/AC-03`、`src/core.mjs::buildRecent` |
| 副作用 | 适用：既有签名去重与卸载清理不受撤回影响 | `scripts/check.mjs#R-02-003/AC-01`、`src/core.mjs::cardSignature`、`src/client.mjs::render` |
| 兼容性 | 适用：不新增第三方投影依赖，bundle 契约保持基线 | `scripts/check.mjs#R-02-001/AC-01`、`src/client.mjs::cardChildren` |

## 终态与证据

（实现后填写：实现 / 测试 / DESIGN 对照 / commit / review）

- 实现: 待补
- 测试: 待补
- DESIGN 对照: 待补
- commit: 待补
- review: 待补
