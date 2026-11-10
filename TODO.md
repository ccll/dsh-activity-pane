---
doc-type: todo
mutation: inbox
owner: 双方
---

# TODO — 想法收集箱

## 条目



- [性能想法] 无等待行动且抽屉关闭时断开 acks/busy SSE 通道（T-127 调研遗留：收益存疑——长连接空闲期无应用层流量，射频开销主要是连接保持态；而断开期间新完成提醒无法即时点亮浮动开关徽标，完成提醒及时性受影响，需东家对及时性权衡拍板）
- [性能想法] 移动端抽屉 backdrop-filter blur(10px) 降级为低模糊或实色（T-127 调研遗留：抽屉打开期间下方会话流式重绘导致逐帧全区域重模糊，移动 GPU 有感；但模糊是可观察视觉设计，降级需东家拍板观感）
- [维护想法] README 安装节补充 dsh-market 一键安装入口（待 awesome-dsh-plugin 目录收录 PR 合入后；当前目录无 dsh-activity-pane 条目，市场仅允许安装 curated 目录内来源）
- [维护想法] 推送 pre-push 全量 verify 期间 GitHub SSH 连接因空闲被远端断开，hook 结束后传输触发 SIGPIPE 静默失败（v0.11.0 发布时实测三次；`GIT_SSH_COMMAND="ssh -o ServerAliveInterval=30"` 单次保活解决）——可选收敛：推送前设置 keepalive 或在 CONVENTIONS 记录该推送惯例
- [维护想法] README 增加 FAQ/故障排查章节（待积累真实 issue 样本后再写，避免臆测）
- [维护想法] README 增加 Changelog/版本徽章（Release 为手工流程，待出现第二个发布版本再评估）
- [维护想法] buildEntries/buildRecent 位置参数（8/9 个）收敛为 options 对象（T-149 Standards 评审 Data Clumps 判断项：jobsBySession 续位参数膨胀；改造波及全部既有调用与断言，宜与签名重构同期进行）
- [维护想法] SOLUTION.md「活动卡片集合」bullet 拆为嵌套列表（T-152 Standards 评审：单条约 600 字平铺违背 AGENTS.md 写作风格；沿既有膨胀现状同向加重，改造波及整段重组，宜与 SOLUTION 结构评审同期进行）
- [维护想法] JOB_STATUS_LABELS（client 渲染层状态词）与 JOB_KIND_LABELS（core 工具名映射）两表并存的聚拢评估（T-152 Standards 评审 Shotgun Surgery 苗头；已注释注明分层理由——core 表需 Node 单测钉住且两层共用，状态词仅渲染层消费；新增任务工具类型时两处同步）
- [维护想法] `.dap-confirm-icon` 显式声明 `box-sizing: border-box`（T-177 审计 N-6：现依赖 button UA 默认值，曾是命中区两轮口径反复的根因；e2e pseudoBox/hitEdges 三重防线已钉死行为，宜顺手消除 UA 默认依赖）
- [性能想法] 流式派生真增量（HANDOFF-dsh-activity-pane-卡顿修复 ④b）：跨批持久 inflightCalls/liveAttempts 只折新增条目，失效时全量重算（history 引用整体替换、seq 断档、tool_result 晚到出窗三类触发）；宿主日志窗口本身有界（尾页 ≤500 条消息 + 活动 attempt 的 transient chunk），仅在 T-181 ①②③落地重剖后流式单批成本仍占大头时立项；失效面是静默错误内容（漏条目、错配对），立项须按 major 走完整评审（已由 T-185 落地：增量折叠 + 对抗等价 spec；本条待东家演进 TODO 时清除）
- [性能想法] 增量折叠指纹可选加固 O(窗) seq 单调扫描（T-187 审计 S1：无 seq 畸形条目使纯追加校验的 seq 比较恒真，为 T-185 已登记两点指纹残余的更窄延伸；现行生产者条目普遍带 seq 且守追加+出窗纪律，可达性低）——与 T-185 收敛方案 3 已登记待议项一并裁决
- [维护想法] buildRecent 第二段幂等冗余排序比较器清理（T-187 审计 D1：两段式保序下第二段 sort 属 Speculative Generality 形态；后续触及该函数时提取单一比较器或删除；同批可评估 waitingStartsFrom 非 Map 无守卫与 applyStatusOverlay isRecord 守卫微差两处容错口径 nit）
- [维护想法] patch/state 双通道四函数解析骨架收敛为单 helper 与 busyVersion 记账家族单一写入口评估（T-190 审计 N5/N6：四函数共享 JSON.parse 容错+对象校验+归一+queueSync 骨架，record 归一已收敛、解析骨架可再收敛；busyById 4 写点靠注释清单+人工纪律承载，可选单写入口；均规模小、后续触及相应区块时一并评估）
- [性能想法] 名册级渲染轮次成本收敛（T-181 剖析新发现）：折叠大头消除后热点重分布至 buildEntries/workspaceInfoForSession/lineageActiveIds/currentIdOf/buildRecent 家族（活实例两窗剖析合计约 37–45% 非空闲样本，buildEntries 逐 id 新建归档判定 Set 属常量成本），与 jobs 全会话订阅面的残余成本同族；纯函数常量优化属短路可先行，可见窗口订阅收窄属需求变更须先改 PRD，是否立项由东家在重剖后定
- [缺陷线索] 连续两轮全量 verify 各有一次不同 spec 在共享 boot helper 超时：recent-infinite-scroll（b5c4979 轮）→ auto-update（aa82982 轮），失败签名同为「等待超时：窗格数据就绪（最后观测：null）」（e2e/helpers.mjs:21 until 轮询、e2e/helpers.mjs:124 openApp），单跑均 PASS——呈并行负载下 boot 就绪等待超时的模式而非孤例；两轮均以失败签名+单跑回执+同型先例收口，若成系统性问题宜给启动就绪等待加宽或并行度退避（b74f508 曾 6s→30s 加宽一次）
