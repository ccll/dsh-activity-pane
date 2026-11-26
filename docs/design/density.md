# 档位、密度与几何

三档显示是数据面与渲染面的唯一裁剪输入；几何常量分布在 `src/core.mjs`（可单测的边界）与 `src/client.mjs`（布局与样式）。

## 档位模型

- 取值：`full` / `medium` / `compact`，信息量自大到小。
- 默认：`medium`；非法或缺失输入归一为 `medium`（`normalizeDensity`）。
- 循环：紧凑 → 中间 → 完整 → 紧凑（`nextDensity`）。
- 载体：窗格根属性 `data-density`，CSS 按该属性门控显隐。
- 持久化：localStorage 键 `dsh-activity-pane:density`，启动恢复；会话状态变化不改已选档位。
- 按钮：标题行右侧工具区 `.dap-density`，22×22 圆形，可访问名称表达将切换到的目标档位。
- 签名：档位分量进入渲染签名，切换经 `queueSync` 触发一轮重渲染。

## 三档内容

| 内容 | 完整 | 中间 | 紧凑 |
|---|---|---|---|
| 标题行（状态点、标题、后台数量注） | 保留 | 保留 | 保留 |
| 行内累计运行时长 | 保留 | 保留 | 隐藏 |
| 工作区徽标行 | 保留 | 保留 | 隐藏 |
| 时间线 | 全部 | 仅最新一行（`lastOnly`） | 不构建 |
| 进度行与 token 统计行 | 保留 | 隐藏 | 隐藏 |
| 等待末行（胶囊、正文、按钮） | 两行 | 保留 | 隐藏 |
| 完成提醒末行 | 两行 | 收合为单行 | 隐藏 |
| 最近卡消息预览行 | 保留 | 保留 | 隐藏 |
| 后台任务子卡 | 保留 | 剔除 | 剔除 |
| 标题行行尾工作区名胶囊 | 隐藏 | 隐藏 | 显示，固定 84px |

- 中间档时间线为单行时含运行中状态实时更新。
- 紧凑档完成提醒卡在标题行最右端改为 ✓ 图标确认按钮。
- 卡片的 `data-wait` 底色与状态点着色在三档下保持不变。
- 激活跳转逻辑不感知档位。

## 档位资源纪律

- 谓词：`logWindowSuppressed(densityLevel, isSubagent)`，仅紧凑档且非子代理为真。
- 紧凑档主会话不建立或保持日志窗口订阅；进入紧凑档时先退订再除名并清空窗口引用。
- 非当前会话再释放 retain 引用以终止底层流；当前会话窗口由外壳持有，豁免。
- 子代理窗口恒不裁剪：它承载标题行可见的模型上下文。
- 紧凑档不发起日志分页深翻，也不做无可见消费者的一次性模型目录读取。
- 门控为用时校验：订阅回调入口、分页响应点、在途深翻的下一页发起前均重读当前档位。
- 切档在途的深翻不续页，已取页不落地；切回更高档经既有渐进路径重新水合。
- 逐秒时钟需求收口 `runningClockWanted`：开放回合会话、委托周期母卡、运行中子代理驱动；后台任务不单独驱动。
- 非日志通道（列表订阅、sessionStatus、acks/busy、子代理窗口）不随裁剪停摆。
- 被跳写区域切回更高档后随档位重渲染恢复；就地更新器必须空安全。

## 滚动锚

- 切换前记录当前选中卡片（`.dap-card[data-current]`）顶部相对 `.dap-scroll` 视口的位置。
- 档位翻转后登记补偿目标，渲染提交后逐帧量测当前卡片并补偿 `scrollTop`。
- 沉降窗 1500ms：切回高档时窗口经 retain→ready 异步重建，时间线分多帧长回，单帧补偿会漏掉后期增长。
- 补偿目标超出滚动边界时由浏览器钳制，以当前卡片不滚出可视视口为准。
- 当前卡片不可得时放弃补偿。
- 重置：窗口重建完成的判定只按沉降窗超时，不按帧间「稳定」提前撤除。

## 几何常量

| 量 | 值 | 位置 |
|---|---|---|
| 桌面列宽范围 / 默认 | 200–480px / 280px | `src/core.mjs` `clampPaneWidth` |
| 折叠窄条宽 | 34px | `src/client.mjs` `COLLAPSED_WIDTH` |
| 缩进槽宽 | 16px | `src/client.mjs` `INDENT_PX` |
| 列表内边距 / 卡间距 | 横 8px / 6px | CSS `.dap-list` |
| 轨道竖线 / 横线偏移 | 左 -8px，上 -6px，下 -2px | CSS `.dap-tracks` |
| 调宽手柄命中区 | 右缘 6px | CSS `.dap-resize` |
| 移动断点 | ≤767px | CSS `MOBILE_BREAKPOINT` |
| 移动抽屉宽 | `min(84vw, 320px)` | CSS 媒体查询 |
| 回顶按钮阈值 | scrollTop > 200px | `TOP_THRESHOLD` |
| 开关外层命中盒 | 最小 44×38px | CSS `.dap-toggle` |
| 开关计数徽标 | 最小 36×24px，文字 12px，横 padding 8px | CSS `.dap-toggle-count` |
| hero 态开关层级 | z-index 1060 | CSS `.dap-toggle[data-hero]` |
| 嵌入态开关层级 | relative，z-index 2 | CSS `.dap-toggle[data-embedded]` |
| 档位按钮 | 22×22px 圆形 | CSS `.dap-density` |
| 紧凑档行尾工作区胶囊 | 84px（border-box，横 padding 14px） | CSS `.dap-row .dap-workspace` |
| 紧凑档确认按钮视觉盒 | 20×18px | CSS `.dap-confirm-icon` |
| 紧凑档确认按钮命中区 | 24×24px（`::before` inset -4px -3px） | CSS `.dap-confirm-icon::before` |
| 迁移动画时长 | 约 300ms | CSS `.dap-move-ghost` |

- 缩进槽宽三处耦合：`INDENT_PX`、轨道 CSS 偏移、列表 gap；改任一须同步。
- `scripts/check.mjs` 对上述耦合有钉住断言。
- 动画受 `prefers-reduced-motion` 门控：迁移与进度 transition 跳过，状态脉冲保留。

## 验证

- `e2e/specs/compact-density.mjs`：三档切换、内容显隐、锚定与完成提醒按钮形态。
- `e2e/specs/density-resource.mjs`：紧凑档数据面裁剪与切档再水合。
- `e2e/specs/resize.mjs`：列宽拖拽、夹取与持久化。
- `e2e/specs/back-to-top.mjs`：回顶按钮阈值与滚动行为。
- `scripts/check.mjs`：`clampPaneWidth`、`normalizeDensity`、`nextDensity`、`logWindowSuppressed`、`runningClockWanted` 的单元断言。
