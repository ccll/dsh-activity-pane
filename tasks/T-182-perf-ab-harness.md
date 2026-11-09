---
doc-type: task
mutation: lifecycle
id: T-182
---

# T-182 渲染进程燃烧 A/B 自动化测量工具

状态: completed
类型: 性能优化（配套基建）
风险等级: major
风险面: 无（测试/测量基建：新增独立脚本与 boot 可选参数，不触及契约、资金、数据迁移、对外接口、鉴权，产品代码零变化）
关联需求: 无新承诺——支撑 R-01-025 资源纪律与 T-181 验收线（事件流入期 ≤ 修复前 55%）的量化自证，属维护者验证基建
决策依据: 东家批准 A/B 自动化方案（2026-11-09）——隔离环境同一确定性负载、唯一变量为插件 bundle 版本；默认报告、`--check` 才断言、不进 pre-push 门禁；`--sessions N` 名册扩档先探宿主建会话成本再定去留。

## 背景与目标

T-181 落地后，验收线（事件流入期渲染进程燃烧 ≤ 修复前 55%）需要修复前后对照才能裁决，活实例人工剖析不可重复、不可回归。本 task 建自动化 A/B 工具：变体 A = 修复前 bundle（git 历史），变体 B = 当前工作树 bundle；两变体在各自隔离环境（mock LLM + 临时 DSH_HOME + 独立 Chrome）跑同一 `e2e:slow` 确定性流式剧本，测渲染进程 CPU 增量并出比值。用途定位：回归防护工具 + 发布前自检，不替代活实例 A/B 的验收锚点地位。

## 差距评估

- PRD：无变化（测量工具不触及产品承诺）。
- SOLUTION：无变化。
- 代码：无 A/B 测量设施——手工剖析（CDP 脚本）依赖真实活跃负载窗，不可自动化、不可回归复跑；e2e boot 硬编码 `repoRoot` 挂载（e2e/boot.mjs:142），无法指向变体插件目录。
- 宿主建会话成本探针结论：会话创建绑定回合流程（UI 发消息 + mock 回合），单会话秒级，`--sessions N` 名册扩档会令 N≥50 的预备时长压倒测量时长且依赖未固化的宿主内部 API——不纳入本工具，登记为工具口径限制（小名册环境折叠占比偏大、相对降幅偏乐观，机制比值成立、生产绝对值以活实例 A/B 为准）。

## 收敛方案

1. 变体 A 物化：`git show <base>:.dsh-plugin/client.js` 取修复前 bundle；`--base` 缺省取「最近一次触碰 `.dsh-plugin/client.js` 的提交的父提交」（自维护：未来每次 bundle 变更后 A/B 自动对比前版）。变体镜像目录 = package.json + cordis.patch.yml + `.dsh-plugin/`（index.mjs 拷贝 + client.js 换变体版）+ `src` 软链（host 入口转发 `../src/host.mjs`，缺 src 插件静默激活失败）+ node_modules 软链，host 侧两版零差异。
2. 变体 B 物化：`scripts/build-client.mjs` 现建工作树 bundle。
3. e2e/boot.mjs 增可选 `pluginRoot` 参数（缺省 repoRoot，既有调用零变化）。
4. 测量流程（每变体 K=3 迭代取中位数 + 1 轮预热不计入）：
   - 场景搭建：锚点会话（slow 首回合，标题可辨）+ 窗口填充会话（fast 首回合 + `--fill` 轮 fast 回合把日志窗口垫到生产量级）。
   - 事件流入期：向填充会话发 `e2e:longstream`（96 块 ≈ 14.4s）后立即导航回锚点——流式全程落在后台，宿主会话视图不重渲染流块，插件折叠管线成为被测主体；窗尾先采样再导航回填充会话。
   - 剖析迭代：同一几何外挂 CDP 采样（200μs 间隔），产出折叠函数自采样占比。
   - 隐藏期：同几何下第二标签页置前转 hidden（headless 不生效时回落 defineProperty 并打印实际模式行）。
   - renderer 进程按唯一 user-data-dir 标记在 /proc 扫 `--type=renderer`，前后两次扫描求和取差。
5. 输出与断言：逐迭代明细 + 事件期 CPU 中位数（K=3）+ 比值；断言指标为**折叠占比比值**（机制断言——修复后每拍折叠 2→1，对宿主常量负载免疫；缺省阈值 0.7 为预期 0.5 加噪声余量的校准值；每变体单剖析迭代，非中位数，报告行已标注），总 CPU 比值仅随报告输出（隔离环境中宿主自身流式期 UI 工作是两变体同担的常量大头，实测总比值被稀释至 ≈0.98–1.10，不具备生产可比性）；`--check` 才断言；loadavg 超 50% 核数时打告警行。生产验收线（≤ 修复前 55%）仍以活实例 A/B 为准，本工具为机制回归防护。
6. 无分叉点: 方案形态由东家批准口径承载；断言指标的口径修正是实现期实测驱动的收敛（首版几何实测总 CPU 比值 ≈0.94/0.98 暴露宿主常量项稀释），非新分叉——机制指标是唯一对常量项免疫的可断言口径。

## 测试计划

