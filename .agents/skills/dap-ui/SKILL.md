---
name: dap-ui
description: 改窗格布局、显示档位、移动抽屉、开关落位、滚动锚或样式 token 时读
---

# dap-ui

本技能管窗格的布局、档位、移动形态、滚动锚与样式约定。观感与真机部分另见 `dap-acceptance`。

- 挂载：窗格作为 `#root [data-slot="main"]` 父 flex 的前置兄弟列插入；窄屏（<=767px）转固定抽屉。
- 桌面显隐只由用户操作决定，不随会话视图与全局面板切换自动收起。
- 档位三档 `full`/`medium`/`compact`，默认 medium；标题栏按钮循环，持久化键 `dsh-activity-pane:density`。
- 切档时锚定当前卡位置，不跳不居中；`compact` 只留标题行。
- 宽度：拖拽 6px 手柄写 `--dap-width`，夹取 200–480px，默认 280，持久化键 `dsh-activity-pane:width`。
- 折叠态宽 34px，隐藏标题与列表，只留窄条计数。
- 移动抽屉默认隐藏在屏外；关闭时 `content-visibility: hidden` 屏外休眠，数据不冻结。
- 浮动开关常态嵌进标题行行首并避让宿主控件；hero 态贴靠壳层 ⊡ 右侧 8px。
- 开关层级低于壳层遮罩与抽屉（1060 对 1250/1300），不许抬高层级抢宿主覆盖层。
- 滚动锚：`scrollCardIntoView` 只修正越界方向，不居中；选中卡尽量原位。
- 视觉 token：`--dap-width`、`--dap-current-color`、`--dap-wait-color`、`--dap-workspace-*`；等待三色为金/绿/红。
- DOM 契约：根属性 `[data-dsh-activity-pane]`，类名前缀 `.dap-`；e2e 只认这些选择器。
- 移动改动按 WebKit + 移动 UA + 触屏 + 390×844 验证；桌面探针通过不代表真机成立。
- 对照 spec：`e2e/specs/desktop-layout.mjs`、`e2e/specs/compact-density.mjs`、`e2e/specs/mobile-drawer.mjs`。
