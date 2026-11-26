---
name: dap-host-compat
description: 改动宿主侧或壳层相关代码、或宿主升级后行为变化时读：两代宿主差异与补丁点
---

# dap-host-compat

本技能管 DSH 两代宿主（0.2.0 / 0.2.2）的差异、兼容分支埋点与兼容文档更新时机。支持矩阵与回执在 `docs/compatibility.md`。

- 两代宿主：CI clean runner 为 `0.2.0-rc.2`（`.github/workflows/ci.yml` 的 `DSH_RUNTIME_PATH`），本机另有 0.2.2 代。
- 判断代际用 `dsh --version`，不靠猜，也不把某代的显示格式写死到另一代。
- 模型目录显示名不同：0.2.0 为 `DeepSeek-V41-Flash`，0.2.2 为 `DeepSeek-V4.1-Flash`。
- 因此 e2e 只断言共享前缀：`e2e/helpers.mjs` 的 `MOCK_MODEL` 为 `DeepSeek-V4`。
- 0.2.2 新增全局面板标记 `data-global-panel`，0.2.0 没有；`e2e/specs/desktop-layout.mjs` 用注入标记当前向夹具。
- 0.2.2 窄视口新增宿主浮动侧栏开关（`aria-label="Open sidebar"`/`Collapse sidebar`）。
- 开关落位算式在 `src/client.mjs`：按可见命中盒避让宿主控件，隐藏控件不计。
- 0.2.2 窄视口把侧栏收进 `data-sidebar-drawer` 抽屉；`e2e/specs/mobile-drawer.mjs` 按真实路径收起。
- 移动壳层版本按代际选：0.2.2+ 装 3.3.6，0.2.0/0.2.1 装 3.2.0（`e2e/boot.mjs`）。
- 3.2.1+ 壳层 header 多 Chat/Trajectory 标签行；`e2e/specs/mobile-shell.mjs` 按有无标签行分流判据。
- 定位锚点优先宿主语义属性（如 data-slot）加实测几何，不耦合宿主哈希类名或版本号。
- 移动壳层槽位本体常 0 宽、控件可能在屏外：几何判定沿父链取首个非零宽并区分在屏与屏外。
- 兼容分支只留在 `src/` 与 e2e 夹具里；每处补丁点在只减清单 host-shims.txt 记一行，移除补丁即删行。
- 何时更新 `docs/compatibility.md`：支持代际增减、补丁点增减、CI 宿主版本变化、真机或运行回执。
- 新增兼容分支必须有对应 e2e 或回执；没有就登记为未覆盖项，不留口头承诺。
