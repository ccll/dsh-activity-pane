---
doc-type: task
mutation: lifecycle
id: T-157
---

# T-157 档位资源纪律：紧凑档数据面裁剪与渲染面跳写

状态: completed
关联: R-01-024（新增）、R-01-010/AC-09（档位限定注记）、C-084
风险等级: standard

## 背景与目标

- 背景: 东家查证确认三档显示档位仅为 CSS 呈现差异，后台数据通道与渲染派生不随档位变化；移动网络与移动设备上带宽与运算负担与完整档相同。东家立项（2026-10-08，三闸确认：PRD 草案通过、裁剪跟随档位全平台生效、模型目录读取纳入门控）。
- 决策依据: C-084——裁剪以档位为唯一输入，不探测设备或网络。
- 目标: 紧凑档下主会话不建立或保持会话日志窗口、不发起日志分页深翻与无可见消费者的一次性模型目录读取；中间/紧凑档不写进度行与 token 统计行、紧凑档不构建时间线内容；切回更高档位经既有渐进语义恢复。

## 差距评估

- `src/client.mjs` `captureSessionLog`：对每个可见会话无条件订阅 eventSource 事件流并发起 `session.open()` 水合——紧凑档下主会话标题行不消费任何日志数据，纯浪费。
- `src/client.mjs` `loadNativeDetails`：深翻（`pagedHistoryEvents`，默认无页数上限）与模型目录订阅/一次性 load 无档位条件。
- `src/client.mjs` 渲染层：紧凑档时间线仍全量构建 DOM 后由 CSS 隐藏；中间/紧凑档进度行与 token 统计行仍写入。
- `src/core.mjs`：无门控判定纯函数。
- 已有基础：渲染签名含档位分量（R-01-021/AC-08），切档自然触发一轮重渲染；详情记账随可见性清理、重回可见允许重试（R-01-014/AC-05）。

## 收敛方案

1. `src/core.mjs` 新增纯函数 `logWindowSuppressed(densityLevel, isSubagent)`：经 `normalizeDensity` 归一后，紧凑档且非子代理为真；子代理恒不裁剪（标题行模型上下文可见，R-01-012/AC-17）。
2. `src/client.mjs` 门控（用时校验，防切档在途竞态）：
   - `captureSessionLog` 入口：主会话且紧凑档直接返回——不订阅事件流、不发起 `session.open()`、不读窗口快照。
   - `loadNativeDetails`：紧凑档主会话跳过深翻与模型目录订阅/一次性 load（`ensureCatalogGroups` 部署级目录不裁剪——子代理溯源解析仍需）。
   - `onDensityClick`：进入紧凑档时对既有主会话日志窗口先 unsubscribe 再除名（`logSourceSubs`）；`detail.log` 置空、非当前会话 dispose 释放底层流；当前会话保留至其切走后的渲染期执法释放。
3. `src/client.mjs` 渲染面跳写：
   - `renderTimelineArea` 调用在紧凑档跳过（running/awaiting/subagent 三处；中间档 lastOnly 语义不变）。
   - 进度行与 token 统计行仅在完整档写入（中间/紧凑档由 CSS 隐藏）。
   - 被跳写区域的就地更新器逐个空安全审计（`querySelector` 判空已满足处保持，新增分支不引入对被跳写节点的非空假设）。

## 测试计划

- 单元/契约（`scripts/check.mjs`）：
  - `logWindowSuppressed` 纯函数断言（紧凑+主会话为真、紧凑+子代理为假、中间/完整为假、非法档位归一后为假）。
  - bundle 契约断言：captureSessionLog 入口门控、深翻门控、目录门控、拆窗函数与调用点（含 dispose）、三处渲染跳写。
- E2E（新增 `e2e/specs/density-resource.mjs`）：
  - DOM 层资源纪律断言：紧凑档下完成卡时间线容器零子节点、统计行未写入；切回中间档后时间线构建、既有会话数据就绪。
  - 紧凑档下运行卡标题行累计运行时长逐秒推进（非日志通道不停摆）。
  - 说明：传输层「帧冻结/重建」经实现期隔离探针实证（dispose 后原 `session/follow` 流帧计数冻结、切回后重新水合）；E2E 不做按发起方归因的网络断言——宿主对外壳与会话窗口按会话对象去重，同一会话的 follow open 帧无法区分发起方，负向断言不可判定。
