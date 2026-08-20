---
doc-type: todo
mutation: inbox
owner: 双方
---

# TODO — 想法收集箱

## 条目

- [需求候选] 会话级操作（重命名、取消、队列编辑、直接响应等待项）作为 v1 后的候选增强（东家尚未确认）。
- [维护想法] 窗格宽度拖拽与折叠把手：v1 为固定宽度，后续可贴合外壳 details 槽语义增强（见 DESIGN 边界与对外契约）。
- [维护想法] GUI 交互验收暂以 scripts/acceptance.mjs 人工清单承接；待引入浏览器 E2E 基建后迁移为自动化测试（见 DESIGN 可派生验证）。
- [维护想法] 热更依赖 `build()` 的原地写入以维持 profile `file:` 硬链接；若未来改用原子性 rename/新 inode 的构建链，需相应更新同步机制（见 README 热更开发工作流）。

