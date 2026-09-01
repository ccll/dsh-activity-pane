// R-01-001/AC-01、R-01-001/AC-02、R-01-002/AC-03、R-01-002/AC-10、R-01-009/AC-09、R-01-009/AC-12、R-01-009/AC-13、R-01-010/AC-01、R-01-010/AC-02、R-01-013/AC-12、R-01-010/AC-04
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
			const textRect = (element) => {
				const range = document.createRange();
				range.selectNodeContents(element);
				return range.getBoundingClientRect();
			};
			const originalPaneWidth = pane.style.getPropertyValue("--dap-width");
			pane.style.setProperty("--dap-width", "200px");
			const paneRect = pane.getBoundingClientRect();
			const cardRect = card.getBoundingClientRect();
			const progressRect = progress.getBoundingClientRect();
			const trackRect = track.getBoundingClientRect();
			const pctRect = pct.getBoundingClientRect();
			const elapsedTextRight = textRect(elapsed).right;
			const originalText = pct.textContent;
			pct.textContent = "9%";
			const widthAtOneDigit = pct.getBoundingClientRect().width;
			const textAtOneDigit = textRect(pct);
			pct.textContent = "100%";
			const widthAtThreeDigits = pct.getBoundingClientRect().width;
			const textAtThreeDigits = textRect(pct);
			pct.textContent = originalText;
			if (originalPaneWidth === "") pane.style.removeProperty("--dap-width");
			else pane.style.setProperty("--dap-width", originalPaneWidth);
			return {
				paneWidth: paneRect.width,
				paneRight: paneRect.right,
				cardRight: cardRect.right,
				progressTop: progressRect.top,
				progressBottom: progressRect.bottom,
				trackTop: trackRect.top,
				trackRight: trackRect.right,
				trackBottom: trackRect.bottom,
				trackWidth: trackRect.width,
				pctLeft: pctRect.left,
				pctRight: pctRect.right,
				pctTop: pctRect.top,
				pctBottom: pctRect.bottom,
				widthAtOneDigit,
				widthAtThreeDigits,
				textLeftAtOneDigit: textAtOneDigit.left,
				textRightAtOneDigit: textAtOneDigit.right,
				textLeftAtThreeDigits: textAtThreeDigits.left,
				textRightAtThreeDigits: textAtThreeDigits.right,
				elapsedText: elapsed.textContent,
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
	const pctCenter = (progressGeometry.pctTop + progressGeometry.pctBottom) / 2;
	const trackCenter = (progressGeometry.trackTop + progressGeometry.trackBottom) / 2;
	assert.ok(
		trackCenter - pctCenter >= 0.5 && trackCenter - pctCenter <= 1.5,
		"百分比行盒中心相对进度条中心上移约 1px，视觉不再偏下（R-01-009/AC-06）",
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
	assert.ok(
		Math.abs(progressGeometry.paneWidth - 200) <= 0.5 &&
			progressGeometry.trackWidth > 0 &&
			progressGeometry.textLeftAtOneDigit >= progressGeometry.pctLeft - 0.5 &&
			progressGeometry.textLeftAtThreeDigits >= progressGeometry.pctLeft - 0.5 &&
			progressGeometry.textRightAtOneDigit <= progressGeometry.pctRight + 0.5 &&
			progressGeometry.textRightAtThreeDigits <= progressGeometry.pctRight + 0.5 &&
			progressGeometry.pctRight <= progressGeometry.cardRight + 0.5 &&
			progressGeometry.cardRight <= progressGeometry.paneRight + 0.5,
		"窗格实际为 200px 最窄宽时进度条仍可见，9% 与 100% 均完整容纳且不越过卡片或窗格右界（R-01-009/AC-06）",
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
	// R-01-009/AC-12：完成提醒仍显示上一轮耗时，且等待时间不继续累加。
	const completedElapsed = await until("完成提醒保留上一轮耗时", () =>
		page.evaluate((title) => {
			const card = [...(document.querySelector("[data-dsh-activity-pane]")?.querySelectorAll('[role="button"]') ?? [])]
				.find((candidate) => candidate.innerText.includes(title));
			const time = card?.querySelector(".dap-await-head .dap-token-time");
			const capsule = card?.querySelector(".dap-await-head .dap-capsule");
			const row = card?.querySelector(".dap-await-head");
			if (!time?.textContent || !capsule || !row) return null;
			return {
				text: time.textContent,
				sameRow: time.parentElement === capsule.parentElement,
				rightAligned: Math.abs(time.getBoundingClientRect().right - row.getBoundingClientRect().right) <= 1,
			};
		}, TITLE),
	);
	assert.match(completedElapsed.text, /^\d+(?:m\d+s|s)$/, "完成提醒卡右下角显示固定上一轮耗时（R-01-009/AC-12）");
	assert.equal(completedElapsed.sameRow, true, "完成提醒耗时与等待类型胶囊处于同一行（R-01-009/AC-12）");
	assert.equal(completedElapsed.rightAligned, true, "完成提醒耗时贴合等待类型胶囊行最右侧（R-01-009/AC-12）");
	// R-01-009/AC-13：完成提醒保留进入等待前最后已知的四项 token 统计，耗时仍由等待类型同行承载。
	const readCompletedStats = () => page.evaluate((title) => {
		const card = [...(document.querySelector("[data-dsh-activity-pane]")?.querySelectorAll('[role="button"]') ?? [])]
			.find((candidate) => candidate.innerText.includes(title));
		const stats = card?.querySelector(".dap-token-stats");
		const main = stats?.querySelector(".dap-token-main");
		const foot = card?.querySelector(".dap-foot");
		if (!card || !stats || stats.hidden || !main?.textContent?.trim() || !foot) return null;
		return {
			main: main.textContent.trim(),
			beforeAwaitingFoot: stats.nextElementSibling === foot,
			duplicateTime: stats.querySelector(".dap-token-time")?.textContent.trim() ?? "",
		};
	}, TITLE);
	const completedStats = await until("完成提醒保留上一轮统计", readCompletedStats);
	assert.match(completedStats.main, /tok\/s/, "完成提醒统计行保留 tok/s 输出速率（R-01-009/AC-13）");
	assert.match(completedStats.main, /缓存 \d+%/, "完成提醒统计行保留缓存命中率（R-01-009/AC-13）");
	assert.match(completedStats.main, /输入/, "完成提醒统计行保留计费输入 token（R-01-009/AC-13）");
	assert.match(completedStats.main, /输出/, "完成提醒统计行保留输出 token（R-01-009/AC-13）");
	assert.equal(completedStats.beforeAwaitingFoot, true, "完成提醒统计行位于时间线之后、等待提示之前（R-01-009/AC-13）");
	assert.equal(completedStats.duplicateTime, "", "等待卡统计行不重复显示等待类型同行耗时（R-01-009/AC-13）");
	await page.waitForTimeout(1_300);
	assert.equal(
		await page.evaluate((title) => {
			const card = [...(document.querySelector("[data-dsh-activity-pane]")?.querySelectorAll('[role="button"]') ?? [])]
				.find((candidate) => candidate.innerText.includes(title));
			return card?.querySelector(".dap-await-head .dap-token-time")?.textContent || "";
		}, TITLE),
		completedElapsed.text,
		"完成提醒等待期间耗时保持冻结，不把等待时间计入（R-01-009/AC-12）",
	);
	const completedStatsAfterWait = await readCompletedStats();
	assert.equal(completedStatsAfterWait?.main, completedStats.main, "完成提醒等待期间 token 统计保持冻结（R-01-009/AC-13）");
	assert.match(completedStats.main, /tok\/s/, "完成提醒统计行保留 tok/s 输出速率（R-01-009/AC-13）");
	assert.match(completedStats.main, /缓存 \d+%/, "完成提醒统计行保留缓存命中率（R-01-009/AC-13）");
	assert.match(completedStats.main, /输入/, "完成提醒统计行保留计费输入 token（R-01-009/AC-13）");
	assert.match(completedStats.main, /输出/, "完成提醒统计行保留输出 token（R-01-009/AC-13）");
	assert.equal(completedStats.beforeAwaitingFoot, true, "完成提醒统计行位于时间线之后、等待提示之前（R-01-009/AC-13）");
	assert.equal(completedStats.duplicateTime, "", "等待卡统计行不重复显示等待类型同行耗时（R-01-009/AC-13）");
	await openApp(page, url);
	const refreshedCompletedElapsed = await until("刷新后恢复完成提醒耗时", () =>
		page.evaluate((title) => {
			const card = [...(document.querySelector("[data-dsh-activity-pane]")?.querySelectorAll('[role="button"]') ?? [])]
				.find((candidate) => candidate.innerText.includes(title));
			return card?.querySelector(".dap-await-head .dap-token-time")?.textContent || null;
		}, TITLE),
	);
	assert.equal(refreshedCompletedElapsed, completedElapsed.text, "完成提醒刷新后仍保留同一轮耗时（R-01-009/AC-12）");
	const refreshedCompletedStats = await until("刷新后恢复完成提醒统计", readCompletedStats);
	assert.match(refreshedCompletedStats.main, /tok\/s/, "完成提醒刷新后恢复 tok/s 输出速率（R-01-009/AC-13）");
	assert.match(refreshedCompletedStats.main, /缓存 \d+%/, "完成提醒刷新后恢复缓存命中率（R-01-009/AC-13）");
	assert.match(refreshedCompletedStats.main, /输入/, "完成提醒刷新后恢复计费输入 token（R-01-009/AC-13）");
	assert.match(refreshedCompletedStats.main, /输出/, "完成提醒刷新后恢复输出 token（R-01-009/AC-13）");

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
	// R-01-013/AC-12：确认迁入历史后，最近卡在助手预览与活动时间之间保留最近回合统计。
	const readRecentStats = () => page.evaluate((title) => {
		const card = [...(document.querySelectorAll('[data-dsh-activity-pane] [data-kind="recent"]') ?? [])]
			.find((candidate) => candidate.innerText.includes(title));
		const stats = card?.querySelector(".dap-token-stats");
		const main = stats?.querySelector(".dap-token-main");
		const elapsed = stats?.querySelector(".dap-token-time");
		const activity = card?.querySelector(".dap-note");
		if (!card || !stats || stats.hidden || !main?.textContent?.trim() || !elapsed?.textContent?.trim() || !activity) return null;
		const children = [...card.children];
		return {
			main: main.textContent.trim(),
			elapsed: elapsed.textContent.trim(),
			statsBeforeActivity: stats.nextElementSibling === activity,
			statsIsPenultimate: children.at(-2) === stats,
			activityIsLast: children.at(-1) === activity,
		};
	}, TITLE);
	const recentStats = await until("历史卡保留最近回合统计", readRecentStats);
	assert.match(recentStats.main, /tok\/s/, "历史卡统计行保留 tok/s 输出速率（R-01-013/AC-12）");
	assert.match(recentStats.main, /缓存 \d+%/, "历史卡统计行保留缓存命中率（R-01-013/AC-12）");
	assert.match(recentStats.main, /输入/, "历史卡统计行保留计费输入 token（R-01-013/AC-12）");
	assert.match(recentStats.main, /输出/, "历史卡统计行保留输出 token（R-01-013/AC-12）");
	assert.match(recentStats.elapsed, /^\d+(?:m\d+s|s)$/, "历史卡统计行保留固定回合耗时（R-01-013/AC-12）");
	assert.equal(recentStats.statsBeforeActivity, true, "历史卡统计行紧邻活动时间行之前（R-01-013/AC-12）");
	assert.equal(recentStats.statsIsPenultimate, true, "历史卡统计行位于历史卡倒数第二行（R-01-013/AC-12）");
	assert.equal(recentStats.activityIsLast, true, "历史卡活动时间保持最后一行（R-01-013/AC-12）");
	await openApp(page, url);
	const refreshedRecentStats = await until("刷新后恢复历史卡最近回合统计", readRecentStats);
	assert.deepEqual(
		{ main: refreshedRecentStats.main, elapsed: refreshedRecentStats.elapsed },
		{ main: recentStats.main, elapsed: recentStats.elapsed },
		"刷新后历史卡统计与耗时保持一致（R-01-013/AC-12）",
	);
}
