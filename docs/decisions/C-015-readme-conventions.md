---
doc-type: rationale
mutation: append-only
id: C-015
owner: agent
---

# C-015 README 只面向终端用户，开发工作流规范移入 CONVENTIONS

日期: 2026-08-24

#### 上下文
README 此前混写终端用户说明与开发说明（本地开发安装、构建/检查/热更命令、热更工作流与注意事项）；东家要求 README 只保留针对终端用户的说明，不再包含开发相关信息。

#### 决策
将 README「安装与开发」整节迁移至 CONVENTIONS 新增「构建与开发工作流」章节（本地开发安装、build/check/dev:watch 命令、热更流程与注意事项），README 删除该节，仅保留产品简介、感谢与协作声明、相比 answer-pet 的变化与状态。

#### 被否方案及原因
- 安装命令保留在 README 并改写为面向用户：当前唯一安装方式是从源码仓库以 `link:` 挂载（开发安装），尚无面向终端用户的发布安装方式，写入 README 可能误导为正式分发渠道。

#### 影响面
无 R-ID；CONVENTIONS / README
