---
name: dap-file-pr
description: 已经在本地产出改动、要开 PR 或补齐 PR 标题正文时读：具体步骤与格式
---

# dap-file-pr

本技能管把本地工作变成一个可评审的 PR：分支、空提交、draft、标题与正文。

- 先确认分支与首提交：`git log --oneline origin/main..HEAD` 应见 `claim: #N`。
- 本地门禁先绿：`node tools/xtask.mjs ci`，编辑循环可用 `node tools/xtask.mjs ci --fast`。
- 提交前重建并暂存客户端产物：`pnpm build:client`，再把 `.dsh-plugin/client.js` 一并 `git add`。
- 推送：`git push -u origin claim/<issue>-<slug>`。
- 开 PR：`gh pr create --draft --title "<区域>: <结果>" --body-file <模板文件>`。
- 正文首行 `Fixes #N`；没有这一行合并不会自动关 issue。
- 标题写用户在改动后得到什么，不写机制；不含 issue 号，不写 WIP。
- 正文写三段：可观察现象、做了什么、怎么验证（命令与结果，不只写"测过了"）。
- 动了 golden 或只减清单时，正文必须解释为什么，见 `dap-tests`。
- 文字与提交格式用中文，与既有历史一致。
- 全绿后再转正：`gh pr ready`；合并仍由属主做，见 `dap-full-stop`。
