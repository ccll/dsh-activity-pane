---
name: dap-tests
description: 新增或改动测试、更新 golden、操作只减清单时读：放置规则与清单纪律
---

# dap-tests

本技能管测试放哪里、golden 怎么改、只减清单怎么动。质量裁决靠可执行 oracle，不靠追文档。

- 放置：行为回归进既有区域文件——`scripts/check.mjs` 对应节，或 e2e/specs/ 下的区域 spec。
- 不新建 per-bug 测试文件；27 个 spec 是当前区域划分，新增文件要先说明既有区域为何装不下。
- 分层：纯函数与契约进 `scripts/check.mjs`，用户可观察路径进 spec，观感与真机进人工验收。
- 一个 spec 一个场景；判据先行，写成可判定的文字、几何、URL 或事件。
- golden：`e2e/mock-llm.mjs` 剧本确定性，spec 的计数与终态记进 golden。
- 改 golden 必须在 PR 正文解释为什么；不解释的 golden 变更视为放宽期望。
- 不许为通过而放宽期望、忽略用例或改写测试输入；判据错先改判据，判据对就改代码。
- 门禁只强制重新审视证据，不自动生成、改写或删除测试。
- 只减清单只能变短：新增项是错误，删项是进展；`node tools/xtask.mjs ratchet` 校验活性与到期。
- 清单包含：host-shims.txt（每代宿主补丁点）、uncovered-specs.txt（原因与到期）、manual-acceptance.txt（原因与到期日，过期即失败）。
- bundle-bytes.json 与 perf-budget.json 的数字只能变小。
- 清单排序与命名用 `node tools/xtask.mjs lists --fix`。
- 新检查要被权威门禁执行（`node tools/xtask.mjs ci`）；只在本地手工跑的不算门禁。
