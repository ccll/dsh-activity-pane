// R-01-001/AC-01、R-01-001/AC-02、R-01-002/AC-03、R-01-002/AC-10、R-01-009/AC-09、R-01-010/AC-01、R-01-010/AC-02、R-01-010/AC-04
// 会话生命周期端到端：空态 → e2e:slow 剧本运行卡 → 完成提醒卡 → 确认移入历史区。
// 只断言用户可观察的呈现（区域文字、按钮、页面 URL），不依赖内部 DOM 结构（C-045）。

import { openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:slow 慢速任务探针";

export default async function sessionLifecycle({ page, url, mock, assert }) {
	await openApp(page, url);

	// R-01-001/AC-02、R-01-010/AC-04：无活动会话时活动区显示明确空态而非空白。
	// 宽限 30s：观测到宿主 sessions 服务偶发推送停滞（窗格滞留「加载中…」，见 TODO 缺陷线索）。
	await until("窗格挂载并显示空态", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("暂无活动会话") ? regions : null;
	}, 30_000);

	// 经真实 composer 发送 e2e:slow 指令（R-01-001/AC-01 的驱动路径）。
	await sendHeroMessage(page, TITLE);

	// R-01-001/AC-01：慢速剧本流式期间（约 3.6s）活动区出现该会话条目，
	// 且不呈现完成提醒文案。
	await until("活动区出现会话条目", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE) ? regions : null;
	});
	const duringRun = await paneRegions(page);
	assert.ok(!duringRun.active.includes("已完成"), "流式期间不呈现「已完成」");

	// R-01-009/AC-09：真实浏览器裁决时间线点整体小于标题点，且与竖线同圆心；
	// running 节点继续以光晕和脉冲表达当前活动。
	const dotGeometry = await until("运行卡时间线圆点几何就绪", () =>
		page.evaluate((title) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			const card = [...(pane?.querySelectorAll('[role="button"]') ?? [])].find((candidate) => candidate.innerText.includes(title));
			const item = card?.querySelector('.dap-trace-item[data-status="running"]');
			const titleDot = card?.querySelector(".dap-dot");
			const trace = card?.querySelector(".dap-trace");
			if (!item || !titleDot || !trace) return null;
			const node = getComputedStyle(item, "::before");
			const heading = getComputedStyle(titleDot);
			const line = getComputedStyle(trace, "::before");
			return {
				nodeWidth: Number.parseFloat(node.width),
				nodeHeight: Number.parseFloat(node.height),
				nodeCenterX: Number.parseFloat(node.left) + Number.parseFloat(node.width) / 2,
				titleWidth: Number.parseFloat(heading.width),
				titleHeight: Number.parseFloat(heading.height),
				titleCenterX: Number.parseFloat(heading.width) / 2,
				lineCenterX: Number.parseFloat(line.left) + Number.parseFloat(line.width) / 2,
				animation: node.animationName,
				glow: node.boxShadow,
			};
		}, TITLE),
	);
	assert.deepEqual([dotGeometry.nodeWidth, dotGeometry.nodeHeight], [5, 5], "时间线节点整体为 5×5px（R-01-009/AC-09）");
	assert.deepEqual([dotGeometry.titleWidth, dotGeometry.titleHeight], [7, 7], "标题状态点保持 7×7px（R-01-009/AC-09）");
	assert.equal(dotGeometry.nodeCenterX, dotGeometry.titleCenterX, "时间线点与标题点同圆心（R-01-009/AC-09）");
	assert.equal(dotGeometry.nodeCenterX, dotGeometry.lineCenterX, "时间线点与竖线同圆心（R-01-009/AC-09）");
	assert.equal(dotGeometry.animation, "dap-pulse", "running 时间线点保留脉冲（R-01-009/AC-09）");
	assert.notEqual(dotGeometry.glow, "none", "running 时间线点保留光晕（R-01-009/AC-09）");

	// mock 必须确实命中 slow 剧本（证明链路经 mock LLM 而非真实模型）。
	assert.ok(mock.scenarioLog.includes("slow"), `mock 应命中 slow 剧本，实际：${mock.scenarioLog}`);

	// R-01-002/AC-03：回合结束后以「已完成」呈现（完成提醒），并提供确认按钮。
	await until("呈现完成提醒与确认按钮", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("已完成") && regions.active.includes("移入历史") ? regions : null;
	});

	// R-01-002/AC-10：激活确认按钮不触发会话跳转；R-01-010/AC-01、AC-02：
	// 确认后条目离开活动区、进入历史区。
	const urlBefore = page.url();
	await page.getByRole("button", { name: "移入历史", exact: true }).click();
	assert.equal(page.url(), urlBefore, "确认按钮不得触发会话跳转");
	await until("条目迁入历史区", async () => {
		const regions = await paneRegions(page);
		if (!regions || regions.active.includes(TITLE)) return null;
		return regions.recent.includes(TITLE) ? regions : null;
	});
}
