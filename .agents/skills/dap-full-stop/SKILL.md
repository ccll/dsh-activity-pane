---
name: dap-full-stop
description: 收口一个 PR 时读：agent 永不合并、什么算完成、留给属主什么
---

# dap-full-stop

本技能管"做完了"的定义与交接口径。agent 只把 PR 推到可合并状态，合并不属于 agent。

- agent 永不合并：不跑 `gh pr merge`，不推 main，不打 tag，不创建 Release。
- 完成判据：PR 非 draft、权威门禁全绿、评审线程全解决、与主干同步。
- 完成判据不只"代码写完"：正文要有命令与输出组成的验证证据。
- 留给定主四样东西：改动是什么、为什么这么改、怎么验的、还有什么没验。
- 真机、观感、外部 registry 类未验项写进正文并标"待人工验收"，不得声称已验证。
- 动了 golden 或只减清单的，正文写原因；属主看这一行决定要不要细看。
- CI 红、flake、未跑完的检查都如实写；藏失败比失败更贵。
- 合并由属主执行 `gh pr merge --squash --match-head-commit`，之后 agent 停手。
- 收口后不做没人要的重构或清理，那是新的 PR。
- 需要长期跟踪的遗留项写进 issue，不留在会话里。
