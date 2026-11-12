---
doc-type: task
mutation: lifecycle
id: T-192
---

# T-192 壳层连接自愈触发面收窄——桌面回前台不再主动重建连接

状态: active
类型: 缺陷修复
风险等级: major
升档说明: 立项预估 minor；lint 实测语义行 101 > 阈值 50，按「评审中发现行为面超出档位假定就地升档」纪律改完整评审后重关
风险面: 无（收敛 T-191 通道的触发面，不改壳层连接 API 消费方式、不改呈现承诺）
关联需求: R-01-001/AC-03（会话状态变化自动更新窗格）——T-191 恢复移动挂起场景的兑现，本 task 收敛其在桌面形态的误触发面
决策依据: 东家桌面实测反馈（2026-11-12）——切 tab 30s+ 回前台全窗格刷新、标题集体变工作区名再恢复，体验差；真机探针实证（e2e/probe-real.mjs，只读观测运行中 :3080，探针为一次性工具已删除，结论沉淀于本文件与提交正文）

## 背景与目标

T-191 上线后，东家桌面切 tab 约 30s+ 回前台观察到全卡刷新。真机探针实锤根因链：回前台 hidden 35s（≥30s 阈值）触发 `connection.reconnect()` → 壳层 generation 重建 → 快照重放中间态里全部 30+ 张卡的 `displayTitle` 同时退化为工作区派生名（探针 @36462ms 帧：`「鼠标托盘建模」→「homelab」`、`「推进项目进展」→「docsim」` 全量发生），数据稳定后恢复真标题——插件忠实渲染了壳层的重建中间态；对照实验隐藏 25s（低于阈值、不触发 reconnect）回前台后标题变更为零。半开死连接是移动 OS 挂起特有的失效形态，桌面鼠标主输入形态由连接层自身的关闭/错误路径承载，桌面主动 reconnect 是纯代价。

目标：把 `connection.reconnect()` 触发面收窄到触屏形态（DOMAIN 登记口径：主输入无 hover 且主指针为触屏），桌面切 tab 回前台不再主动重建壳层连接；移动端自愈语义保持。

## 差距评估

- PRD：无变化。
- SOLUTION：`运行时、并发与失败语义` 的回前台自愈条目补「触发面限于触屏形态」限定，随实现同笔；DOMAIN 登记「触屏形态」词条（输入能力口径，与视口口径的移动断点相区分）。
- 代码：src/client.mjs `resumeShellConnection` 增加平台门控；e2e 探针结论沉淀；SOLUTION/E2E 契约同步。

## 收敛方案

1. 平台门控：`resumeShellConnection` 入口以「触屏形态」判定短路——`(hover: none) and (pointer: coarse)` 复合查询命中（手机/平板以触屏为主输入的任何浏览器形态）才触发；桌面鼠标主输入形态（桌面浏览器、桌面安装版 PWA、触屏笔记本、平板外接指针设备）一律跳过重建——不引入 UA 嗅探、不新增 inject 依赖。研判落点（评审两轮收敛的最终决定）：初版曾取 `display-mode: standalone` 唯一判定，被轻量双轴评审以「桌面安装版 PWA 同为 standalone 显示模式、刷新风暴复现」否决；standalone 信号因无测试锚点且复合查询已完整覆盖移动形态而整体移除，最终口径为复合查询单判定。
2. 阈值/seam/记账/去重逻辑不变；e2e connection-resume spec 以 addInitScript 覆写 matchMedia 使触屏形态复合查询命中，承载移动触发语义（正例四场景不变）；新增 connection-resume-desktop spec 以桌面形态（无 mock，主输入有 hover）钉住长隐藏不触发的负例。两 spec 的合成 hidden→visible 对与自愈标记常量提入 e2e/helpers.mjs 共享。
3. SOLUTION/DOMAIN 同步；check.mjs 契约断言更新并锚定门控调用点。

## 测试计划

