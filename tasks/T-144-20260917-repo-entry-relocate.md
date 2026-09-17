---
doc-type: task
mutation: lifecycle
id: T-144
---

# T-144 仓库入口移至标题行左侧独立区

状态: completed
关联: R-01-022/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家实测反馈：移动端触屏点按档位切换按钮时极易误触紧邻其左侧的 GitHub 仓库入口（两按钮均为 22px 圆形、`.dap-tools` 内间距仅 4px，远小于 44px 触屏推荐命中区），跳出新标签页代价高。东家定向：仓库入口移到「活动会话」标题行**左侧**、给它专门腾出一个独立区域、与其它按钮远离。该位置变更超出 R-01-022/AC-01 现文「标题行右侧工具区」，属 PRD 原地演进（东家本次确认即需求层确认）；呈现与激活隔离语义不变，同时从根因上消除两按钮相邻的误触面（距离最大化优于命中区扩容的缓解方案）。

## 差距评估

- `PRD.md`：R-01-022/AC-01 钉死「标题行右侧工具区」，需改写为「标题行最左端独立区域、与档位切换按钮分处标题行两端」。同次级联：仓库入口独立区使 R-01-011 的「标题区」界定需排除它（陈述与 AC-03 加「除最左仓库入口区」），且折叠窄条与标题区的横向起点必然分离，AC-05 的「同一屏幕位置」收敛为「顶缘同一屏幕位置」（东家移位指令的逻辑必然后果）。
- `src/client.mjs`：骨架模板中 `<a class="dap-repo">` 是 `.dap-tools` 首子节点；需移出为 `.dap-header` 首子节点（与 `.dap-titlebar` 兄弟隔离，维持「不参与标题区收起激活」）；`.dap-repo` 样式需自带左缘间距（原依赖 `.dap-tools` 的 `padding: 10px 12px`，圆形底色盒不可用 padding 扩容，用 `margin-left` 对齐原观感）；`.dap-header`/`.dap-titlebar`/浅色覆盖/`createRepoIcon` 处「工具区」注释同步。
- `DESIGN.md`：追溯索引行「标题行工具区仓库入口」、产品契约「仓库入口」条目与「标题行两部分结构」条目（三部分化 + 两端语义）同步。
- `scripts/check.mjs`：仓库入口 bundle 断言的描述文字「标题行工具区」需如实改述（断言本体子串与顺序在新模板下不变，已核对）。
- `scripts/acceptance.mjs`：R-01-022 人工验收步骤位置描述同步；R-01-011/AC-03 步骤的标题区界定同步；文件头索引注释同步。
- `e2e/specs/repo-entry.mjs`：选择器 `.dap-tools .dap-repo` → `.dap-header .dap-repo`，断言文案与位置语义同步，「远离」量化为「右缘不越标题区左缘 + 档位按钮在标题区右缘之后」两条几何断言。
- `e2e/specs/desktop-layout.mjs`：窄条同位断言按 AC-05 新语义改写（顶缘同位 + 贴窗格左缘）。
- `e2e/specs/compact-density.mjs`：工具区锚点注释与断言文案随仓库入口移出而同步（锚点几何不变）。

## 收敛方案

