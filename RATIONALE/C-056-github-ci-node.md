---
doc-type: rationale
mutation: append-only
id: C-056
owner: agent
---

# C-056 GitHub CI 使用与本地基线一致的 Node 24.16.0

日期: 2026-08-28

#### 上下文
本地完整门禁在 Node 24.16.0 下可 10/10、约 169～187s、0 次 fresh recovery；GitHub hosted 在 Node 22.23.2 下即使固定顺序与最多五个页面连接世代仍 0/10，通过前每个 spec 都耗尽两套环境，结果为 753.617s、10 次恢复。DSH runtime 版本、Playwright revision、隔离目录和端口策略均已对齐，Node major 是剩余的运行时差异；当前 Harness master 也声明支持 `^22.19 || >=24`。

#### 决策
- GitHub Actions 的项目步骤锁定 Node 24.16.0，与本地验证基线一致；`package.json` 继续声明 `>=22`，不改变插件消费者兼容承诺。
- workflow 契约断言 Node 精确版本，升级须先比较 hosted sessions readiness。
- 若 Node 24 hosted 仍失败，继续推进 upstream SessionManager 有界首拉重试，不再扩大 E2E 环境重试。

#### 被否方案及原因
- 继续 Node 22 并增加恢复次数：hosted 0/10 说明不是有限 flake，增加重试只延长失败。
- 放宽为 `node-version: 24`：未来 minor 自动漂移会重新引入不可复现差异；当前先锁定已验证本地版本。
- 收紧 package engines 到 Node 24：插件本身没有证明 Node 22 不兼容，异常位于测试宿主组合，不应扩大产品兼容变化。

#### 影响面
R-02-002 / E2E 验证基建、GitHub CI
