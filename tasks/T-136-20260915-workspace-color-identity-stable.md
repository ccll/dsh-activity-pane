---
doc-type: task
mutation: lifecycle
id: T-136
---

# T-136 工作区徽标颜色改为逐身份稳定分配

状态: completed
关联: R-01-003/AC-08、AC-09、AC-12（口径演进）→ 活动状态模型 / 窗格渲染器
风险等级: standard

## 背景与目标

东家提出：创建新工作区后，既有工作区会话卡片的胶囊颜色全部随之改变——现实现以「当帧可见身份集合」为输入做贪心消解（`uses` 计数 + 未用槽位优先），任何新增工作区都会重排既有身份的槽位。期望改为以工作区身份（路径优先、名称兜底）为唯一输入的稳定分配：每个工作区颜色恒定，不随工作区总数或同屏集合变化；碰撞可接受但应经均匀哈希最小化。

## 差距评估

- `src/core.mjs`：`resolveWorkspaceColors` 以可见身份集合去重排序后按 `uses` 计数贪心探测（主 7 槽 + 补充 5 槽 + 每前景槽 3 背景变体优先未用），是可见集合的函数而非单个身份的函数——漂移根因。
- `scripts/check.mjs`：AC-12 单测断言同屏 ≤12 唯一、36 复合唯一与均衡复用等集合级契约，与新契约相反。
- `scripts/acceptance.mjs`：人工验收口径含「可见工作区 8～12 个时槽位唯一」旧语义。
- `PRD.md`：AC-08 稳定性仅承诺「同一可见集合下刷新不变」；AC-12 承诺集合级唯一与均衡复用。
- `DESIGN.md`：活动状态模型「工作区颜色槽位不变量」、窗格渲染器「工作区徽标着色」与模块条目描述集合级分配。

## 收敛方案

- `src/core.mjs`：`resolveWorkspaceColors` 改为逐身份纯映射——抽出 `identityHash`（djb2 雪崩终混，`workspaceHue` 复用）；前景取基色色相在 12 槽中环形色相距离最近者（平局取低槽位），背景变体取 `floor(hash / 291) % 3`；删除集合级探测辅助（`workspaceSlotProbe`、主/补充槽位计数）。
- `PRD.md`：AC-08 改写为「槽位派生只依赖工作区身份本身，创建/移除/变更其它工作区不改变既有槽位」；AC-12 改写为逐身份确定性映射、碰撞经均匀哈希最小化（约 1/12 前景、1/36 复合），删除同屏唯一与均衡复用承诺；出处补 C-077。
- `DESIGN.md`：颜色槽位不变量、渲染层着色与模块条目三处同步逐身份映射描述。
- `scripts/acceptance.mjs`：人工验收口径改为「新增工作区不改变既有颜色」并删除「8～12 个槽位唯一」表述。
- `DECISIONS.md`：新增 C-077（放弃同屏唯一性，逐身份纯映射；被否方案：持久化登记、`hash % 12` 直接取槽、增量分配冻结）。

## 测试计划

- `node scripts/check.mjs`（就近归槽、身份稳定性、背景变体哈希分散、调色板 OKLab 距离回归）。
- `pnpm test:e2e` 全量浏览器 E2E（card-content 探针与分配算法解耦，回归确认）。
- `pnpm verify` 全量门禁。
- 独立 `code-review` skill 双轴审核。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| DESIGN | 改写：颜色槽位不变量由集合级贪心改为逐身份纯映射 | UNIT/E2E | update | 活动状态模型、窗格渲染器条目同步 |
| R-01-003/AC-08 | 改写：槽位派生只依赖工作区身份，新增/移除其它工作区不改变既有槽位 | UNIT | update | `scripts/check.mjs#R-01-003/AC-08`（身份稳定性与输入顺序断言） |
| R-01-003/AC-09 | 无正文修改 | UNIT | none | 基色哈希取色语义未变，仅测试锚点随 AC-12 块改写 |
| R-01-003/AC-10 | 无正文修改 | MANUAL | update | `scripts/acceptance.mjs` 人工验收步骤同步新口径 |
| R-01-003/AC-11 | 无正文修改 | MANUAL | update | `scripts/acceptance.mjs` 验收步骤同步 |
| R-01-003/AC-12 | 改写：逐身份确定性映射（就近归槽 + 哈希背景变体），删除同屏唯一与均衡复用承诺 | UNIT/MANUAL | update | `scripts/check.mjs#R-01-003/AC-12` + `scripts/acceptance.mjs` |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：真实工作区身份按基色就近归槽、新增身份不影响既有身份槽位 | `scripts/check.mjs#R-01-003/AC-08`、`scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 异常 | 适用：null/空白/重复身份归一处理 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 边界配置 | 适用：40+ 身份超容量仍有限终止；背景变体覆盖三档 | `scripts/check.mjs#R-01-003/AC-12`、`src/core.mjs::resolveWorkspaceColors` |
| 副作用 | 适用：十二槽 OKLab 距离 ≥ 0.11、避红弧语义与胶囊几何不变 | `scripts/check.mjs#R-01-003/AC-12`、`e2e/specs/card-content.mjs#R-01-003/AC-11`、`src/core.mjs::WORKSPACE_COLOR_SLOTS` |