- 测试先行：先改 `e2e/specs/repo-entry.mjs` 与 `scripts/check.mjs` 描述至新位置语义，运行确认旧实现（repo 仍在工具区）转红。
- `src/client.mjs`：模板移位 + `.dap-repo` 自身 `margin: 0 0 0 12px`（垂直居中由 `.dap-header` 的 `align-items: center` 保证）+ 注释同步。
- `PRD.md`（R-01-022/AC-01 与 R-01-011 陈述/AC-03/AC-05）/`DESIGN.md`/`scripts/acceptance.mjs` 同次改述。
- `e2e/specs/desktop-layout.mjs` 断言随 AC-05 新语义改写。
- `pnpm build:client` 重建 `.dsh-plugin/client.js` 并随实现一并提交。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-022/AC-01）。
- `pnpm test:e2e`（`e2e/specs/repo-entry.mjs` 锚定 R-01-022/AC-01～AC-03，浏览器实测新位置与激活隔离；`e2e/specs/compact-density.mjs::R-01-021/AC-01` 回归工具区锚点）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 浏览器实测：桌面 1100px 展开态与 <=767px 移动抽屉态各验一次位置观感与误触隔离（点档位按钮不落仓库入口命中区）。
- 独立 `code-review` skill 双轴审核；存在 finding 时由同一 reviewer 复审至通过。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-022/AC-01 | 改写：仓库入口位置由「标题行右侧工具区」改为「标题行最左端独立区域、与档位切换按钮分处标题行两端」（东家指令） | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`——选择器改 `.dap-header .dap-repo`，「远离」量化为「右缘不越标题区左缘 + 档位按钮在标题区右缘之后」两条断言 |
| R-01-022/AC-02 | 保持：激活隔离（不折叠、不改档位与选中会话）语义不变 | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-02`——断言不变，随选择器迁移复核 |
| R-01-022/AC-03 | 保持：折叠窄条隐藏仓库入口语义不变 | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-03`——断言不变，随选择器迁移复核 |
| R-01-011/AC-05 | 措辞收敛：「同一屏幕位置」→「顶缘同一屏幕位置」——仓库入口独立区占标题行最左后折叠窄条与标题区横向起点必然分离（东家移位指令的逻辑必然后果）；桌面布局断言随新语义改写 | E2E | update | `e2e/specs/desktop-layout.mjs::R-01-011/AC-05`——断言改为「窄条顶缘与标题行同位且贴窗格左缘」 |
| R-01-011/AC-03 | 措辞澄清：标题区界定加入「除最左仓库入口区」，激活区域几何未变（标题区仍整体激活收起） | MANUAL | none | 同次修改的 active task 豁免：标题区界定措辞随仓库入口独立区设立而澄清，锚点 `scripts/check.mjs::R-01-011/AC-03` 与 `scripts/acceptance.mjs::R-01-011/AC-03` 断言的对象（标题区激活收起/窄条展开/悬停显现图标）行为不变；`scripts/acceptance.mjs` R-01-011 步骤同步补「不含最左仓库入口区」措辞 |
| DESIGN | 改写：追溯索引与产品契约「仓库入口」条目、「标题行结构」条目（三部分化与两端语义）措辞同步 | UNIT | update | `scripts/check.mjs::R-01-022/AC-01`——仓库入口断言描述文字随实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：展开态（桌面贴边列 + 移动抽屉）仓库入口位于标题行最左独立区，工具区仅剩档位按钮 | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`、`scripts/check.mjs::R-01-022/AC-01` |
| 异常 | 适用：激活仓库入口不折叠窗格、不改变档位与选中会话 | `e2e/specs/repo-entry.mjs::R-01-022/AC-02` |
| 边界配置 | 适用：移动抽屉形态与浅色主题下位置与底色覆盖不回归 | `e2e/specs/repo-entry.mjs::R-01-022/AC-03`、`scripts/check.mjs::R-01-022/AC-01` |
| 副作用 | 适用：标题行三段结构不引入新的误触邻接；折叠窄条随标题行整体隐藏 | `e2e/specs/compact-density.mjs::R-01-021/AC-01`、`e2e/specs/repo-entry.mjs::R-01-022/AC-02` |

## 终态与证据

