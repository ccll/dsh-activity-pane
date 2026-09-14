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
- [维护想法] README 增加 FAQ/故障排查章节（待积累真实 issue 样本后再写，避免臆测）
- [维护想法] README 增加 Changelog/版本徽章（Release 为手工流程，待出现第二个发布版本再评估）
