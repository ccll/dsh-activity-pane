---
name: dap-contributing
description: 第一次为本仓库改代码、准备开 PR 时先读：认领协议、分支命名、PR 规则与谁合并
---

# dap-contributing

本技能管从认领到合并的流程边界。人读的完整指南在 `CONTRIBUTING.md`，本文件是 agent 的入口摘要。

- 工作单元是 GitHub issue；认领＝提 PR，不需要额外登记。
- 从 origin/main 拉分支，命名 claim/<issue>-<slug>。
- 首提交必须是空提交：`git commit --allow-empty -m "claim: #N"`。
- 开 draft PR：标题 `<区域>: <用户或调用方现在得到什么>`，正文首行 `Fixes #N`。
- 同 issue 下编号最小的开放 PR 胜出；后来者关自己的 PR 并在评论说明。
- 72 小时无推送可留言接管，详见 `dap-takeover`。
- agent 永不合并；合并由项目属主执行 `gh pr merge --squash --match-head-commit`。
- 合并门禁：PR 必填、属主批准、权威门禁全绿、`approved-for-ci` 标签、与主干同步、评审线程已解决。
- 格式裁决是 `node tools/xtask.mjs policy`；权威门禁是 `node tools/xtask.mjs ci`，文字冲突以命令为准。
- 提交标题 `emoji 中文类型(scope): 中文结果描述`，正文三段 `## 原因`、`## 影响`、`## 取舍`。
- 实现、修正、收口的提交在正文引用 issue 号，保证 `git blame` → PR → issue 可反查。
- 一个 issue 一个话题；拆开比堆在一起便宜。
- 项目做什么、到哪了看 `docs/roadmap.md`；现在怎么实现看 `docs/architecture.md`。
- 流程换代缘由与迁移映射见 `docs/rfcs/0001-replace-agentmap-with-solidcraft-workflow.md`。
