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
- [维护想法] DESIGN.md「活动卡片集合」bullet 拆为嵌套列表（T-152 Standards 评审：单条约 600 字平铺违背 AGENTS.md 写作风格；沿既有膨胀现状同向加重，改造波及整段重组，宜与 DESIGN 结构评审同期进行）
- [维护想法] JOB_STATUS_LABELS（client 渲染层状态词）与 JOB_KIND_LABELS（core 工具名映射）两表并存的聚拢评估（T-152 Standards 评审 Shotgun Surgery 苗头；已注释注明分层理由——core 表需 Node 单测钉住且两层共用，状态词仅渲染层消费；新增任务工具类型时两处同步）
