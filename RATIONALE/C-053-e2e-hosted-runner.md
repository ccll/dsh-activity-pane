---
doc-type: rationale
mutation: append-only
id: C-053
owner: agent
---

# C-053 E2E 顺序执行以适配 hosted runner 资源

日期: 2026-08-28

#### 上下文
C-049 依据本地单 spec 约 272MB 与双 worker 约 118～144s 的结果，假定 GitHub hosted runner 可稳定承载两套完整 dsh web + Chromium。首次 hosted run 实测 8/10 失败、16 次恢复；C-051 单等待本地双 worker 仍 4/10 失败、11 次恢复；C-052 的 32s + 12s 双代策略本地双 worker仍 2/10 失败、4 次恢复。相反，T-085 已记录 coherent rc.7 顺序执行 10/10、226.119s、0 次恢复。资源竞争会触发 rc.7 sessions 首推失败，而失败后无自愈；继续并发换来的墙钟收益不足以抵消门禁失真。

#### 决策
- 废弃 C-049 的固定 2 worker；E2E runner 固定顺序执行，每次只启动一套 dsh web + Chromium。
- 保留 C-052 的首代完整等待、一次 post-timeout reload 与一次 fresh-environment recovery，覆盖 rc.7 已知无自愈边界。
- 不提供并发配置：本地和 hosted 保持同一负载模型；只有升级到修复 sessions 自愈的 DSH 并获得 hosted 连续数据后才重新评估并发。

#### 被否方案及原因
- hosted 设 1、本地保留 2：门禁负载模型分叉，本地难以复现 hosted 的资源问题。
- 二次等待继续加长：两套宿主并发会制造更多 transport timeout，增加等待不能消除竞争源。
- 动态按 CPU/内存决定：不同机器走不同顺序，复现和性能基线继续漂移。

#### 影响面
R-01-002、R-01-008、R-02-002 / E2E 验证基建、验证门禁
