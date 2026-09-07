---
doc-type: task
mutation: lifecycle
id: T-113
---

# T-113 工作区徽标拆分前景身份槽与背景变体槽

状态: active
关联: R-01-003/AC-08、R-01-003/AC-09、R-01-003/AC-10、R-01-003/AC-11、R-01-003/AC-12 → 活动状态模型、窗格渲染器
风险等级: standard

## 背景与目标

C-072 已将工作区徽标扩容为 12 个前景 OKLCH 颜色槽位，但底色仍从前景色以固定混合比例派生。当前 12 个前景槽位足以覆盖现有工作区数量；当未来前景槽位复用时，完全相同的前景色仍会让重复工作区难以区分。东家确认采用「12 个前景身份槽 × 每个前景槽 3 个受控背景变体」的最小扩容方案。

- 前景槽位继续承担工作区主身份，保留 C-072 的 7 个主色相与 5 个补充槽位。
- 背景变体槽独立控制同色相族内的主题 L/C 与混合强度，不制造完全独立色相矩阵。
- 同一工作区的所有徽标恒使用同一前景/背景复合槽位；同一可见集合下刷新与重排保持不变。
- 前景槽位复用时优先使用该前景槽位的未用背景变体，最多提供 36 个复合身份；复合槽位耗尽后再均衡复用。

## 非目标

- 不改变工作区身份归一规则（路径优先、名称兜底）。
- 不改变 12 个前景槽位的 hue、前景主题 L/C、OKLab 距离或红色警戒语义。
- 不引入 12×12 完全独立色相矩阵、持久化颜色注册表、第三方色彩库或新的网络/存储路径。
- 不改变胶囊几何、字号、图标、卡片排序、历史分页或等待状态颜色。
- 不保证超过 36 个工作区仅靠复合颜色唯一识别；容量耗尽后仍需确定性均衡复用。

## 差距评估

- `src/core.mjs` 当前 `resolveWorkspaceColors` 只返回一个前景槽位对象，无法表达独立背景变体。
- `src/client.mjs` 当前只写入前景 hue/L/C，CSS 仍以固定比例从前景色派生底色与描边。
- `scripts/check.mjs` 当前只验证前景槽位，缺少背景变体槽的分配、复合容量、变体均衡与主题源值证据。
- `e2e/specs/card-content.mjs` 当前只验证前景 hue 与计算后的主题样式，未验证浏览器实际写入背景变体变量。
- `scripts/acceptance.mjs` 当前描述前景色区分，未明确背景变体的同色相族、明度层次与复合身份稳定性。

## 收敛方案

1. 先同步 AgentMap：
   - `PRD.md` 的 R-01-003/AC-08～AC-12 增加前景/背景复合身份与 3 档受控背景变体契约。
   - `DESIGN.md`、`DOMAIN.md` 同步复合槽位、背景主题 L/C/混合强度与 36 个复合容量不变量。
   - `DECISIONS.md` 追加 C-073，记录不采用完全独立 144 色相矩阵的取舍。
2. 在 `src/core.mjs`：
   - 定义 3 个不可变 `WORKSPACE_BACKGROUND_SLOTS`，每个槽位提供 dark/light 的 L、C、背景混合强度与描边混合强度。
   - 保持现有前景槽位分配；每次选择前景槽位后，在该前景槽的 3 个背景变体中按稳定探测顺序选择未用者。
   - 返回 `{ foreground, background }` 复合颜色映射；前景槽位全部复用后，背景变体仍优先消解同前景槽内的重复。
3. 在 `src/client.mjs`：
   - 保留现有前景 hue/L/C 自定义属性。
   - 新增背景 dark/light L/C、background mix 与 border mix 自定义属性；背景与描边从独立背景源色在 OKLCH 中混合。
   - 无身份或无复合槽位时清理全部前景/背景变量并隐藏徽标。
   - 保持胶囊几何、主题切换、渲染签名和生产路径不变。
4. 更新测试与生成物：
   - `scripts/check.mjs` 验证 12 个前景槽位、每槽 3 个背景变体、36 个复合身份、同前景槽内变体优先、超过 36 个均衡复用、顺序/重复/空身份稳定、两主题背景参数有效。
   - `e2e/specs/card-content.mjs` 验证浏览器实际写入背景变体变量，计算后的背景与描边在深浅主题均可见，前景/背景仍处于同色相族。
   - `scripts/acceptance.mjs` 更新 12×3 复合容量与背景明度/混合强度的人工视觉验收。
   - 重建 `.dsh-plugin/client.js`。