- e2e connection-resume spec 改造：matchMedia mock 承载触屏形态触发正例（四场景语义不变）；新增 connection-resume-desktop spec 以桌面形态钉住「长隐藏不触发 reconnect」负例。
- `pnpm verify` 全量 + perf:ab --check（轻负载窗 fail-closed 按既有口径以总 CPU 对照收口）。
- 测试影响：SOLUTION/DOMAIN 机制文字同步，登记 update 行。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层表述限定：回前台自愈条目补「触发面限于触屏形态」与桌面纯代价的探针实证结论——机制文字，无承诺变化 | UNIT/E2E | update | 行为由 `e2e/specs/connection-resume.mjs::connectionResume`（触屏形态模拟）与 `e2e/specs/connection-resume-desktop.mjs`（新增负例）承载 |
| DOMAIN | 新词条「触屏形态」（输入能力口径，与移动断点相区分） | UNIT | update | `scripts/check.mjs` 契约断言锚定复合查询与门控调用点 |
| R-01-001/AC-03 | 不变（通道适用面收窄） | E2E | 保留 | 移动形态自愈语义由 connection-resume（触屏形态模拟）保持；桌面不重建由 connection-resume-desktop 负例承载 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：触屏形态下回前台自愈语义保持 | `e2e/specs/connection-resume.mjs::connectionResume`（触屏形态 mock 下移动触发四场景通过） |
| 异常 | 适用：matchMedia 不可用时通道降级缺席，其余自愈不受影响（门控落点在软依赖读取之前、不触及 acks/busy 与渲染通道） | `scripts/check.mjs::isTouchFormFactor`（触屏形态契约断言，含调用点锚定） |
| 边界配置 | 适用：桌面切 tab 回前台零重建（对照实验已证零标题变更）、触屏形态触发、桌面安装版 PWA 与触屏笔记本经 hover/pointer 口径排除 | `e2e/specs/connection-resume-desktop.mjs::connectionResumeDesktop`（桌面零重建负例） |
| 副作用 | 适用：桌面长隐藏回归不再有重连握手与数据中间态；触屏形态行为不变 | `e2e/specs/connection-resume.mjs::connectionResume` 与 `e2e/specs/connection-resume-desktop.mjs::connectionResumeDesktop` 正负例互补 |
| 兼容性 | 适用：复合查询覆盖手机/平板各浏览器形态（含 Android PWA；iOS 由同查询覆盖）；桌面鼠标主输入形态不误伤 | `scripts/check.mjs::isTouchFormFactor` 契约断言 + `e2e/specs/connection-resume-desktop.mjs::connectionResumeDesktop` 负例 |

## 自查清单

- 边界：手机/平板触屏主输入命中触发；桌面浏览器与桌面安装版 PWA 不触发；触屏笔记本（鼠标主输入）与平板外接指针设备不触发。
- 异常路径：matchMedia 不可用（极旧内核）→ 视为非触屏，通道降级缺席——与软依赖降级同语义。
- 回归影响：T-191 触屏形态自愈语义不变；桌面 acks/busy 自建 SSE 回前台重建与渲染管线补齐不受影响（独立通道）。
- 残余风险（登记）：桌面长休眠（>30s）真死连接不经本通道自愈，依赖壳层连接层自身的关闭/错误路径；移动端「请求桌面版网站」形态（主输入 hover 语义按桌面处理）被排除；平板外接指针设备后 matchMedia 实时判定翻转，自愈静默失效——三项均与「桌面主动重建是纯代价」的探针实证权衡一致，登记 TODO 备忘。

## 终态与证据

