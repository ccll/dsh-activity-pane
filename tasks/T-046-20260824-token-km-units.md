---
doc-type: task
mutation: lifecycle
id: T-046
---

# T-046 token 计数对齐主窗口 K/M 紧凑单位

状态: completed
关联: R-01-009 → 活动状态模型
风险等级: standard

## 背景与目标

主会话窗口统计行对大数使用紧凑单位（12.2K / 517K / 2.8M），活动卡统计行的 `fmtTokens` 仅有千位一档且小写 `k`，280 万输入显示为「2800.0k」，阅读不友好。东家要求实现同款阅读友好的单位转换。经查证原生 `formatTokens`（dsh-client-ui-conversation）规则后逐字镜像。

## 差距评估

- PRD R-01-009/AC-05 只约定统计行字段与布局，未约束数字格式 → map 不变（本任务不演进 PRD）。
- DESIGN 活动状态模型富卡辅助仅列 `fmtTokens` 名称、无缩写口径 → 补一词注明「K/M 紧凑缩写，镜像原生 formatTokens」。
- `src/core.mjs::fmtTokens`：单档 `(n/1000).toFixed(1)k`，无 M 档；与原生三档规则（<1e3 原样、<1e6 用 K、否则用 M；缩写值百位以上取整、不足百位保留一位小数）不一致。
- `scripts/check.mjs`：断言钉住旧输出「1.2k」，无万级/十万级/百万级用例。
- `src/client.mjs` 渲染复用 `fmtTokens`，核心修正后自动生效，无需改动。

## 收敛方案

- `src/core.mjs`：`fmtTokens` 重写为镜像原生三档——千以下原样字符串；K 档 `(n/1e3)`、M 档 `(n/1e6)`，经 `scaled` 归一（≥100 取整，否则四舍五入留一位小数）；单位大写 K/M。
- DESIGN 富卡辅助条目补缩写口径说明（经东家直接授意的措辞精确化）。
- `scripts/check.mjs`：更新千级断言为大写 K，补 51_700→51.7K、517_000→517K、2_800_000→2.8M、4_260_000→4.3M 用例。
- 不新增依赖；数据流、渲染结构不变。

## 测试计划

- `pnpm build:client && pnpm check`：含新 fmtTokens 用例与既有全部锚点回归。
- `python3 tools/agentmap_lint.py --report`：追溯完整。
- `git diff --check`：空白检查。
- GUI 现场验收（大 token 会话的输入/输出计数显示 K/M 且与主窗口一致）由东家按 scripts/acceptance.mjs 验收。
- 独立 `code-review` skill 审核。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：输入/输出计数按三档规则显示大写 K/M，与主窗口一致 | `src/core.mjs::scaled`、`scripts/check.mjs#百万级转 M（对齐主窗口统计行）`、GUI 现场验收 |
| 异常 | 适用：负数与非有限数返回 null 不展示，字段隐藏语义不回归 | `scripts/check.mjs#负数不展示`、`src/core.mjs::fmtTokens` |
| 边界配置 | 适用：千级一位小数、万级一位小数、十万级百位取整的档位边界 | `scripts/check.mjs#万级缩写`、`scripts/check.mjs#缩写值百位以上取整`、`src/core.mjs::fmtTokens` |
| 副作用 | 适用：纯函数替换，渲染结构与 bundle 契约锚点不回归 | `scripts/check.mjs#dap-token-stats`、`src/core.mjs::fmtTokens` |

## 终态与证据

- 实现: src/core.mjs::fmtTokens 重写为镜像原生 dsh-client-ui-conversation formatTokens 三档——n<1e3 原样字符串；n<1e6 scaled(n/1e3)+"K"；否则 scaled(n/1e6)+"M"；scaled(v) 百位以上取整、不足百位四舍五入留一位小数；单位大写；非法输入返回 null 既有守卫保留。DESIGN 富卡辅助补「K/M 紧凑缩写，镜像原生 formatTokens」措辞。渲染层复用 fmtTokens 自动生效，src/client.mjs 无改动。
- 测试: pnpm build:client && pnpm check 通过（千级断言改大写 K，新增 51_700→51.7K、517_000→517K、2_800_000→2.8M、4_260_000→4.3M 用例，负数/非有限归 null 回归）；agentmap_lint passed；git diff --check 干净。GUI 现场验收由东家执行。
- DESIGN 对照: 富卡辅助缩写口径说明与实现一致；PRD 未约束数字格式、map 其余不变，无差异。
- commit: e5d0931
- review:
  - 审核方: 同 T-045 双轴子代理，本任务增量随 T-045 第二轮复审并入
  - 目的理解: 活动卡 token 大数显示「2800.0k」不友好，要求对齐主窗口阅读友好单位；实现须逐字镜像原生三档规则而非自创格式
  - 执行方式: 复审请求附原生源码位置（dsh-client-ui-conversation/lib/client.js L2755-2760），Spec 轴逐字比对三档规则/scaled 归一/大写单位
  - 问题与修复: 无代码问题（task 文件验证矩阵边界行初版仅 fixture 引用被 agentmap lint 拦截，补 src/core.mjs::fmtTokens consumer 引用后通过，属文档格式修正）
  - 复审结论: Spec 轴确认与原生源码逐字一致、Standards 轴确认纯函数留 core 且断言覆盖各档位，通过。