## 终态与证据

- 实现: `src/core.mjs` 提取 `identityHash`（djb2 雪崩终混，原 `workspaceHue` 内联哈希移入）与命名常量 `WORKSPACE_HUE_ARC_START`/`WORKSPACE_HUE_ARC_SIZE`；`resolveWorkspaceColors` 改为逐身份纯映射——去重排序后每身份独立派生：前景取基色色相在 12 个 OKLCH 槽位中环形色相距离最近者（严格 `<` 平局取低槽位），背景变体取 `floor(hash / 弧宽) % 3`；移除集合级 `uses`/`backgroundUses` 贪心状态与 `workspaceSlotProbe`；`.dsh-plugin/client.js` 经 `node scripts/check.mjs` 从工作树重建并过 staged 一致性校验。
- 测试: `pnpm verify` 全量通过——17 个 E2E spec；`scripts/check.mjs` 改写 AC-12 块并锚定 AC-08：真实身份就近归槽、新增/移除/乱序/重复/空白身份的复合槽位稳定性、五个可达平局身份（基色 66/111/156/246/291）锁定低槽位、调色板 hue 唯一性与避红、OKLab 距离 ≥ 0.11、背景变体三档覆盖；`scripts/acceptance.mjs` 人工验收口径同步（移除「8～12 个槽位唯一」，新增「新建工作区不改变既有颜色」步骤）；agentmap lint 157 AC 全锚定；test-impact 记录 `~R-01-003/AC-08`、`~R-01-003/AC-12`。
- DESIGN 对照: PRD R-01-003/AC-08、AC-12 演进为逐身份纯映射稳定分配（AC-09 基色哈希取色语义不变）；DESIGN 活动状态模型「工作区颜色槽位不变量」、窗格渲染器「工作区徽标着色」与「工作区归属归一」条目同步逐身份契约；DOMAIN「工作区颜色槽位」词条同步；`scripts/acceptance.mjs` 口径同步——map 与 code 对照无差异。
- commit: 934ba3f
- review:
  - 审核方: Standards reviewer `2ddd161c-61d2-4502-9c33-177fef75970c`；Spec reviewer `9b87ebd2-ea3d-4fc8-b563-64e5590251fd`（`code-review` skill 并行双轴）
  - 目的理解: R-01-003/AC-08、AC-12 演进后，工作区徽标颜色槽位以 workspaceKey 为唯一输入确定性派生——前景取基色色相在 12 槽中环形色相距离最近者（平局取低槽位）、背景变体 `floor(hash/291)%3`，新增/移除其它工作区不漂移，碰撞经均匀哈希最小化；PRD/DESIGN/DOMAIN/task/测试同次原子级联。审核基线为工作区 diff vs HEAD 68fb133。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核；修复后由同一审核方复审。
  - 问题与修复: Standards 轴 3 项（判断性）——30/291 魔数三处散布与重复基色推导 → 提取 `WORKSPACE_HUE_ARC_START/WORKSPACE_HUE_ARC_SIZE` 并三处共用；`hueArcDistance` 与 core `hueDistance` 同公式异名及一条恒真断言 → 更名对齐 canonical term（工程原则 8）、删除恒真断言（工程原则 9）；workspaceHue JSDoc 雪崩细节附着点偏移 → 细节随实现移入 `identityHash`。Spec 轴 3 项（低）——平局取低槽位无测试锚点 → 新增 5 个可达平局身份断言（相邻槽环形中点 66/111/156/246/291，独立验证全覆盖）；「新增/移除/乱序」注释超出实际覆盖 → 补移除场景断言；PRD「按感知距离就近归槽」与实现口径漂移 → PRD 措辞对齐「环形色相距离」。各发现均由同一审核方复审确认关闭。
  - 复审结论: 双轴通过——Standards 轴确认三处派生统一使用常量、`identityHash` 主体逐字未动、bundle 同步；Spec 轴独立复跑 `node scripts/check.mjs` 全绿并确认平局全覆盖；无遗留发现、无 scope creep；残余仅 check.mjs 本地 `hueDistance` 作为独立预言机的可接受复制（core 未导出该函数）。