- 实现: src/client.mjs `isTouchFormFactor()` 平台门控（`(hover: none) and (pointer: coarse)` 复合查询单判定，判定不可用降级缺席）短路 `resumeShellConnection` 入口（软依赖读取之前），阈值/seam/去重语义不变；e2e connection-resume 以 matchMedia mock 承载触屏形态正例（四场景不变），新增 connection-resume-desktop 桌面负例（seam=0 + 长隐藏断言零重建零新连接世代），合成 hide/restore 对与自愈标记提入 e2e/helpers.mjs 共享；check.mjs 新增触屏形态契约断言并以 `if (!isTouchFormFactor()) return;` 锚定门控调用点，同时删除评审发现的 T-191 断言误粘贴重复。
- 测试: `pnpm check` 全绿；`e2e/specs/connection-resume.mjs` 与 `e2e/specs/connection-resume-desktop.mjs` 实跑通过（正例钉触屏形态触发语义、负例钉桌面零重建；口径三轮迭代后复跑均绿）；全量 `pnpm verify` 24/25 specs 全绿（首轮 completion-sync openApp 超时为偶发，单跑通过；long-list 同型偶发单跑通过）；`pnpm perf:ab --check` 轻负载窗折叠零采样 fail-closed（A/B 折叠采样均 0，断言 NaN 不可靠），按 T-186/T-188/T-189/T-191 既有口径以总 CPU 对照收口并如实登记：事件期 B/A = 0.832、隐藏期 B/A = 1.057（参考项），折叠采样两侧皆零与本 task 不触及折叠路径一致。
- SOLUTION 对照: 壳层推送通道自愈条目补「触发面限于触屏形态」限定并与 `isTouchFormFactor` 实现一致；DOMAIN 新登记「触屏形态」词条；桌面真死连接的承载表述改为「依赖壳层连接层自身的关闭/错误路径」（不虚证壳层内部行为）。
- commit: 454ffe8
- review:
  - 审核方: code-review skill 双轴（Standards 与 Spec 并行独立子代理）+ 先期独立子代理轻量双轴（minor 档预审，其发现全部处置后才触发 lint 升档）
  - 目的理解: T-191 回前台壳层连接自愈在桌面切 tab 场景误触发，generation 重建的快照重放中间态（全卡 displayTitle 短暂退化为工作区派生名，探针逐帧实证）叠加时长跳变构成整窗格刷新风暴；T-192 在不动阈值/seam/去重与软依赖语义的前提下，把触发面收窄到触屏形态，桌面（浏览器与安装版 PWA）切 tab 回前台零重建，移动挂起自愈保持。
  - 问题与修复: 轻量双轴预审 6 条 judgement call 全部处置（桌面安装版 PWA 误报面→复合口径；task 文书与 spec 注释残留→修正；check 断言锚定→改调用点锚定；移动浏览器口径→复合查询覆盖）。lint 实测语义行 101>50 就地升档 major 后，完整评审两轴共 2 条 hard violation + 6 条 judgement call：终态证据 minor 残句与 major 冲突→按本节三标签重写；task 残留 standalone 被否口径（无分叉点行/测试计划/验证矩阵/自查清单）→按最终复合口径改写；check.mjs T-191 断言误粘贴重复→删除；断言未锚定调用点→改 `if (!isTouchFormFactor()) return;` 锚定；DOMAIN 术语碰撞（移动形态 vs 移动端点/移动断点）→DOMAIN 登记触屏形态词条并全局更名 isTouchFormFactor；navigator.standalone 分支零测试锚点→删除，判定收敛为复合查询单口径；e2e 同形逻辑重复→提入 helpers 共享；验证矩阵锚点错位与兼容行机制表述错误→改为负例 spec 锚点并修正口径；「桌面由壳层 close/online 兜底」仓内不可证→SOLUTION 改为「依赖壳层连接层自身的关闭/错误路径」表述；残余风险三件（桌面长休眠真死连接、移动端请求桌面版网站形态、平板外接指针静默失效）→自查清单与 TODO 登记。
  - 复审结论: 修复后两 spec 复跑通过、check 全绿，两轴 hard violation 全部消解、judgement call 全部处置，non-blocking 通过（code-review skill 双轴独立子代理，Standards 轴与 Spec 轴均复核修复落点）。