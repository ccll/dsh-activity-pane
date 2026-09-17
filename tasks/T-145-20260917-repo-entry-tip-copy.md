---
doc-type: task
mutation: lifecycle
id: T-145
---

# T-145 仓库入口悬停提示文案补行动召唤

状态: completed
关联: R-01-022/AC-01 → 窗格渲染器
风险等级: standard

## 背景与目标

东家指令：仓库入口按钮的 tips（悬停提示 `title`）由「报告问题」改为「报告问题，点赞收藏」——在报告问题用途之外补充行动召唤（呼应 R-01-022 陈述「给项目点 star」的动机句）。可访问名称（`aria-label`）保持「报告问题」：它表达元素用途且由 R-01-022/AC-01 的「（可访问名称）」承载，东家指令只针对悬停提示（tips）；两者分工为可访问名称简短表达用途、悬停提示承载行动召唤。R-01-022/AC-01 未钉悬停提示文案，PRD 不动；悬停提示文案属可观察呈现、由 DESIGN 承载的设计细节——本变更为 DESIGN 演进（东家本次指令即 DESIGN 确认闸口），非「map 不变」类，T-145 承载 DESIGN 变更的测试影响登记与审核锚点（初稿「map 不变的短路变更」自述失准，Standards 审核发现后于本 task 更正）。

## 差距评估

- `src/client.mjs`：骨架模板 `.dap-repo` 的 `title="报告问题"`（`aria-label="报告问题"` 不动）。
- `scripts/check.mjs`：3584 bundle 断言子串 `title="报告问题"` 与 3586 断言描述文案。
- `scripts/acceptance.mjs`：R-01-022 人工步骤「悬停提示为「报告问题」」。
- `e2e/specs/repo-entry.mjs`：3 行头注释、42 行段注释、49 行 title 断言。
- `DESIGN.md`：产品契约「仓库入口·呈现」条目悬停提示文案。

## 收敛方案

- 测试先行：先改 `e2e/specs/repo-entry.mjs` title 断言与 `scripts/check.mjs` 断言子串，运行确认旧实现（title 仍「报告问题」）转红。
- `src/client.mjs`：模板 `title="报告问题，点赞收藏"`（`aria-label` 保持「报告问题」）。
- `DESIGN.md`/`scripts/acceptance.mjs`/e2e 文件头注释同步。
- `pnpm build:client` 重建 `.dsh-plugin/client.js` 并随实现一并提交。

## 测试计划