## 测试影响

| 需求/设计 | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-003/AC-08 | 工作区复合身份从单前景槽位扩展为前景/背景变体对 | UNIT/E2E | modify | `scripts/check.mjs#R-01-003/AC-08` 稳定复合映射、`e2e/specs/card-content.mjs#R-01-003/AC-08` 浏览器变量 |
| R-01-003/AC-09 | 基色避红契约保持不变 | UNIT/MANUAL | regression | `scripts/check.mjs#R-01-003/AC-09` 基色与槽位避红、`scripts/acceptance.mjs#R-01-003/AC-09` 视觉检查 |
| R-01-003/AC-10～AC-11 | 背景变体增加主题 L/C 与混合强度，保持 OKLCH 同色相族与可读性 | UNIT/E2E/MANUAL | modify | `scripts/check.mjs#R-01-003/AC-10`、`scripts/check.mjs#R-01-003/AC-11` 参数/契约、`e2e/specs/card-content.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11`、`scripts/acceptance.mjs#R-01-003/AC-10` |
| R-01-003/AC-12 | 12 个前景槽位增加每槽 3 个背景变体，复合容量提升到 36 | UNIT/E2E | modify | `scripts/check.mjs#R-01-003/AC-12` 36 槽唯一/复用性质、`e2e/specs/card-content.mjs#R-01-003/AC-12` 浏览器变量断言 |
| DESIGN | 复合槽位数据契约、分配器与背景 CSS 变量变化 | UNIT/E2E | update | `scripts/check.mjs#R-01-003/AC-12`、`e2e/specs/card-content.mjs#R-01-003/AC-10`、`package.json::"verify:fast"` |
| 其它 R/AC | 卡片布局、工作区归属、排序、等待状态和历史分页不变 | UNIT/E2E | regression | `scripts/check.mjs#R-01-003/AC-08` 与 `package.json::"verify"` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：12 个前景槽位各可配 3 个背景变体，前景/背景复合身份在 36 个容量内唯一，深浅主题均可见 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 异常 | 适用：空身份/重复身份仍被忽略；无归属徽标隐藏并清理全部前景/背景变量 | `scripts/check.mjs#R-01-003/AC-08`、`src/client.mjs::renderCardInto` |
| 边界配置 | 适用：第 13 个工作区优先获得同前景槽位的未用背景变体，第 37 个及以后均衡复用且有限终止 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 副作用 | 适用：胶囊几何/字号/图标、工作区归属、排序、卡片布局与等待语义不变 | `scripts/check.mjs#R-01-003/AC-08`、`package.json::"verify"` |
| 主题兼容 | 适用：深浅主题使用同一复合身份但不同前景/背景主题参数，文字、底色与描边均可见 | `e2e/specs/card-content.mjs#R-01-003/AC-10`、`e2e/specs/card-content.mjs#R-01-003/AC-11`、`scripts/acceptance.mjs#R-01-003/AC-10`、`src/client.mjs::renderCardInto` |

## 测试计划

- 先更新 `scripts/check.mjs` 的 36 个复合槽位断言，使单纯前景槽位实现无法满足新增契约。
- 实现核心背景变体分配与客户端 CSS 变量接线后运行 `node scripts/check.mjs`、`pnpm verify:fast`。
- 运行 focused `pnpm exec node e2e/run.mjs card-content`，刷新现有 `http://127.0.0.1:3080/` 验证浏览器实际样式与变量。
- 运行 `python3 tools/agentmap_lint.py --report`、`python3 tools/test_impact_lint.py --self-test && python3 tools/test_impact_lint.py --report`、`git diff --check`。
- 使用 `code-review` skill 做独立 Standards/Spec 双轴审核，发现问题后由同一 reviewer 复审。
- 最终运行完整 `pnpm verify`，关闭 task 前记录实现、测试、DESIGN 对照、commit 与 review 证据。

## 终态与证据

状态: active

- 实现: 待完成。
- 测试: 待完成。
- DESIGN 对照: 待完成。
- commit: 待提交。
- review: 待调用 `code-review` skill 做 Standards/Spec 双轴审核。
