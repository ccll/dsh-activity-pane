---
doc-type: rationale
mutation: append-only
id: C-097
owner: agent
---

# C-097 CI runtime pin 随插件 dsh 基线升级到 0.2.0-rc.2 coherent 窗口（接替 C-079 的 0.1.5-rc.1 pin）

日期: 2026-10-13

#### 上下文
T-170 至 T-172 的验证基线是本机 `@deepseek-ai/dsh@0.2.0-rc.2`（2026-10-12 全量 21 spec 绿）。插件客户端已迁移 0.2.0 数据面，0.1.5-rc.1 宿主缺 current→retainedBy 等新 API，CI 继续 pin 0.1.5-rc.1 会使窗格永不挂载。README 双语实测声明与 `@deepseek-ai/dsh-storage-domain` 依赖仍停在 0.1.5 时代基线，须与实测基线一致。

#### 决策
CI pin 升至 `@deepseek-ai/dsh@0.2.0-rc.2`，coherent cutoff 取 `--before=2026-10-13T00:00:00Z`，cache key 换代 `dsh-020rc2-before-2026-10-13t00`。顶层精确 pin 排除 alpha 标签（alpha.1 于 2026-10-03、alpha.2 于 2026-10-09 发布）。cutoff 把传递依赖冻结到与本地已验证安装一致的组合。README 双语实测声明同步 0.2.0-rc.2。`dsh-storage-domain` 随宿主家族升至 0.2.0-rc.2。`DSH_RUNTIME_PATH` 统一为 `.cache/dsh-020`，兑现 T-142 记录的目录名约定。

#### 被否方案及原因
- 仅升顶层 pin 不设 cutoff：传递依赖随最新发布漂移，CI 无法复现本地已验证组合，违背 C-051/C-079 确立的 coherent 窗原则。
- cutoff 收紧到 alpha.1（2026-10-03T04:53Z）之前：无收益。顶层 pin 已隔离 alpha 标签，只会把传递依赖冻到更旧组合，偏离本地验证基线。
- 继续钉 0.1.5-rc.1：插件已迁移 0.2.0 数据面，旧宿主缺新数据面 API，窗格永不挂载；与 C-079 否决「回退兼容 rc7」同理。

#### 影响面
E2E 验证基建（CONVENTIONS 验证门禁与 .github/workflows/ci.yml 的 runtime pin 落点）