- `pnpm build:client && pnpm check`（unit/contract 锚定 R-01-022/AC-01）。
- `pnpm test:e2e`（`e2e/specs/repo-entry.mjs::R-01-022/AC-01` 浏览器实测新悬停提示）。
- `python3 tools/agentmap_lint.py --report`；`pnpm verify` 全量门禁。
- 浏览器实测：悬停仓库入口核对提示文案。
- 任务形态说明（更正初版「短路」自述）：悬停提示属可观察呈现，本次为 DESIGN 演进（东家指令确认、PRD 不动），由 T-145 承载 DESIGN 变更的测试影响登记与独立代码审核——实质程序（东家指令确认 + 测试同次同步 + T-145 登记）已合规，仅早期自述用词失准。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| R-01-022/AC-01 | 保持：可访问名称（aria-label「报告问题」）与激活语义不变，仅悬停提示文案演进为「报告问题，点赞收藏」（东家指令） | E2E | update | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`——title 断言随新文案更新 |
| DESIGN | 改写：产品契约「仓库入口·呈现」条目悬停提示文案同步 | UNIT | update | `scripts/check.mjs::R-01-022/AC-01`——bundle 断言 title 子串随实现同步 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：悬停提示「报告问题，点赞收藏」、可访问名称仍为「报告问题」 | `e2e/specs/repo-entry.mjs::R-01-022/AC-01`、`scripts/check.mjs::R-01-022/AC-01` |
| 异常 | 适用：激活行为与激活隔离不随文案变化（不折叠窗格、不改变档位与选中会话） | `e2e/specs/repo-entry.mjs::R-01-022/AC-02` |
| 边界配置 | 适用：深浅主题与移动抽屉形态下悬停提示一致 | `e2e/specs/repo-entry.mjs::R-01-022/AC-03`、`scripts/acceptance.mjs::R-01-022/AC-01` |
| 副作用 | 适用：仅 title 文案变化，可访问名称/链接目标/激活隔离不变 | `e2e/specs/repo-entry.mjs::R-01-022/AC-02`、`scripts/check.mjs::R-01-022/AC-01` |

## 终态与证据

- 实现: `src/client.mjs` 骨架模板 `.dap-repo` 的 `title` 改为「报告问题，点赞收藏」、`aria-label` 保持「报告问题」（可访问名称表达元素用途、悬停提示承载行动召唤的分工由 DESIGN 括注固化）；`DESIGN.md` 产品契约「仓库入口·呈现」条目文案同步；`.dsh-plugin/client.js` 已随实现提交重建（复审增量确认 bundle 与 6dc32fc 一致、后续修正为注释级 no-op）。
- 测试: 实现提交前旧实现转红确认（title 断言对旧文案失败）；`pnpm build:client` 重建后 `node e2e/run.mjs repo-entry` 通过（实测新悬停提示与可访问名称不变）；`pnpm verify:fast` 在实现提交、双轴复审两轮后均全绿（Standards 复审侧独立复跑确认）；全量 `pnpm verify` 采信 T-144 同日基线（本变更仅注释与文案级，行为面为零增量，激活路径零代码改动）。
- DESIGN 对照: 产品契约「仓库入口·呈现」条目悬停提示文案与实现一致，并括注 aria-label/title 分工（可访问名称「报告问题」不变）；追溯索引行 R-01-022 恰一行未动；PRD 未改动（AC-01 未钉悬停提示文案）。
- commit: 6dc32fc
- review:
  - 审核方: Standards reviewer `86cd8cf3-bfd8-4adb-b315-11758584edf0`；Spec reviewer `d8f02554-b89e-4c19-99f1-a773ab64465f`（code-review skill 并行双轴）
  - 目的理解: 悬停提示文案由「报告问题」演进为「报告问题，点赞收藏」（东家指令），可访问名称与激活行为不变；关联约束为 R-01-022/AC-01（可访问名称与位置语义不变、PRD 不动）与 T-139 既有观感语义，验证方式为 e2e title 断言 + check bundle 子串断言 + verify:fast。
  - 执行方式: `code-review` skill，Standards/Spec 双轴并行审核，基线 `4347d53..6dc32fc`（实现提交）+ 工作树增量复审；修复后由同一审核方逐项复审。
  - 问题与修复: Standards 轴 4 项——(1) task 初稿自称「map 不变的短路变更」与同提交改写 DESIGN 的事实不符（自述失准、实质程序合规）：趁 task active 改述为「DESIGN 演进（东家指令即 DESIGN 确认闸口）」并保留更正痕迹；提交信息不 amend，失准由 task 更正与关闭提交承载；(2) 追溯标注缺 T-145：e2e 头注释/段注释/title 断言描述与 check.mjs 断言描述补标 T-145，散文日期注记收敛为稳定 ID；(3) Shotgun Surgery：被 AGENTS.md 原子级联与 CONVENTIONS 测试影响门禁压制，不成立；(4) Duplicated Code（文案字面串四处）：不采纳共享常量（YAGNI，单处文案演进不值得抽象），记为残余建议。Spec 轴 (a) 无缺失、(c) 无疑误；(b) 2 条轻微注释性超范围——断言消息注记收敛为 T-145、DESIGN 括注经复审确认保留（防 aria-label/title 分工被混同）。
  - 复审结论: 两轴均复审通过、无新发现——Standards 确认 4 项处置（硬违规修复 + 标注补齐 + 两项 judgement call 维持现状）并独立复跑 verify:fast 全绿；Spec 确认 spec 钉点逐字保留、语义无漂移、无行为增量。
  - 残余风险与测试缺口: 无行为缺口——title 文案断言（e2e + check bundle 子串）双锚点覆盖；残余均为非阻塞项：可选的 e2e/check 共享文案常量（下次文案演进时再评估）、e2e:3 注释分隔符外观项（已在本关闭提交顺手修复）。
