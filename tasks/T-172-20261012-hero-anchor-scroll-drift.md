---
id: T-172
doc-type: task
mutation: lifecycle
风险等级: standard
状态: completed
---

# T-172 修复空白页滚动期开关位移放大与顿挫（T-172 贴靠几何坐标基）

## 背景与目标

东家真机报告（附截图）：0.2.0 + dsh-web-mobile 3.0.6 下，空白（hero）页滚动屏幕时
activity-pane 入口开关的位移幅度大于其它元素（疑似 >1 缩放比例），且移动呈离散跳变、
不平滑；截图显示开关相对 ⊡ 明显下移错位。

T-171 落位的 hero 贴靠形态把 ⊡ 的 `getBoundingClientRect()`（视口坐标）烘进 frame 内
absolute 坐标（`src/client.mjs` placeToggle hero 分支）。锚与开关同为 frame 直系子项、
offsetParent 同为 frame（`position: relative`，探针实证），视口 rect 在 frame 被合成层
位移（iOS rubber-band/滚动期弹性位移等）时含 frame 自身位移——此时任何重落位（守卫
唤醒即触发）都把该位移重复计入一次：探针实测 frame 位移 40px 后重落位，开关总位移
80px、相对 ⊡ 漂移 40px。滚动期间每次唤醒的落位相位不同 → 累积漂移 + 离散跳变，与
东家描述完全吻合。

目标：贴靠几何改取锚的布局坐标（`offsetLeft/Top/Width/Height`），重落位幂等稳定，
位移期间开关与 ⊡ 相对几何不变；行为契约（贴靠右 8px、垂直居中）不变。

## 差距评估

- PRD R-01-008/AC-04 贴靠语义（落位按钮右侧 8px 垂直居中）未覆盖「持续贴靠」在
  视口层位移下的保持语义；本缺陷属实现坐标基错误，map 不变（短路路径）。
- SOLUTION:178 只写「锚右缘 + 8px，垂直居中」契约，未写坐标基；坐标基是缺陷根因级
  方案细节，补一行。
- e2e 无位移耦合断言，本类缺陷此前不可机械发现。

## 收敛方案

- `src/client.mjs` placeToggle hero 分支：锚选择仍用 rect（在屏判据需要视口可见性），
  几何改 `fabEl.offsetLeft/offsetTop/offsetWidth/offsetHeight`——锚与开关同 offsetParent，
  布局坐标即 frame 内 absolute 坐标本身，不受祖先 transform 影响，重落位幂等。
- 注释记录根因与判据（T-172）；`fabRect` 局部变量改 `fabEl`（存元素非矩形）。
- `scripts/check.mjs` 契约断言同步：贴靠算式断言改 offset 形态，新增「不再使用视口
  rect 烘几何」反断言。
- e2e `mobile-shell.mjs` hero 分支新增位移耦合回归：frame `translateY(40px)`（模拟视
  口层位移）+ 摘除开关唤醒重落位，断言相对 ⊡ 几何不变（缺陷态 relY 漂 40px 会红）。
- e2e `mobile-drawer.mjs` hero 贴靠断言（镜像算式）语义不变：静止态 offset 与 rect
  数值相同，断言继续成立。

## 测试计划

- 探针实证（WebKit + iPhone 13 + dsh-web-mobile 3.0.6 staging）：缺陷态 40px 位移重
  落位总位移 80px；修复后 40px 且相对 ⊡ 几何不变。
- e2e mobile-shell 新增位移耦合断言（位移 40px → 摘开关 → 守卫唤醒重落位 → 相对
  几何不变）；mobile-drawer 全绿防回退。
