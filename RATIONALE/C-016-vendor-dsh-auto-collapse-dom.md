---
doc-type: rationale
mutation: append-only
id: C-016
owner: agent
---

# C-016 折叠时间线以 vendor 数据层移植复用 dsh-auto-collapse 分组规则，而非运行时调用或读取其 DOM

日期: 2026-08-24

#### 上下文
东家要求活动卡时间线在 dsh-auto-collapse 存在并生效时同步其折叠呈现（组标题 + 推理文本内容，无需展开能力）。查证：其 client bundle 仅导出 apply/inject/name，findBlocks/buildSegments/FoldController 全部闭包私有；DSH client-modules 将跨插件 value import 明确标注为 forbidden；其折叠结果只存在于主窗口 DOM 的私有类名 chip 中，且仅覆盖当前打开的会话。

#### 决策
vendor 其 MIT 源码中的分组纯逻辑（findBlocks 的块识别与 updateChip 的标题/摘要优先级），移植到 ChatSnapshot 数据层成为 core 纯函数 `foldedConversationTimeline`/`foldWorkGroups`；检测只做只读样式标记探测（`#dshcf-style[data-dshcf-state]`），未检测到即回退 R-01-012 逐项镜像；在 DESIGN 横切约束与 README 保留来源声明。

#### 被否方案及原因
- 运行时 require 已安装插件：导出面上没有折叠逻辑，且平台约定禁止跨插件 value import。
- 解析其 DOM chip 上卡：仅覆盖当前选中会话（其余卡片无 DOM 可读），且耦合第三方私有类名，对方升级即静默失效。
- 不看源码自研同语义分组：其乱序排列回归等边角规则从行为反推易漏，vendor 移植成本更低、规则更确定。

#### 影响面
R-01-017 / 活动状态模型、窗格渲染器
