# 技能

SolidCraft 工作流下按任务读一件技能：先读 `AGENTS.md` 路由，再进对应目录。每件技能 ≤3600 字节，由 `node tools/xtask.mjs skills` 校验。

| 技能 | 何时读 |
|---|---|
| [dap-contributing](.agents/skills/dap-contributing/SKILL.md) | 第一次改代码、认领 issue、准备开 PR |
| [dap-file-pr](.agents/skills/dap-file-pr/SKILL.md) | 本地改动已就绪、要开或补齐 PR |
| [dap-babysit-pr](.agents/skills/dap-babysit-pr/SKILL.md) | PR 已推送，要盯 CI、回评审、rebase |
| [dap-full-stop](.agents/skills/dap-full-stop/SKILL.md) | 收口 PR，判定完成并交给属主 |
| [dap-takeover](.agents/skills/dap-takeover/SKILL.md) | 别人的 PR 超 72 小时无推送，要接手 |
| [dap-host-compat](.agents/skills/dap-host-compat/SKILL.md) | 改宿主侧、壳层相关代码或宿主升级 |
| [dap-client-bundle](.agents/skills/dap-client-bundle/SKILL.md) | 改 `src/`，要重建或校验客户端产物 |
| [dap-e2e](.agents/skills/dap-e2e/SKILL.md) | 加改 e2e spec、跑 e2e、定位 e2e 失败 |
| [dap-unit-checks](.agents/skills/dap-unit-checks/SKILL.md) | 加改 `scripts/check.mjs` 的断言 |
| [dap-ui](.agents/skills/dap-ui/SKILL.md) | 改布局、显示档位、移动抽屉、滚动锚、token |
| [dap-performance](.agents/skills/dap-performance/SKILL.md) | 改渲染/折叠/派生路径，做性能 A/B 或预算 |
| [dap-resume](.agents/skills/dap-resume/SKILL.md) | 改断流恢复、回填、完成确认同步 |
| [dap-jobs](.agents/skills/dap-jobs/SKILL.md) | 改后台任务订阅、任务子卡或「后台 ×N」徽标 |
| [dap-release](.agents/skills/dap-release/SKILL.md) | 准备发版、改版本或 tag、排查 npm 发布 |
| [dap-tests](.agents/skills/dap-tests/SKILL.md) | 加改测试、更新 golden、操作只减清单 |
| [dap-acceptance](.agents/skills/dap-acceptance/SKILL.md) | 观感/真机验收、写运行回执与人工清单 |
