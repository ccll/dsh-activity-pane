// R-01-002/AC-05、R-01-002/AC-06、R-01-002/AC-09、R-01-002/AC-10、R-01-002/AC-12、R-01-002/AC-13
// mock LLM HTTP failure → Agent error turn/end → Host completion registry → SSE → browser error card。
// AC-05 此处覆盖打开会话不解除；切换保持由 core 契约覆盖。AC-13 此处覆盖错误成立，活动后代抑制与新回合覆盖由 core 契约覆盖。

import { activateCard, activityAcks, MOCK_ERROR_MESSAGE, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:error 跨边界故障探针";

export default async function errorReminder({ page, url, mock, assert }) {
	await openApp(page, url);
	await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));
	await sendHeroMessage(page, TITLE);

	try {
		await until("模型故障形成错误提醒", async () => {
			const regions = await paneRegions(page);
			return regions?.active.includes(TITLE) &&
				regions.active.includes("错误") &&
				regions.active.includes(MOCK_ERROR_MESSAGE)
				? regions
				: null;
		}, 20_000);
	} catch (error) {
		const acks = await activityAcks(page);
		throw new Error(`${error.message}；Host 快照：${JSON.stringify(acks)}`);
	}

	assert.ok(mock.scenarioLog.includes("error"), "请求实际命中 error mock 剧本");
	const errorBadge = await page.evaluate(() => {
		const count = document.querySelector("[data-dsh-activity-pane] .dap-count");
		if (!count) return null;
		return {
			text: count.textContent.trim(),
			tone: count.getAttribute("data-tone"),
			background: getComputedStyle(count).backgroundColor,
			animation: getComputedStyle(count).animationName,
		};
	});
	assert.ok(errorBadge && /^\d+\/\d+$/.test(errorBadge.text), "错误提醒时列头保持 n/m 计数（R-01-001/AC-04～AC-06）");
	assert.deepEqual(
		{ tone: errorBadge.tone, background: errorBadge.background, animation: errorBadge.animation },
		{ tone: "error", background: "rgba(40, 29, 31, 0.97)", animation: "dap-await-pulse" },
		"错误提醒优先驱动红色数量徽标并脉冲（R-01-002/AC-06）",
	);
	const pane = page.locator("[data-dsh-activity-pane]");
	assert.equal(await pane.getByRole("button", { name: "移入历史" }).count(), 0, "错误提醒不提供完成确认按钮");

	await activateCard(page, TITLE);
	await until("打开会话不解除错误提醒", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(TITLE) && regions.active.includes(MOCK_ERROR_MESSAGE) ? regions : null;
	});

	await openApp(page, url);
	await until("刷新后恢复错误提醒", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(TITLE) &&
			regions.active.includes("错误") &&
			regions.active.includes(MOCK_ERROR_MESSAGE)
			? regions
			: null;
	}, 20_000);
}