- 人工（`scripts/acceptance.mjs`）：切档往返观感、非日志通道不停摆、目录读取补齐、排序承载。
- 全量门禁：`pnpm verify`（含移动端热静默 rAF 阈值门禁，C-082 对照记录）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| SOLUTION | 方案层演进：档位资源纪律门控与切档再水合语义（运行时语义、产品契约、窗格渲染器内部结构、需求追溯索引） | UNIT/E2E | update | `scripts/check.mjs` 档位门控与跳写契约、`e2e/specs/density-resource.mjs` 新增 spec；RATIONALE C-084 承载取舍 |
| R-01-024/AC-01 | 新增 AC | UNIT/E2E | add | `scripts/check.mjs` 谓词与 bundle 契约（拆窗+dispose 执法）、`e2e/specs/density-resource.mjs` 往返重建断言 |
| R-01-024/AC-02 | 新增 AC | E2E/MANUAL | add | `e2e/specs/density-resource.mjs` 可见信息断言、`scripts/acceptance.mjs` 人工步骤 |
| R-01-024/AC-03 | 新增 AC | UNIT/E2E | add | `scripts/check.mjs` 深翻门控契约与子代理豁免断言、`e2e/specs/density-resource.mjs` 往返重建断言 |
| R-01-024/AC-04 | 新增 AC | MANUAL | add | `scripts/acceptance.mjs` 排序退化人工步骤 |
| R-01-024/AC-05 | 新增 AC | UNIT/E2E | add | `scripts/check.mjs` 渲染跳写契约、`e2e/specs/density-resource.mjs` 切回恢复断言 |
| R-01-024/AC-06 | 新增 AC | UNIT/MANUAL | add | `scripts/check.mjs` 目录门控契约、`scripts/acceptance.mjs` 人工步骤 |
| R-01-024/AC-07 | 新增 AC | E2E/MANUAL | add | `e2e/specs/density-resource.mjs` 标题行断言、`scripts/acceptance.mjs` 人工步骤 |
| R-01-010/AC-09 | 正文修改（档位限定注记） | MANUAL | update | `scripts/acceptance.mjs` 补紧凑档排序承载断言步骤 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：紧凑档下主会话不建立/保持日志窗口、不发起深翻与目录读取；隐藏行不构建不写入；切回后渐进重建就绪 | `scripts/check.mjs#R-01-024/AC-01`、`scripts/check.mjs#R-01-024/AC-03`、`scripts/check.mjs#R-01-024/AC-06`、`e2e/specs/density-resource.mjs#R-01-024/AC-01`、`e2e/specs/density-resource.mjs#R-01-024/AC-05`、`src/client.mjs::enforceDensityDataDiscipline` |
| 异常 | 适用：子代理模型上下文读取不受影响；dispose 不可用时降级为仅断订阅；非法档位归一后不裁剪 | `scripts/check.mjs#R-01-024/AC-03`、`src/core.mjs::logWindowSuppressed` |
| 边界配置 | 适用：拆窗时被豁免的当前会话在其切走后的渲染期照常释放；启动即紧凑档（存储恢复）时无窗口可拆为无操作 | `scripts/check.mjs#R-01-024/AC-01`、`src/client.mjs::enforceDensityDataDiscipline` |
| 副作用 | 适用：非日志通道（轮内订阅、busy/acks、列表订阅、子代理窗口）不停摆；标题行可见信息与累计时长照常推进；渲染签名去重语义不变 | `e2e/specs/density-resource.mjs#R-01-024/AC-02`、`e2e/specs/density-resource.mjs#R-01-024/AC-07`、`src/client.mjs::enforceDensityDataDiscipline` |

## 终态与证据

- 实现: 紧凑档数据面裁剪与渲染面跳写（R-01-024 七条 AC + R-01-010/AC-09 档位限定）。
  - 提交 ef3a270（实现）：core 新增 `logWindowSuppressed` 谓词；client 的 `captureSessionLog`/`syncLiveness`/`loadNativeDetails` 门控、`enforceDensityDataDiscipline` 渲染期持续执法（unsubscribe + `detail.log` 置空 + 非当前会话 `session.dispose()`）、三处时间线跳写与进度/统计行完整档门控；新增 e2e/specs/density-resource.mjs 与 check.mjs、acceptance.mjs 锚点。
  - 提交 8e70618（复审收敛）：PRD/DOMAIN 补当前会话豁免注记；`logWindowSuppressedFor` 单点判定统一四处；深翻 fetchPage 响应点重读档位、中止路径不落地不置 `historyDeepReadDone`；enforce 列表未就绪整轮跳过守卫；check.mjs 契约同步。
  - 实现期隔离探针证据（一次性，脚本已删，结论记录于此）：紧凑档拆窗后探针会话原 `session/follow` 流帧计数冻结（24→24，跨 4s 无增量），dispose 为真正停流手段（仅 unsubscribe 不终止共享传输流）；切回高档位经既有 open 语义重新水合。宿主对外壳与会话窗口按会话对象去重，同一会话 follow open 帧无法按发起方归因——e2e 不做网络层负向断言，以 bundle 契约承载门控存在性。