- 工具自身的验证 = 真实跑通一次完整 A/B（含 `--check` 断言路径）并留输出回执（本 task 终态记录比值与明细）。
- `--check` 断言逻辑经构造性验证：T-181 预期事件期比值显著低于 0.55，跑通即同时验证报告与断言路径。
- 既有面回归：boot.mjs 参数为可选扩展，e2e 全量保持通过（验证其零变化）。
- 测试影响：PRD/SOLUTION 无变化，无 AC 锚点变更。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：A/B 两变体跑通并产出比值 | `scripts/perf-ab.mjs::measureVariant`、`scripts/perf-ab.mjs::measureProfiledEventPeriod`（实跑回执见终态） |
| 异常 | 适用：变体镜像缺文件、Chrome 缺失、boot 失败需明确报错 | `scripts/perf-ab.mjs::launchChrome`、`scripts/perf-ab.mjs::resolveBaseCommit` |
| 边界配置 | 适用：`--base`/`--check`/`--threshold`/`--fill`/负载告警分支 | `scripts/perf-ab.mjs::parseArgs` |
| 副作用 | 适用：临时目录与进程清理、不触碰仓库工作树 | `scripts/perf-ab.mjs::measureVariant` 的 settleCleanupSteps 收尾 |
| 性能 | 适用：工具自身运行时长受控（实测约 7 分钟）且产出可复现 | `scripts/perf-ab.mjs::measureProfiledEventPeriod`（两次实跑折叠占比比值 0.555/0.569，终态记录） |

## 自查清单

- 边界：base 提交解析失败（无 bundle 历史提交）即报错退出，不静默退化为 A=B 自比。
- 异常路径：Chrome 启动失败/调试端口超时/boot 失败均向上抛错并清理已启资源；隐藏模式回落时打印实际采用的模式。
- 回归影响：boot.mjs 既有调用（e2e/run.mjs 全部 specs）零变化——参数缺省即原行为；本工具不写仓库工作树（变体镜像全在临时目录）。

## 终态与证据

- 实现: A/B 测量工具 scripts/perf-ab.mjs（变体镜像物化 + 隔离 boot + 独立 Chrome 的 /proc CPU 与 CDP 剖析采样 + 测量几何：锚点导航后台流式 + 窗口填充 + 隐藏期）；e2e/boot.mjs 可选 pluginRoot、scripts/build-client.mjs 可选 outPath、e2e/mock-llm.mjs 增 e2e:longstream（96 块双引擎）、package.json 增 perf:ab 入口。
- 测试: 真实跑通两次完整 A/B（第二次含 --check，PASS）：折叠占比比值 0.555/0.569（机制预期 ≈0.5+采样噪声）、隐藏期总 CPU 比值 0.310/0.637（B 变体显著低于 A）、事件期总 CPU 比值 0.978/1.099（宿主常量项稀释，参考项）；pnpm verify 全量 22 specs 全绿（此前一轮 idle-quiescence 失败系 TODO 既有 boot 就绪竞态签名——每轮不同 spec、单跑回执 PASS 收口，与本 task 改动无关）。
- SOLUTION 对照: 纯测试/测量基建，产品代码零变化（map 不变）；PRD/SOLUTION 未改写，无 AC 锚点变更。
- commit: c582755
- review:
  - 目的理解: T-181 验收线（事件流入期 ≤ 修复前 55%）需要可复现的修复前后对照，活实例人工剖析不可回归——本工具以隔离环境、确定性负载、唯一 bundle 变量实现自动化 A/B；定位为机制回归防护与发布前自检，生产验收锚点仍是东家排期的活实例 A/B。
  - 问题与修复: Standards 轴 3 条全收敛（node:child_process 双 import 合一、page2 双 close 补幂等理由注释、剖析采样名锚点注释加零采样告警）；Spec 轴 4 条全收敛——launchChrome 中途失败泄漏 Chrome 进程与临时目录已修（就地 kill 加 rm 后再抛，自查清单「清理已启资源」自此成立）；「折叠占比中位数」失实标签改为「单剖析迭代」并同步 task 收敛方案口径；运行时长预估修正为实测约 7 分钟；镜像清单补记 index.mjs 拷贝与 src 软链。审核方事实核正一条：镜像目录无须命名为包名（pnpm link: 依赖键取目标 package.json 的 name 字段；本实现镜像拷贝仓库 package.json，两种键名规则下均正确，代码无需变更）。
  - 复审结论: 双轴 7 条均 non-blocking 且全部收敛；两次实跑 --check PASS 佐证工具端到端可用。
- 残余风险与测试缺口:
  - 断言指标受采样噪声影响（两次实测 0.555/0.569，阈值 0.7 已留余量）；绝对值随机器/负载漂移，默认报告模式不设门禁（东家批准口径）。
  - 隐藏期在 headless 下走 defineProperty 回落模式（第二标签页置前未触发真实 hidden 语义），B 变体隐藏期成本的估计偏保守；真实隐藏页的消除证据以活实例 A/B 为准。
  - 名册规模固定为隔离环境的小名册（--sessions 探针结论：会话创建绑定回合流程、秒级每个，扩档成本高于测量价值，未纳入工具）；生产名册效应以活实例 A/B 承载。