- 实现: `src/client.mjs` 骨架模板中 `<a class="dap-repo">` 移出 `.dap-tools` 为 `.dap-header` 首子节点（与 `.dap-titlebar` 兄弟隔离，「不参与标题区收起激活」由结构保证）；`.dap-repo` 样式新增 `margin: 0 0 0 12px` 承担原 `.dap-tools` padding 的左缘间距（圆形底色盒不可用 padding 扩容，垂直居中由 `.dap-header` 的 `align-items: center` 保证）；`.dap-header`/`.dap-titlebar`/浅色覆盖/`createRepoIcon` 注释同步为「标题行三部分结构」「分处标题行两端」；顺带修正抽屉遮罩注释的既有失实描述（原注释称「关闭由抽屉头部 × 与遮罩承担」，实现与 DESIGN 为无独立 × 关闭按钮、标题行激活收起——本会话先前已向东家报告的漂移，纯注释无行为变化，保留记此）。`PRD.md` R-01-022/AC-01 与 R-01-011 陈述/AC-03/AC-05 同次演进；`DESIGN.md` 追溯索引与产品契约同步；`.dsh-plugin/client.js` 已随实现提交重建。
- 测试: `pnpm verify` 全量通过（agentmap lint 161 AC 全锚定 + test-impact + check 全断言 + 18 个 E2E spec，其中 repo-entry 实测新位置两条几何断言、desktop-layout 实测顶缘同位与贴窗格左缘、compact-density 工具区锚点回归）；修复轮后三个受影响 spec（repo-entry/desktop-layout/compact-density）单跑通过；两轴复审后 `pnpm verify:fast` 由 Standards 审核方独立复跑全绿。桌面 1100px 展开态与 <=767px 移动抽屉态各截取标题行实测：仓库入口位于标题行最左、档位按钮居右，两端隔离观感正确（截图核对后临时产物已清理）。
- DESIGN 对照: 需求追溯索引恰一行 R-01-022（主责子系统「窗格渲染器」，设计落点改述「标题行左侧仓库入口」）；产品契约「标题行三部分结构」与「仓库入口」条目、窗格渲染器模块条目与实现一致（header 首子节点独立区、两按钮分处标题行两端、`margin-left` 承担间距、窄条/抽屉隐藏语义不变）；PRD R-01-011 陈述/AC-03/AC-05 的级联改写与 DESIGN 一致；DOMAIN 无仓库入口词条、无需改动。
- commit: 2001f24
- review:
  - 审核方: Standards reviewer `51ce9ba0-0daa-49ca-8433-bf204873c11e`；Spec reviewer `2bc152c6-2391-4ddc-986a-44f63997a4aa`（code-review skill 并行双轴）
  - 目的理解: 将 `.dap-repo` 从 `.dap-tools` 移至 `.dap-header` 首子节点的独立区，消除移动端触屏点按档位按钮对 GitHub 仓库入口的误触；关联约束为 R-01-022（AC-01 位置、AC-02 激活隔离、AC-03 窄条隐藏）与 R-01-011（标题区界定与同位语义随独立区设立级联收敛），预期行为为仓库入口与档位按钮分处标题行两端、激活隔离与窄条隐藏语义不变，验证方式为 check 契约断言 + 双 spec 几何断言 + 全量 verify。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `HEAD(5fe72c0)` 与工作树未提交 diff（本 task 即 spec 来源，含 PRD 演进）；修复后由同一审核方逐项复审。
  - 问题与修复: Standards 轴 3 项——(1) 测试影响表缺 R-01-011 行且 task 正文与改动集漂移：补 R-01-011/AC-05（update）与 AC-03（none+豁免理由）两行、差距评估/收敛方案补登 desktop-layout.mjs 与 compact-density.mjs；(2) AC-01「远离」不可判定：PRD 措辞收敛为「分处标题行两端」，e2e 断言量化为 `repoRight <= titlebarX` 与 `densityX > titlebarRight` 两条几何断言；(3) desktop-layout.mjs:28 注释漂移：同步「顶缘同位」。Spec 轴 (a) 与 Standards (1) 同项；(b) scope creep 仅 src/client.mjs:945 遮罩注释 T-137 表述——保留，理由为修正本会话先前已向东家报告的注释失实（注释称有 × 关闭按钮而实现与 DESIGN 为无 ×），纯注释无行为变化；(c1) 与 Standards (2) 同项；(c2) 后代选择器 `.dap-header .dap-repo` 不敏感：保留，`repoRight <= titlebarX` 几何断言已排除 repo 残留工具区的一切可能；(c3) check.mjs 断言本体不校验位置：维持已声明残余（bundle 契约只校结构子串/顺序，位置语义由 e2e 承载）。
  - 复审结论: 两轴均复审通过——Standards 3/3 硬违规修复确认（test-impact lint changed=3 全闭合）；Spec 4 项全部解决、(b)/(c2)/(c3) 处置接受。复审后残留「远离」措辞已在实现提交前于 check.mjs、repo-entry.mjs 文件头、acceptance.mjs R-01-022 步骤与 client.mjs 注释统一为「分处标题行两端」（canonical term）；两轴提示的「task 终态须实际写入」由本终态兑现。
  - 残余风险与测试缺口: check.mjs 仓库入口断言本体（子串+模板顺序）仍不校验几何位置，位置语义由 e2e 几何断言承载（已声明残余）；可选加固（两轴建议，未采纳、留作后续触碰时顺手）：check.mjs 模板顺序断言可补 titlebar 锚（repo < titlebar < density）结构性钉死「header 首子节点」；e2e 对「分处两端」的断言依赖 1100px 桌面视口，极窄展开宽度下的几何未单独覆盖（布局由 flex 语义与 200–480px 夹取约束承载）。
