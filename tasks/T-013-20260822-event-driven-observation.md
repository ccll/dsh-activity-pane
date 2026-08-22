---
doc-type: task
id: T-013
mutation: lifecycle
---

# T-013 事件驱动观察优化

风险等级: standard
状态: active

## 背景与目标

- 背景: `src/client.mjs` 已使用原生 `sessions.list`、`workspaces.list` 与运行中 `session.subscribe`，但服务发现仍使用 250ms 定时器，宿主槽座发现仍使用 500ms 定时器；conversation center 的全子树观察还会把插件自身窗格写入再次排队。
- 目标: 保留活动卡片、冷会话补数、外壳重挂载恢复与 1 秒运行时长显示契约，移除服务发现/frame probe 的后台定时探测，并把 DOM 观察收窄到宿主会话座及结构变化通知。
- 非目标: 不改变活动条目语义、卡片顺序、点击重试、运行时长显示、原生订阅生命周期或移动端视觉契约；不修改 DSH 宿主。

## 差距评估

- 现状基线:
  - `serviceTimer` 每 250ms 探测 `sessions`/`workspaces`，服务就绪后停止。
  - `frameProbeTimer` 每 500ms 探测 conversation center，宿主出现后停止。
  - `clockTimer` 每 1s 刷新运行时长；该计时器是用户可见契约所需，不属于服务状态轮询，本 task 保留。
  - `frameObserver` 以 `childList + subtree` 观察整个 center，插件自身 pane 的 DOM 写入也会触发 `queueSync`。
- 目标差距:
  - 通过 client `inject` 直接获取 `sessions`/`workspaces`，取消服务发现定时器。
  - 用 DOM mutation 通知驱动首次/重挂载发现，移除 frame probe 定时器。
  - 将流式 DOM 观察绑定到 conversation seat，将 center 观察收窄为直接子节点结构变化，避免 pane 子树自激。

## 收敛方案

1. `src/client.mjs` 将 `inject` 扩展为 `connection`、`sessions`、`workspaces`，删除 `serviceTimer` 的创建、清理与服务未就绪分支。
2. 保留事件驱动的宿主发现与重绑定；删除 `frameProbeTimer`，在 body/center 结构 mutation 中调用 `installFrameObserver`。
3. 将当前单一 center observer 拆为 seat 子树 observer与 center 直接子节点 observer；只由 conversation 变化、宿主结构变化或已有原生服务订阅排队重绘。
4. 同步更新 `.dsh-plugin/client.js`，补充静态契约测试，确保无服务/frame probe 定时器且保留 1s clock 与运行中 session 订阅。

## 测试计划

- `pnpm build:client && pnpm check`
- `python3 tools/agentmap_lint.py --report`
- `git diff --check`
- 人工验收: 槽座延迟出现、外壳重挂载、运行中多会话实时更新、会话结束退订、移动端抽屉、卡片点击与 DOM 不自激。
- 性能观察: 插件启用后确认不再存在 250ms/500ms 常驻探测；运行中仅保留单一 1s 可见时钟，session/list/workspace/DOM 变化才触发重绘。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：服务已就绪、运行会话推送与卡片更新是主路径 | `scripts/check.mjs#R-02-004/AC-02`、`src/client.mjs::installServiceSubscriptions`、`src/client.mjs::syncLiveness` |
| 异常 | 适用：服务或 conversation 槽座延迟/重挂载不能报错或依赖定时探测 | `scripts/acceptance.mjs#R-02-002/AC-01`、`src/client.mjs::installFrameObserver` |
| 边界配置 | 适用：无运行会话时不启动 clock；移动端抽屉仍按断点工作 | `scripts/check.mjs#R-01-009/AC-03`、`src/client.mjs::syncLiveness`、`src/client.mjs::onResize` |
| 副作用 | 适用：取消探测后不应丢失宿主重挂载恢复，插件自身 DOM 不应造成重复重绘 | `scripts/check.mjs#R-02-003/AC-02`、`src/client.mjs::cleanup`、`src/client.mjs::installFrameObserver` |
| 性能 | 适用：删除 250ms/500ms 探测，减少 center 自激 mutation 到重绘的路径 | `scripts/check.mjs#R-02-004/AC-02`、`src/client.mjs::queueSync`、`src/client.mjs::installFrameObserver` |
| 可观测性 | 适用：卸载必须清理订阅、观察者、时钟与 DOM | `scripts/acceptance.mjs#R-02-004/AC-01`、`src/client.mjs::cleanup` |

## 终态与证据

实现: 待完成
测试: 待完成
DESIGN 对照: 待完成
commit: 待完成
review: 待完成
