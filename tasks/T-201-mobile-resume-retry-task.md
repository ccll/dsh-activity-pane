---
doc-type: task
mutation: lifecycle
id: T-201
---

# T-201 移动端挂起丢弃探针的有界重试（5dfc64c 追溯承接）

状态: active
类型: 缺陷修复
风险等级: major
风险面: 契约（e2e 探针等待口径）、对外行为（无产品行为变化，仅测试稳定性）
关联需求: R-01-001/AC-03（移动端挂起恢复的验证探针）
决策依据: C-086（e2e 发布门禁的环境主导假失败处理）

## 背景与目标

- 背景: 5dfc64c 修正 mobile-resume 的相位敏感探针（单次刺激 → 有界重试，且探针自身改用包装前
  原生 setTimeout），使「挂起丢弃至少一次在途 timer」的断言在负载相位偏移下不再假失败。
- 该提交正文自述「语义行低于阈值、未开 task」，实测语义行 57 > 50（CONVENTIONS 语义行阈值），
  按风险分级应为 major 并立项；提交已推送共享，不可改写历史。
- 目标: 以追溯 task 承接该改动，补齐方案、验证矩阵、自查与独立评审证据；登记提交正文的
  语义行误记为审计更正，避免同类测试改动继续以短路方式越过阈值。

## 差距评估

- PRD/SOLUTION: 无变化（e2e 探针口径，不改产品承诺与方案）。
- 代码: 仅 `e2e/specs/mobile-resume.mjs`；产品 `src/` 未动。
- 测试: 探针改为按轮重试至多 15s，直到真的吞掉一次 timer；断言「至少一次丢弃」不变，
  不放宽时长与阈值；探针使用包装前原生 setTimeout，修复自身 Promise 被吞的 GC 报错。
- 证据: 提交正文的「低于阈值」与实测 57 行不符；本次以 task 终态更正。

## 收敛方案

- 无分叉点: 测试探针口径修正且断言不变，方案已由 TODO 既有相位敏感缺陷登记与 e2e 纪律约束。
1. 保留 5dfc64c 的代码与断言，不重复改动；以本 task 追溯承接并补证据。
2. 语义行更正: 5dfc64c 实测 57 行（38 增 + 24 删，剥离注释与空行），属 major；登记为审计更正，
   后续同类测试改动须立项或拆分到阈值内。
3. 独立评审: 由累计审计独立审核方复核断言未放宽与探针实现正确性。

## 测试计划

- `node e2e/run.mjs mobile-resume`：探针按轮重试建立挂起丢弃语义后，断言至少一次丢弃、
  恢复后渲染不丢帧（既有断言不变）。
- `node e2e/run.mjs auto-update`：同文件辅助的相邻回归（5dfc64c 正文记录 2/2 通过）。
- `node scripts/check.mjs`：客户端契约不因测试改动变化。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：有界重试建立丢弃语义且断言口径不变 | `e2e/specs/mobile-resume.mjs::至少一次在途 timer` |
| 异常 | 适用：15s 内未建立丢弃语义时以原超时失败，不放宽 | `e2e/specs/mobile-resume.mjs::__dapDroppedTimers` |
| 边界配置 | 适用：探针自身使用包装前原生 setTimeout，避免被包装器吞掉 | `e2e/specs/mobile-resume.mjs::__dapOriginalTimeout` |
| 副作用 | 适用：仅测试文件变化，产品 bundle 与 src 不变 | `e2e/specs/mobile-resume.mjs::__dapOriginalTimeout` |

## 自查清单

- 边界：语义行 57 > 50，按 major 追溯立项；代码与断言保持 5dfc64c 原样，不改写已推送提交。
- 异常路径：重试上限 15s 与既有 until 超时同量级；超时即失败，不静默通过。
- 回归影响：产品 src/bundle 无变化；mobile-resume 与 auto-update 相邻回归通过；探针恢复原生
  setTimeout 引用在收尾执行，避免污染后续用例。

## 终态与证据
