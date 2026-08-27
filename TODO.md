---
doc-type: todo
mutation: inbox
owner: 双方
---

# TODO — 想法收集箱

## 条目

- [需求候选] 子会话显示一条最新动作，样式与母会话相同。
- [缺陷线索] 后台会话的 card 无法得到更新，一直停留在固定内容；只有当前选中的会话的 card 内容会持续更新。（与"历史卡标题滞留首条消息"同根因方向：渲染循环异常冻结；异常隔离修复后需东家复验本条是否痊愈）
- [缺陷线索] 已归档会话仍出现在窗格最近历史区（左边栏按 archived 隐藏；buildRecent 无归档过滤，且 sessions.list 快照是否携带归档标记待查）。
- [缺陷线索] 进度条的进度计算有误，与 answer-pet 不匹配；需要重新评估 answer-pet 的进度条算法。
- [需求候选] 会话级操作（重命名、取消、队列编辑、直接响应等待项）作为 v1 后的候选增强（东家尚未确认）。
- [需求候选] 窗格宽度（默认 280）与折叠状态可配置化/设置项（东家提及，未定）。
- [维护想法] 窗格宽度拖拽与折叠把手：v1 为固定宽度，后续可贴合外壳 details 槽语义增强（见 DESIGN 边界与对外契约）。
- [需求候选] 允许用户在限定范围内拖放调节 pane 的宽度。
- [维护想法] 运行卡时长实时计算位于 DOM 层、无 Node 锚点；后续抽 `elapsedAt(startTime, now)` 纯函数或引入浏览器 E2E（独立审核提示，见 T-001 review）。
- [需求候选] 移动端抽屉内激活卡片跳转会话后自动收起抽屉（现行行为保持展开，需东家确认预期）
- [维护想法] 上架 dsh-market：目录在 awesome-dsh-plugin 仓库（PR 一条 data/plugins/ccll__dsh-activity-pane.yml，需仓库满 1 天、≥10 commits、加 dsh-plugin topic）；可选发布 npm（需移除 private:true 并补 repository 字段）。
- [维护想法] buildRecent 位置参数已达 9 个（调用点出现 undefined/{}/[]/null/null 占位串）；后续可将后 6 个归并为 options 对象（T-057 独立审核提示，既有模式延续、不阻塞）。
- [缺陷线索] E2E 观测到宿主 sessions 服务偶发首推停滞：页面加载后 `sessions.list` 快照永久滞留 pending（窗格「加载中…」不消退），浏览器控制台/网络/服务端 stderr 均无错误；停滞绑定服务端实例（重载同实例不一定恢复，换实例即恢复），疑似冷启动竞态。E2E 侧已做两级恢复（openApp 12s 停滞重载一次 → run.mjs 换全新环境重试一次）；根因需查宿主 client-runtime SessionManager.refreshList 的首推链路（2026-08-27，复现率约 10-20%）。
