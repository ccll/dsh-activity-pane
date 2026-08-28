// R-01-002/AC-04、R-01-002/AC-05、R-01-002/AC-06、R-01-002/AC-09、
// R-01-002/AC-10、R-01-002/AC-12、R-01-002/AC-13
// mock LLM HTTP failure → Agent error turn/end → Host completion registry → SSE → browser error card。

import { MOCK_ERROR_MESSAGE } from "../mock-llm.mjs";
import { activateCard, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:error 错误提醒跨边界探针";

export default async function errorReminder({ page, url, mock, assert }) {
	await openApp(page, url);
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
		const acks = await page.evaluate(() => fetch("/dsh-activity-pane/api/acks").then((res) => res.json()));
		throw new Error(`${error.message}；Host 快照：${JSON.stringify(acks)}`);
	}

	assert.ok(mock.scenarioLog.includes("error"), "请求实际命中 error mock 剧本");
	const card = page.locator('[data-dsh-activity-pane] .dap-card[data-wait="error"]').filter({ hasText: TITLE });
	assert.equal(await card.count(), 1, "错误回合形成唯一红色错误卡");
	assert.equal(await card.getByRole("button", { name: "移入历史" }).count(), 0, "错误提醒不提供完成确认按钮");
	assert.equal(await page.locator('[data-dsh-activity-pane] [data-tone="error"]').count() > 0, true, "数量标识采用错误色调");

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
