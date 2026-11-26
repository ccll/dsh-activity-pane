---
doc-type: rationale
mutation: append-only
id: C-006
owner: agent
---

# C-006 最近卡片「最后做的事情」取列表投影 timelineUserMessages，投影缺失时优雅降级

日期: 2026-08-21

#### 上下文
东家要求历史会话卡片的信息更全面：补上工作区名称与「最后做的事情」。工作区名称缺口在于 `buildRecent` 已计算 `workspaceTitle` 但最近卡骨架从未渲染徽标（收口 R-01-003/AC-03 的实现缺口）。「最后做的事情」需要新的数据源：CLI 侧会话摘要不携带消息正文，运行期对非活动会话的 `binding().session` 是 cold（窗口未开、无 nodes），无法在不打开会话窗口的前提下读取最近一条用户消息；而宿主 `sessions.list` 条目本就推送 `projectionValues`（含第三方时间轴插件 `dsh-session-timeline` 注册的 `timelineUserMessages`：最近用户消息文本 + 回复预览）。

#### 决策
- 工作区名称：在最近卡骨架补 `.dap-workspace` 徽标元素，已有 `workspaceTitle` 直接上卡（实现缺口收口，不新增数据流）。
- 最后做的事情：新增核心纯函数 `lastActivityPreview(projectionValues)`，从列表条目 `projectionValues.timelineUserMessages` 取 **`seq` 最大条目**（不假设数组顺序）的用户消息文本（`text`），缺失时回退该条回复预览（`reply`），经 `cleanPreview` 截断后上卡；并入 `cardSignature` 触发去重重绘。
- 该投影经既有列表订阅推送（无新增轮询、无自有路由），仅有该投影的插件未装入时不产生该 key，卡片退化为仅显示时间；以下一次渲染的自然降级为边界，不报错。
  - 命名与语义保持「可留意」，但对缺失的容忍完全兼容 R-02-001「未装第三方插件仍可用」：窗格整体功能不依赖该 key 存在。

#### 被否方案及原因
- 原生 `sessionStats` 摘要（共 X 轮 · Y 步）：纯原生、无第三方依赖，但只是工作量统计，不是「最后做了什么」的消息级内容，与东家意图不符。
- 打开发行会话读取最近消息节点：能拿到消息正文，但要求对每个历史会话执行 `session.open()`/拉历史分页，违背「不主动轮询、轻量常驻」的既有纪律，且一次性拉取多会话历史开销不可控。
- 仅靠 `updatedAt` 时间行：已在卡片上，不构成「最后做的事情」。

#### 影响面
R-01-010 / 活动状态模型、R-01-010 / 窗格渲染器；R-01-003/AC-03 / 活动状态模型、R-01-003/AC-03 / 窗格渲染器
