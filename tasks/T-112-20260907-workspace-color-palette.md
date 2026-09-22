---
doc-type: task
mutation: lifecycle
id: T-112
---

# T-112 工作区徽标扩容为十二槽 OKLCH 颜色调色板

状态: completed
关联: R-01-003/AC-08、R-01-003/AC-09、R-01-003/AC-10、R-01-003/AC-11、R-01-003/AC-12 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

当前 DSH 实例已出现 11 个工作区，而活动窗格的工作区徽标只有 7 个感知色相槽位，导致多个不同工作区复用同一颜色。目标是在不改变工作区身份判定、卡片布局、等待状态语义和颜色稳定性约束的前提下，提供 12 个可感知区分的 OKLCH 颜色槽位，覆盖当前规模并为后续增长留下余量。

- 主色相槽位保持现有 7 个远距色区，避免已有颜色语义无故漂移。
- 新增 5 个受控明度/色相补充槽位，不把 hue 等距切成 12 份。
- 同屏不超过 12 个工作区时颜色槽位唯一；超过 12 个时确定性均衡复用。
- 两个主题的 12 个槽位任意两色 OKLab 距离不小于 0.11；红色继续保留给错误语义。

## 非目标

- 不改变工作区身份归一规则（路径优先、名称兜底）。
- 不引入持久化颜色注册表、第三方色彩库或新的网络/存储路径。
- 不改变胶囊几何、字号、图标、卡片排序、历史分页或等待状态颜色。
- 不保证超过 12 个工作区仅靠颜色唯一识别；超过容量时继续均衡复用槽位。

## 差距评估

- `src/core.mjs`：`resolveWorkspaceHues` 只返回 7 个固定 hue，超过 7 个即复用；客户端无法表达槽位级 L/C 变体。
- `src/client.mjs`：工作区徽标只写入 `--dap-workspace-hue`，深浅主题 L/C 固定在 CSS 中。
- `scripts/check.mjs`：只验证 7 槽唯一与超过 7 槽复用，没有 12 槽、主题 L/C 和 OKLab 距离证据。
- `e2e/specs/card-content.mjs`：浏览器断言仍只接受七个 hue。
- `scripts/acceptance.mjs`：人工验收只描述七个主色区，未覆盖补充槽位与 12 槽容量。

## 收敛方案

1. 先同步 AgentMap：
   - `PRD.md` 的 R-01-003/AC-08～AC-12 改为工作区颜色槽位与 12 槽承诺。
   - `DESIGN.md`、`DOMAIN.md` 同步 12 槽分配、主题 L/C 与复用不变量。
   - `DECISIONS.md` 追加 C-072，记录保留七主槽、增加五补充槽的取舍。
2. 在 `src/core.mjs`：
   - 定义 12 个不可变颜色槽位：主槽 hue `[55,100,145,190,235,280,325]`，补充槽 hue `[77,122,167,257,302]`。
   - 主槽深/浅主题 L/C 使用 `0.78/0.16`、`0.48/0.15`；补充槽使用 `0.64/0.15`、`0.36/0.15`。
   - 将 `resolveWorkspaceHues` 收敛为 `resolveWorkspaceColors`，返回身份到完整颜色槽位的确定性映射：先沿原七槽起始点与步进 3 探测主槽，主槽耗尽后沿稳定顺序探测补充槽，12 槽耗尽后选择当前使用次数最少的槽。
   - 保留 `workspaceHue` 作为集合无关的稳定基色与起始点来源。
3. 在 `src/client.mjs`：
   - 渲染工作区徽标时写入 hue 及深/浅主题 L/C 自定义属性。
   - CSS 继续从同一个 OKLCH 前景色经 `color-mix` 派生底色与描边，移除徽标时一并清理全部颜色变量。
   - 保持现有胶囊几何、透明度层次与渲染签名行为。
4. 更新测试与生成物：
   - `scripts/check.mjs` 验证 7 主槽在小集合中保持既有映射、12 个工作区槽位唯一、超过 12 个均衡复用、两主题全量 OKLab 距离 ≥0.11、顺序/重复/空身份稳定。
   - `e2e/specs/card-content.mjs` 验证浏览器实际写入 12 槽色相并保持深浅主题颜色不同、底色与描边可见。
   - `scripts/acceptance.mjs` 更新 12 槽感知区分与两主题可读性人工验收。
   - 为保持既有 `loading-ready` E2E 在宿主启动较慢时仍能观测 pending，E2E-only 列表延迟从首个窗格 render 开始计时；无 URL fragment 的生产路径不变。
   - 重建 `.dsh-plugin/client.js`。

## 测试影响

