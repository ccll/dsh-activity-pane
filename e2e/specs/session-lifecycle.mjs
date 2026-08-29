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

	// R-01-009/AC-06：百分比与进度条同行并紧跟其右侧，标题行不再承载百分比。
	const progressGeometry = await until("运行卡进度行就绪", () =>
		page.evaluate((title) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			const card = [...(pane?.querySelectorAll('[role="button"]') ?? [])].find((candidate) => candidate.innerText.includes(title));
			const progress = card?.querySelector(".dap-progress");
			const track = card?.querySelector(".dap-track");
			const pct = card?.querySelector(".dap-pct");
			const elapsed = card?.querySelector(".dap-token-time");
			const titleRow = card?.querySelector(".dap-row");
			if (!progress || !track || !pct || !elapsed?.textContent || !titleRow) return null;
			const textRight = (element) => {
				const range = document.createRange();
				range.selectNodeContents(element);
				return range.getBoundingClientRect().right;
			};
			const progressRect = progress.getBoundingClientRect();
			const trackRect = track.getBoundingClientRect();
			const pctRect = pct.getBoundingClientRect();
			const elapsedTextRight = textRight(elapsed);
			const originalText = pct.textContent;
			pct.textContent = "9%";
			const widthAtOneDigit = pct.getBoundingClientRect().width;
			const textRightAtOneDigit = textRight(pct);
			pct.textContent = "100%";
			const widthAtThreeDigits = pct.getBoundingClientRect().width;
			const textRightAtThreeDigits = textRight(pct);
			pct.textContent = originalText;
			return {
				progressTop: progressRect.top,
				progressBottom: progressRect.bottom,
				trackRight: trackRect.right,
				pctLeft: pctRect.left,
				pctTop: pctRect.top,
				pctBottom: pctRect.bottom,
				widthAtOneDigit,
				widthAtThreeDigits,
				textRightAtOneDigit,
				textRightAtThreeDigits,
				elapsedTextRight,
				titleContainsPct: titleRow.contains(pct),
			};
		}, TITLE),
	);
	assert.ok(progressGeometry.pctLeft >= progressGeometry.trackRight, "百分比位于进度条右侧（R-01-009/AC-06）");
	assert.ok(
		progressGeometry.pctTop < progressGeometry.progressBottom && progressGeometry.pctBottom > progressGeometry.progressTop,
		"百分比与进度条位于同一进度行（R-01-009/AC-06）",
	);
	assert.equal(progressGeometry.titleContainsPct, false, "标题行不再承载进度百分比（R-01-009/AC-06）");
	assert.ok(
		Math.abs(progressGeometry.widthAtOneDigit - progressGeometry.widthAtThreeDigits) <= 0.5,
		"百分比从 9% 变化到 100% 时保持固定宽度，进度条右端不跳动（R-01-009/AC-06）",
	);
	assert.ok(
		Math.abs(progressGeometry.textRightAtOneDigit - progressGeometry.elapsedTextRight) <= 0.5 &&
			Math.abs(progressGeometry.textRightAtThreeDigits - progressGeometry.elapsedTextRight) <= 0.5,
		"百分比在固定占位内右对齐，9% 与 100% 的文字右缘均和下一行耗时右缘对齐（R-01-009/AC-06）",
	);

	// R-01-009/AC-09：真实浏览器裁决时间线点整体小于标题点，且与竖线同圆心；
	// running 节点继续以光晕和脉冲表达当前活动。
	const dotGeometry = await until("运行卡时间线圆点几何就绪", () =>
		page.evaluate((title) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			const card = [...(pane?.querySelectorAll('[role="button"]') ?? [])].find((candidate) => candidate.innerText.includes(title));
			const item = card?.querySelector('.dap-trace-item[data-status="running"]');
			const settledItem = card?.querySelector('.dap-trace-item:not([data-status="running"])');
			const titleDot = card?.querySelector(".dap-dot");
			const trace = card?.querySelector(".dap-trace");
			if (!item || !settledItem || !titleDot || !trace) return null;
			const node = getComputedStyle(item, "::before");
			const settledNode = getComputedStyle(settledItem, "::before");
			const heading = getComputedStyle(titleDot);
			const line = getComputedStyle(trace, "::before");
			const itemRect = item.getBoundingClientRect();
			const titleRect = titleDot.getBoundingClientRect();
			const traceRect = trace.getBoundingClientRect();
			const borderWidth = Number.parseFloat(node.borderLeftWidth);
			return {
				nodeWidth: Number.parseFloat(node.width),
				nodeHeight: Number.parseFloat(node.height),
				nodeCoreWidth: Number.parseFloat(node.width) - borderWidth * 2,
				nodeCenterX: itemRect.left + Number.parseFloat(node.left) + Number.parseFloat(node.width) / 2,
				titleWidth: Number.parseFloat(heading.width),
				titleHeight: Number.parseFloat(heading.height),
				titleCenterX: titleRect.left + Number.parseFloat(heading.width) / 2,
				lineCenterX: traceRect.left + Number.parseFloat(line.left) + Number.parseFloat(line.width) / 2,
				animation: node.animationName,
				opacity: Number.parseFloat(node.opacity),
				borderColor: node.borderLeftColor,
				backgroundClip: node.backgroundClip,
				nodeBoxShadow: node.boxShadow,
				settledBoxShadow: settledNode.boxShadow,
				nodeFilter: node.filter,
				settledFilter: settledNode.filter,
			};
		}, TITLE),
	);
	const pulseOpacities = [dotGeometry.opacity];
	for (let sample = 0; sample < 2; sample += 1) {
		await page.waitForTimeout(300);
		pulseOpacities.push(
			await page.evaluate(() => {
				const running = document.querySelector('[data-dsh-activity-pane] .dap-trace-item[data-status="running"]');
				return running ? Number.parseFloat(getComputedStyle(running, "::before").opacity) : Number.NaN;
			}),
		);
	}

	assert.deepEqual([dotGeometry.nodeWidth, dotGeometry.nodeHeight], [7, 7], "时间线节点使用 7×7px 同心承载盒（R-01-009/AC-09）");
	assert.equal(dotGeometry.nodeCoreWidth, 5, "时间线承载盒内保留 5px 实心核（R-01-009/AC-09）");
	assert.deepEqual([dotGeometry.titleWidth, dotGeometry.titleHeight], [7, 7], "标题状态点保持 7×7px（R-01-009/AC-09）");
	assert.ok(Math.abs(dotGeometry.nodeCenterX - dotGeometry.titleCenterX) <= 0.5, "时间线承载盒与标题点的页面绝对圆心竖直对齐（R-01-009/AC-09）");
	assert.ok(Math.abs(dotGeometry.nodeCenterX - dotGeometry.lineCenterX) <= 0.5, "时间线承载盒与竖线的页面绝对圆心竖直对齐（R-01-009/AC-09）");
	assert.equal(dotGeometry.borderColor, "rgba(0, 0, 0, 0)", "7px 承载盒边界透明不可见（R-01-009/AC-09）");
	assert.equal(dotGeometry.backgroundClip, "padding-box", "透明承载盒内仅绘制 5px 圆核（R-01-009/AC-09）");
	assert.equal(dotGeometry.settledBoxShadow, "none", "已定案节点不按 7px 承载盒绘制 box-shadow（R-01-009/AC-09）");
	assert.equal(dotGeometry.nodeBoxShadow, "none", "running 节点不按 7px 承载盒绘制 box-shadow（R-01-009/AC-09）");
	assert.match(dotGeometry.settledFilter, /drop-shadow\(rgba\(119, 131, 148, 0\.32\) 0px 0px 1px\)/, "已定案节点光晕跟随 5px 圆核 alpha 轮廓（R-01-009/AC-09）");
	assert.equal(dotGeometry.animation, "dap-pulse", "running 时间线点保留脉冲（R-01-009/AC-09）");
	assert.match(dotGeometry.nodeFilter, /drop-shadow\(rgba\(101, 160, 255, 0\.32\) 0px 0px 1px\)/, "running 节点保留基于 5px 圆核的半透明外围（R-01-009/AC-09）");
	assert.match(dotGeometry.nodeFilter, /drop-shadow\(rgba\(101, 160, 255, 0\.65\) 0px 0px 3px\)/, "running 节点保留基于 5px 圆核的状态光晕（R-01-009/AC-09）");
	assert.ok(pulseOpacities.every(Number.isFinite) && Math.max(...pulseOpacities) - Math.min(...pulseOpacities) > 0.05, `running 时间线点 opacity 随 dap-pulse 跨时间变化（采样 ${pulseOpacities.join(", ")}，R-01-009/AC-09）`);

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
