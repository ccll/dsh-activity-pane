// R-01-004/AC-01、R-01-004/AC-02
// 长列表：活动卡片超出窗格可视高度时窗格内可滚动查看全部卡片；
// 窗格内滚动时主会话内容滚动位置不变（滚动隔离）。

import { cardVisibleInPane, mainAreaBox, mainAreaHas, newSessionWithMessage, openApp, paneBox, sendHeroMessage, until, wheelOver } from "../helpers.mjs";

const SESSION_COUNT = 7;
const title = (n) => `e2e:fast 长列表探针${String(n).padStart(2, "0")}`;
const LONG_TITLE = "e2e:slow 长列表长文探针";

/** 主会话区（窗格以右）全部可滚动元素的 scrollTop 快照。 */
async function mainScrollTops(page) {
	const box = await paneBox(page);
	const paneRight = box.x + box.width;
	return page.evaluate(
		(paneRight) =>
			[...document.querySelectorAll("body *")]
				.filter((el) => el.scrollHeight > el.clientHeight + 4 && el.getBoundingClientRect().x >= paneRight - 1)
				.map((el) => el.scrollTop),
		paneRight,
	);
}

/** 窗格内全部可滚动元素的 scrollTop 快照。 */
async function paneScrollTops(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return [];
		return [...pane.querySelectorAll("*")]
			.filter((el) => el.scrollHeight > el.clientHeight + 4)
			.map((el) => el.scrollTop);
	});
}

export default async function longList({ page, url, assert }) {
	// 压低视口高度：卡片列表与主会话长文都更容易超出可视区域。
	await page.setViewportSize({ width: 1100, height: 500 });
	await openApp(page, url);

	// 会话 1 用 slow 剧本产生长内容（供主会话滚动隔离观察）；其余 fast。
	// 完成提醒卡累积在活动区，超出窗格可视高度。
	await sendHeroMessage(page, LONG_TITLE);
	for (let n = 1; n < SESSION_COUNT; n += 1) {
		await newSessionWithMessage(page, title(n));
	}
	await until("10 张卡片全部进入活动区", async () => {
		const count = await page.locator("[data-dsh-activity-pane]").getByText("探针", { exact: false }).count();
		return count >= SESSION_COUNT ? true : null;
	}, 30_000);

	// R-01-004/AC-01：列表超高时最早卡片（排序在底部）初始不可见，窗格内滚动后可见（全部卡片可达）。
	await until("底卡初始不可见（列表超高）", async () => {
		const visible = await cardVisibleInPane(page, LONG_TITLE);
		return visible ? null : true;
	});
	const box = await paneBox(page);
	await wheelOver(page, box, 400, 20);
	await until("滚动后底卡可见", () => cardVisibleInPane(page, LONG_TITLE));

	// R-01-004/AC-02：窗格滚动不影响主会话滚动位置。
	// 切到长文会话，把主会话向下滚动到非零位置，再在窗格内滚动。
	await page.locator("[data-dsh-activity-pane]").getByText(LONG_TITLE, { exact: false }).first().click();
	await until("主会话区出现长文", () => mainAreaHas(page, "慢速输出片段 24/24"));
	const mainBox = await mainAreaBox(page);
	await wheelOver(page, mainBox, 400, 15);
	const before = await mainScrollTops(page);
	assert.ok(before.some((top) => top > 0), `主会话已滚动到非零位置，实际：${before}`);
	await wheelOver(page, box, -400, 10);
	await wheelOver(page, box, 400, 10);
	const after = await mainScrollTops(page);
	assert.deepEqual(after, before, `窗格滚动不影响主会话滚动位置（${before} → ${after}）`);

	// 反向隔离：主会话滚动时窗格滚动位置同样不变。
	const paneBefore = await paneScrollTops(page);
	assert.ok(paneBefore.some((top) => top > 0), `窗格处于已滚动位置，实际：${paneBefore}`);
	await wheelOver(page, mainBox, -400, 10);
	await wheelOver(page, mainBox, 400, 10);
	const paneAfter = await paneScrollTops(page);
	assert.deepEqual(paneAfter, paneBefore, `主会话滚动不影响窗格滚动位置（${paneBefore} → ${paneAfter}）`);
}