| 需求/设计 | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-003/AC-08 | 徽标身份映射从 hue 扩展为完整颜色槽位 | UNIT/E2E | regression | `scripts/check.mjs#R-01-003/AC-08` 身份稳定映射、`e2e/specs/card-content.mjs#R-01-003/AC-08` 浏览器实际变量 |
| R-01-003/AC-09 | 基色仍避红，槽位调色板不使用红色警戒色 | UNIT/MANUAL | regression | `scripts/check.mjs#R-01-003/AC-09` 基色范围与槽位 hue、`scripts/acceptance.mjs#R-01-003/AC-09` 视觉检查 |
| R-01-003/AC-10～AC-11 | 深浅主题改为槽位级 L/C，底色/描边仍由 OKLCH 混合 | UNIT/E2E/MANUAL | modify | `scripts/check.mjs#R-01-003/AC-10`、`scripts/check.mjs#R-01-003/AC-11` CSS 契约、`e2e/specs/card-content.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11` computed style、`scripts/acceptance.mjs#R-01-003/AC-10` 人工主题切换 |
| R-01-003/AC-12 | 容量从 7 槽扩展为 12 槽，超过容量均衡复用 | UNIT/E2E | modify | `scripts/check.mjs#R-01-003/AC-12` 12 槽距离/唯一/复用性质、`e2e/specs/card-content.mjs#R-01-003/AC-12` 浏览器槽位断言 |
| R-01-014/AC-01 | 既有列表 pending 观察窗口不受宿主启动延迟吞掉 | E2E | regression | `e2e/specs/loading-ready.mjs#R-01-014/AC-01`、`src/client.mjs::render`；仅 E2E URL fragment 改变计时起点，生产路径不变 |
| DESIGN | 颜色槽位数据契约、分配器与 CSS 变量变化 | UNIT/E2E | update | `scripts/check.mjs#R-01-003/AC-12`、`e2e/specs/card-content.mjs#R-01-003/AC-10`、`package.json::"verify:fast"` |
| 其它 R/AC | 卡片布局、工作区归属、排序、等待状态和历史分页不变 | UNIT/E2E | regression | `scripts/check.mjs#R-01-003/AC-08` 与 `package.json::"verify"` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：同屏 ≤12 个工作区槽位唯一，两主题任意两槽位 OKLab 距离 ≥0.11，主槽保留既有色区 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 异常 | 适用：空身份/重复身份仍被忽略；无归属徽标仍隐藏并清理全部变量 | `scripts/check.mjs#R-01-003/AC-08`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：12 个槽位全部使用；第 13 个及以后均衡复用且有限终止 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 副作用 | 适用：胶囊几何/字号/图标、工作区归属、排序、卡片布局与等待语义不变 | `scripts/check.mjs#R-01-003/AC-08`、`package.json::"verify"` |
| 主题兼容 | 适用：深浅主题使用同一槽位身份但不同 L/C，前景/底色/描边均可见 | `e2e/specs/card-content.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11`、`scripts/acceptance.mjs#R-01-003/AC-10`、`src/client.mjs::renderCardInto` |

## 测试计划

- 先修改 `scripts/check.mjs` 与浏览器契约，使旧七槽实现在 12 槽断言下失败。
- 实现核心槽位分配与客户端变量接线后运行 `node scripts/check.mjs`、`pnpm verify:fast`。
- 运行 focused `pnpm exec node e2e/run.mjs card-content`，刷新现有 `http://127.0.0.1:3080/` 验证插件热装后的实际样式。
- 运行 `python3 tools/agentmap_lint.py --report`、`python3 tools/test_impact_lint.py --self-test && python3 tools/test_impact_lint.py --report`、`git diff --check`。
- 使用 `code-review` skill 做独立 Standards/Spec 双轴审核，发现问题后由同一 reviewer 复审。
- 最终运行完整 `pnpm verify`，关闭 task 前记录实现、测试、DESIGN 对照、commit 与 review 证据。

## 终态与证据

状态: completed

- 实现: `src/core.mjs` 新增 12 个不可变 OKLCH 颜色槽位与 `resolveWorkspaceColors` 确定性分配，保留 7 个主色相并增加 5 个受控明度/色相补充槽位，超过容量均衡复用；`src/client.mjs` 写入深浅主题 L/C 变量，缺少颜色槽位时隐藏徽标并清理全部变量；E2E-only 列表延迟从首个窗格 render 起算，避免宿主启动耗时吞掉既有 pending 观察窗口；`.dsh-plugin/client.js` 已同步重建。
- 测试: `pnpm verify` 通过，13 个 E2E spec 全部通过；`pnpm verify:fast`、`python3 tools/agentmap_lint.py --report`、`python3 tools/test_impact_lint.py --self-test && python3 tools/test_impact_lint.py --report`、`git diff --check` 均通过；现有 `http://127.0.0.1:3080/` 返回 HTTP 200。
- SOLUTION 对照: `PRD.md` R-01-003/AC-08～AC-12、`DESIGN.md` 工作区颜色槽位不变量、`DOMAIN.md` 工作区颜色槽位术语与 `DECISIONS.md` C-072 已同步；核心检查覆盖 12 槽唯一、两主题 OKLab 距离 ≥0.11、避红、超容量均衡复用、稳定性与无身份隐藏。
- commit: 45bcbf3b59dec51643c403e3b497d1954d19fef7
- review:
  - 审核方: Standards reviewer `539e1ea0-94c0-4a49-ae48-b6d5f42b0596`；Spec reviewer `e1a6c54a-2f50-4fea-abbe-ca0cd28da65e`。
  - 目的理解: 在保留现有 7 个远距主色相和工作区身份/集合稳定性约束的前提下，把工作区徽标扩容到 12 个可感知 OKLCH 槽位；通过主题级 L/C 交错而非等距细分 hue，覆盖当前 11 个工作区并为后续增长提供容量；超过 12 个时均衡复用，生产路径不引入持久化颜色注册表。
  - 执行方式: `code-review` skill；固定基线 `c9ca19867b942d9e9c568f0dd0216f5834186d58`；最终范围 `git diff c9ca198...45bcbf3`，含同一审核方对修复后的 Standards/Spec 复审。
  - 问题与修复: Standards 初审发现 T-112 关联字段使用了不完整 AC-ID，已补全；删除 `workspaceColorForKey` speculative fallback；合并 CSS 变量写入/清理重复结构；补充无身份隐藏、调色板避红断言；将既有 E2E-only 延迟从首个窗格 render 起算并记录测试影响。Data Clumps（槽位直接携带主题 L/C）为非阻断建议，保留以直接表达调色板契约。Spec 初审与复审均无 finding。
  - 复审结论: Standards 无剩余硬违规；Spec 复审 0 findings；允许关闭 task。