- `pnpm verify` 全绿。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
|---|---|---|---|---|
| SOLUTION | 方案层演进：落位机制段补贴靠几何布局坐标基一行（锚 offsetLeft/Top/Width/Height 即 frame 内坐标；视口 rect 含 frame 自身位移、重复计入致滚动期漂移） | UNIT/E2E | update | `scripts/check.mjs` 贴靠算式断言（offset 形态与 fabRect 反断言）与 `e2e/specs/mobile-shell.mjs` 位移耦合回归断言 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：静止贴靠几何与滚动期贴靠保持为核心承诺 | `e2e/specs/mobile-shell.mjs::位移耦合回归` |
| 异常 | 适用：锚缺失保留原位路径不受本改动影响，回归确认 | `e2e/specs/mobile-drawer.mjs::hero 页开关落位` |
| 边界配置 | 适用：offset 与 rect 在静止态数值一致（frame 位于视口原点），桌面与窄视口回归 | `scripts/check.mjs::fabEl.offsetWidth + 8` |
| 副作用 | 适用：开关位移不再重复计入 frame 位移，抽屉/遮罩遮挡层级不变 | `e2e/specs/mobile-shell.mjs::collapsedBefore` |
| 兼容性 | 适用：贴靠几何前提为锚与开关 offsetParent 同为 frame（壳层 3.0.6 实证）；宿主改版由绑定壳层版本的 e2e 兜底 | `e2e/specs/mobile-shell.mjs::位移耦合回归` |

## 终态与证据

- 实现: `src/client.mjs` placeToggle hero 分支贴靠几何改取锚布局坐标
  `offsetLeft/Top/Width/Height`（锚选择仍用视口 rect 在屏判据；`fabRect`
  改名 `fabEl`，注释记录根因）；`scripts/check.mjs` 契约断言同步（offset
  算式三条 + 视口 rect 烘几何反断言）；`e2e/specs/mobile-shell.mjs` 新增
  位移耦合回归（frame translateY(40px) + 摘开关守卫唤醒重落位，断言相对
  ⊡ 几何不变）；SOLUTION 落位机制段补坐标基一行。
- 测试: 探针实证（WebKit + iPhone 13 + dsh-web-mobile 3.0.6 staging）：
  缺陷态 frame 位移 40px 重落位开关总位移 80px、相对 ⊡ 漂 40px；修复后
  总位移 40px、相对 ⊡ 几何不变。`pnpm verify` 全绿（verify:fast +
  e2e 21/21，307774ms）；mobile-shell 复跑 PASS（8127ms）。
- SOLUTION 对照: SOLUTION 贴靠段已补布局坐标基（主句 + 4 子项），与实现
  一致；PRD 未动（短路路径）。
- commit: 683e6e5
- review:
  - 审核方: 双轴独立子代理（Standards d24600c4、Spec a9608b3c）
  - 目的理解: hero 贴靠几何坐标基缺陷——视口 rect 烘进 frame 内 absolute
    坐标，frame 合成层位移期重落位重复计入位移；修复改锚布局坐标使重落位
    幂等；关联 R-01-008/AC-04 贴靠语义、C-091/C-093、T-164/T-168/T-171
    既有边界；验证方式为探针实证、位移耦合回归与 `pnpm verify`。
  - 执行方式: code-review 双轴并行，基线 b349186、工作区全 diff；复审为
    同轴二轮。
  - 问题与修复: Standards 三项 Low——tmp-probe2/ 探针残留（已删除）、
    SOLUTION 长句超 40 字（已拆主句 + 4 子项）、e2e frame 查找重复且裸
    TypeError（已提 frameEl evaluateHandle 助手 + 「frame 在场」断言）。
    Spec F1 Low——位移回归等待谓词 Promise 未 await 致轮询恒真（三目移入
    evaluate 回调内，轮询语义恢复）。F2/F3 落点为本矩阵兼容性行与本终态。
  - 复审结论: 两轴复审均通过，无新发现。
- 边界与残余风险（审核确认非阻断）: 贴靠几何前提为锚与开关 offsetParent
  同为 frame（壳层 3.0.6 实证，宿主改版由绑定壳层版本的 e2e 兜底）；在屏
  锚选择仍用视口 rect，横向位移瞬间选择判据与几何基可瞬时不一致（下次重
  落位自愈）；`scripts/check.mjs` 的 `fabRect` 全 bundle 反断言遇同名标识
  符会误红（既定锚点模式）。
