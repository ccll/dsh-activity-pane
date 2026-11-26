---
name: dap-resume
description: 改断流恢复、回填、完成确认同步，或排查挂起后状态不更新时读
---

# dap-resume

本技能管三条恢复通道与它们的契约边界：连接自愈、懒回填、完成确认同步。

- 通道一：acks/busy 自建 SSE 回前台无条件重建；渲染管线按最新窗口补齐派生。
- 通道二：隐藏时长达到阈值时，移动形态经软依赖 `connection.reconnect()` 重建壳层连接。
- 桌面形态不主动重建壳层连接：半开死连接是移动挂起特有，桌面由宿主既有 close/online 兜底。
- 平台门控与阈值判定在长隐藏评估之后、软依赖之前短路；见 `e2e/specs/connection-resume.mjs` 与 `e2e/specs/connection-resume-desktop.mjs`。
- 接缝走 URL 参数：`dap-e2e-resume-reconnect-ms`、`dap-e2e-list-delay`、`dap-e2e-model-delay`。
- 通道三：宿主侧 `reconcileTurnStats` 按 `watermarkSeq` 懒回填，重启后按事件全量重放自愈。
- 客户端回填只按 id 补缺，不用陈旧空快照整量替换；`e2e/specs/busy-backfill-race.mjs` 钉住。
- 完成确认：宿主 `acks` 表 + 快照 + SSE patch，跨客户端同步、刷新不丢；`e2e/specs/completion-sync.mjs`。
- 顺序即契约：SSE 数据不得旧于同刻 GET；改动要同时说明两端写什么、信什么。
- 不许用轮询替代推送；恢复路径不得整页 reload。
- 新增 e2e 接缝必须有使用点，否则删掉。
