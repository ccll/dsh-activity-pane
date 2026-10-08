---
doc-type: task
mutation: lifecycle
id: T-157
---

# T-157 档位资源纪律：紧凑档数据面裁剪与渲染面跳写

状态: active
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

（终态前填写）