- 测试: 快速门禁与全量门禁逐项通过。
  - `pnpm check`（unit + bundle 契约）与 `pnpm verify:fast` 全绿（agentmap lint、测试影响记账）。
  - `pnpm verify` 全量 E2E 20 spec 通过（运行于含中止路径修复的代码；8e70618 之后仅注释措辞零行为差异）：density-resource 新 spec 通过；移动端热静默 rAF 74 < 80 阈值（C-082 量化守恒门禁对照：档位跳写与拆窗使紧凑档 rAF 事件源减少，阈值未放宽）。
  - `session-lifecycle.mjs` 首轮全量出现一次 opacity 采样 NaN（时间线点脉冲采样与渲染重建的既有竞态窗口）；隔离复跑两次 + 全量复跑两次均通过，判定为既有采样竞态非本需求引入。
- SOLUTION 对照: SOLUTION 与实现一致。
  - 运行时语义、产品契约、窗格渲染器内部结构与实现对照无差异（logWindowSuppressedFor 单点判定、dispose 停流、当前会话豁免与渲染期执法、深翻响应点与中止语义、渲染跳写）。
  - 需求追溯索引含 R-01-024 行（主责 窗格渲染器）；DOMAIN「档位资源纪律」不变量五子项与 RATIONALE C-084 与实现一致。
  - 测试锚点：`scripts/check.mjs#R-01-024/AC-01`（谓词断言）、`scripts/check.mjs#R-01-024/AC-03`、`#R-01-024/AC-06`、bundle 契约 7 组；`e2e/specs/density-resource.mjs#R-01-024/AC-01`～AC-07 相关断言；`scripts/acceptance.mjs#R-01-024/AC-02` 等 4 条人工条目与 R-01-010/AC-09 步骤更新。
- commit: ef3a270
- commit: 8e70618
- review:
  - 审核方: code-review skill 双轴并行独立子代理（Standards agent 50173d15、Spec agent 108ba4b5），基线 36b2ed2
  - 目的理解: 本变更目的为紧凑/中间档表达「只看概要」时收紧窗格数据面与渲染面资源消耗（移动网络/设备体验）。
    - 约束：不引入轮询（R-02-001/004）；裁剪以档位为唯一输入（C-084）；非日志通道不停摆。
    - 约束：切回高档位经既有渐进语义重建；子代理模型上下文读取不受影响。
    - 预期行为：紧凑档主会话日志窗口不建立/保持（当前会话由外壳持有豁免、切走后渲染期释放）、深翻与目录读取豁免子代理、隐藏行不构建不写入、切回渐进重建。
  - 执行方式: code-review skill 双轴并行评审。
    - Standards 轴对照 AGENTS/CONVENTIONS 写作与过程规范加 Fowler 基线；Spec 轴对照 T-157 与 PRD R-01-024、SOLUTION/DOMAIN/RATIONALE C-084。
    - 复审覆盖工作树与两笔提交；修复由同一审核方循环复审。
  - 问题与修复: 七项发现逐条修复并经同一审核方复审闭环（明细如下）。
    - PRD AC-01 与当前会话豁免 map 矛盾 → PRD/DOMAIN 增豁免注记（两轴确认闭环）。
    - 写作风格长句 → 陈述拆三短句；AC 存量同形句式按惯例接受。
    - 判定组合三处重复 → `logWindowSuppressedFor` 单点化；syncLiveness 拆窗分支并入正常路径记账。
    - 逐点档位条件级联 → 沿仓库惯例保留（判断题）。
    - task 措辞漂移（detail.log）→ 已同步实现。
    - 深翻「响应点重读」声明与实现不符 → fetchPage 响应点重读 + 中止不落地不置 historyDeepReadDone；两处 map 措辞同步为「中止时已取页不落地」。
    - enforce 列表快照未就绪误 dispose 风险 → `listSnap?.current == null` 整轮跳过守卫。
  - 复审结论: Standards 轴「五项全部闭环，无新增问题，复审通过」；Spec 轴三轮逐项闭环，最终结论「措辞同步后即可关闭 task」，措辞已在 8e70618 同步。
- 残余风险与测试缺口:
  - AC-01/AC-03/AC-06 传输层负向承诺无可重复自动化行为断言（bundle 字符串契约与一次性探针承载；网络层按会话对象去重、发起方不可归因）。
  - AC-02 的 acks/busy SSE 不停摆仅人工 DevTools 条目承载；AC-04 仅 MANUAL 层验证。
  - 当前会话豁免依赖「外壳持有会话运行时」假设，无锚定断言。
  - 中止路径行为级断言缺失（字面量契约承载）；落地与响应点门控之间的微任务级档位切换竞态记录不修（实际不可达）。
