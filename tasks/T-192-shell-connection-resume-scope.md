---
doc-type: task
mutation: lifecycle
id: T-192
---

# T-192 壳层连接自愈触发面收窄——桌面回前台不再主动重建连接

状态: active
类型: 缺陷修复
风险等级: minor
风险面: 无（收敛 T-191 通道的触发面，不改壳层连接 API 消费方式、不改呈现承诺）
关联需求: R-01-001/AC-03（会话状态变化自动更新窗格）——T-191 恢复移动挂起场景的兑现，本 task 收敛其在桌面形态的误触发面
决策依据: 东家桌面实测反馈（2026-11-12）——切 tab 30s+ 回前台全窗格刷新、标题集体变工作区名再恢复，体验差；真机探针实证（e2e/probe-real.mjs，只读观测运行中 :3080）

## 背景与目标

T-191 上线后，东家桌面切 tab 约 30s+ 回前台观察到全卡刷新。真机探针实锤根因链：回前台 hidden 35s（≥30s 阈值）触发 `connection.reconnect()` → 壳层 generation 重建 → 快照重放中间态里全部 30+ 张卡的 `displayTitle` 同时退化为工作区派生名（探针 @36462ms 帧：`「鼠标托盘建模」→「homelab」`、`「推进项目进展」→「docsim」` 全量发生），数据稳定后恢复真标题——插件忠实渲染了壳层的重建中间态；对照实验隐藏 25s（低于阈值、不触发 reconnect）回前台后标题变更为零。半开死连接是移动 OS 挂起特有的失效形态，桌面浏览器由壳层既有 close/online 路径兜底，桌面主动 reconnect 是纯代价。

目标：把 `connection.reconnect()` 触发面收窄到移动 PWA 形态（standalone 显示模式），桌面切 tab 回前台不再主动重建壳层连接；移动端自愈语义保持。

## 差距评估

- PRD：无变化。
- SOLUTION：`运行时、并发与失败语义` 的回前台自愈条目补「触发面限于移动 PWA 形态」限定，随实现同笔。
- 代码：src/client.mjs `resumeShellConnection` 增加平台门控；e2e 探针结论沉淀；SOLUTION/E2E 契约同步。

## 收敛方案

1. 平台门控：`resumeShellConnection` 入口以「移动形态」判定短路——`(hover: none) and (pointer: coarse)` 复合查询命中（手机/平板的任何浏览器形态，触屏笔记本主输入为鼠标不命中、桌面安装版 PWA 也不命中）或 `navigator.standalone === true`（iOS PWA 专属信号）；桌面浏览器直接跳过重建——不引入 UA 嗅探、不新增 inject 依赖。审核 judgement call 落实：纯 standalone 口径会把桌面安装版 PWA 误纳入（同为 standalone 显示模式），hover/pointer 联合判定把桌面形态（无论浏览器或安装版 PWA）整体排除。
2. 阈值/seam/记账/去重逻辑不变；e2e connection-resume spec 以 addInitScript 模拟 standalone 显示模式承载移动触发语义（正例四场景不变），新增 connection-resume-desktop spec 以桌面形态（无 mock）钉住长隐藏不触发的负例。
3. SOLUTION 同步；check.mjs 契约断言更新。
4. 无分叉点: 东家拍板方案即本通道范围；平台门控取 display-mode: standalone 为唯一判定（触屏笔记本误报无害——多一次重连无中间态风暴的根因是 reconnect，不在平台判定侧），无第二认真候选。

## 测试计划

- e2e connection-resume spec 改造：addInitScript 模拟 standalone 显示模式承载移动触发正例（四场景语义不变）；新增 connection-resume-desktop spec 以桌面形态钉住「长隐藏不触发 reconnect」负例。
- `pnpm verify` 全量 + perf:ab --check。
- 测试影响：SOLUTION 机制文字同步，登记 SOLUTION update 行。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层表述限定：回前台自愈条目补「触发面限于移动 PWA 形态（standalone 显示模式）」与桌面纯代价的探针实证结论——机制文字，无承诺变化 | UNIT/E2E | update | 行为由 `e2e/specs/connection-resume.mjs::connectionResume`（standalone 模拟）与 `e2e/specs/connection-resume-desktop.mjs`（新增负例）承载 |
| R-01-001/AC-03 | 不变（通道适用面收窄） | E2E | 保留 | 移动 PWA 自愈语义由 connection-resume（standalone 模拟）保持；桌面切 tab 由壳层既有路径兜底（connection-resume-desktop 负例） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：移动 PWA 形态下回前台自愈语义保持 | `e2e/specs/connection-resume.mjs::connectionResume`（standalone 门控下移动形态仍触发，经 matchMedia mock 承载） |
| 异常 | 适用：桌面 standalone 判定失败时通道降级缺席，不影响其余自愈 | `scripts/check.mjs::resumeShellConnection` 契约断言 |
| 边界配置 | 适用：桌面切 tab 回前台零重建（对照实验已证零标题变更）、移动 PWA 触发 | `e2e/specs/connection-resume.mjs::connectionResume` 负例改造 |
| 副作用 | 适用：桌面长隐藏回归不再有重连握手与数据中间态；移动端行为不变 | `e2e/specs/connection-resume.mjs::connectionResume` |
| 兼容性 | 适用：standalone 判定覆盖 iOS/Android PWA；桌面浏览器 tab 切换不误伤 | `scripts/check.mjs::resumeShellConnection` 契约断言 |

## 自查清单

- 边界：PWA standalone 命中触发；桌面浏览器 tab 切换不触发；混合设备（触屏笔记本）display-mode 非 standalone 不触发。
- 异常路径：matchMedia 不可用（极旧内核）→ 视为非移动，通道降级缺席——与软依赖降级同语义。
- 回归影响：T-191 移动自愈语义不变；桌面 acks/busy 自建 SSE 回前台重建与渲染管线补齐不受影响（独立通道）。

## 终态与证据
