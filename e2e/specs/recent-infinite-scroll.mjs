// R-01-010/AC-01、R-01-010/AC-03、R-01-019/AC-01～AC-04
// 历史会话分页：创建超过两个批次的已完成主会话，验证首批、触底追加、末批与滚动隔离。

import { clickCardButton, newSessionWithMessage, openApp, paneRegions, until } from "../helpers.mjs";

const CARD_SELECTOR = '[data-dsh-activity-pane] .dap-recent .dap-card';

async function recentCardTexts(page) {
	return page.locator(CARD_SELECTOR).evaluateAll((cards) => cards.map((card) => card.innerText));
}

async function recentCardCount(page) {
	return page.locator(CARD_SELECTOR).count();
}

async function waitForRecentOrder(page, expectedTitles, label) {
	return until(label, async () => {
		const texts = await recentCardTexts(page);
		return texts.length === expectedTitles.length && texts.every((text, index) => text.includes(expectedTitles[index])) ? texts : null;
	}, 20_000);
}

async function scrollPaneToBottom(page) {
	await page.locator("[data-dsh-activity-pane] .dap-scroll").evaluate((scroll) => {
		scroll.scrollTo({ top: scroll.scrollHeight, behavior: "auto" });
	});
}

async function stableMainScrollTop(page, label) {
	return until(label, async () => {
		const read = () => page.evaluate(() => document.querySelector("[data-conversation-scroll]")?.scrollTop ?? null);
		const first = await read();
		await page.waitForTimeout(100);
		const second = await read();
		return first === second ? { present: first !== null, top: first } : null;
	});
}

export default async function recentInfiniteScroll({ page, url, mock, assert }) {
	await openApp(page, url);
	const titles = [];

	for (let index = 1; index <= 21; index += 1) {
		const title = `e2e:fast history page ${String(index).padStart(2, "0")}`;
		titles.push(title);
		await newSessionWithMessage(page, title);
		await until(`第 ${index} 个会话完成提醒就绪`, async () => {
			const regions = await paneRegions(page);
			return regions?.active.includes(title) && regions.active.includes("移入历史") ? regions : null;
		}, 20_000);
		await clickCardButton(page, title, "移入历史");
		await until(`第 ${index} 个会话进入历史区`, async () => {
			const regions = await paneRegions(page);
			return regions?.recent.includes(title) ? regions : null;
		}, 20_000);
	}

	// R-01-019/AC-01：超过 10 条时首屏只呈现最近 10 条，顺序由最后活动时间决定。
	const firstPage = await waitForRecentOrder(page, titles.slice().reverse().slice(0, 10), "历史区首批 10 条详情就绪");
	assert.equal(firstPage.length, 10, "历史区首批只呈现 10 张卡片（R-01-019/AC-01）");
	assert.ok(!firstPage.some((text) => text.includes(titles[10])), "第二批首个会话尚未进入首批 DOM（R-01-019/AC-01）");

	// R-01-019/AC-02、R-01-019/AC-04：滚动历史区到底只追加一批，既有卡片保留，主会话滚动不受影响。
	const regionsAfterCreation = await paneRegions(page);
	assert.ok(regionsAfterCreation && titles.every((title) => !regionsAfterCreation.active.includes(title)), "已移入历史的会话不与活动区重复（R-01-019/AC-04）");
	const mainScrollBefore = await page.evaluate(() => document.querySelector("[data-conversation-scroll]")?.scrollTop ?? null);
	await scrollPaneToBottom(page);
	await until("历史区追加第二批", async () => (await recentCardCount(page)) === 20);
	const secondPage = await waitForRecentOrder(page, titles.slice().reverse().slice(0, 20), "历史区前两批详情就绪");
	const seenTitles = secondPage.map((text) => titles.find((title) => text.includes(title)));
	assert.equal(new Set(seenTitles).size, 20, "两批历史卡片没有重复（R-01-019/AC-02）");
	assert.ok(secondPage[10].includes(titles[10]), "触底后追加第 11 个会话（R-01-019/AC-02）");
	assert.ok(secondPage[19].includes(titles[1]), "触底后第二批末卡为第 2 个会话（R-01-019/AC-02）");
	const mainScrollAfter = await page.evaluate(() => document.querySelector("[data-conversation-scroll]")?.scrollTop ?? null);
	assert.equal(mainScrollAfter, mainScrollBefore, "历史区滚动不改变主会话滚动位置（R-01-019/AC-04）");

	// R-01-019/AC-03：第三次触底只追加剩余 1 条，之后不再增长。
	await scrollPaneToBottom(page);
	await until("历史区追加末批", async () => (await recentCardCount(page)) === 21);
	const allPage = await waitForRecentOrder(page, titles.slice().reverse(), "历史区全部详情就绪");
	assert.ok(allPage[20].includes(titles[0]), "末批只包含剩余第 1 个会话（R-01-019/AC-03）");
	await scrollPaneToBottom(page);
	await page.waitForTimeout(300);
	assert.equal(await recentCardCount(page), 21, "没有更多会话后继续滚动不再追加（R-01-019/AC-03）");

	const visibleTitles = allPage.map((text) => titles.find((title) => text.includes(title)));
	assert.equal(new Set(visibleTitles).size, visibleTitles.length, "历史区所有已呈现卡片标题唯一（R-01-019/AC-02）");

	// R-01-019/AC-04：分页后的回到顶部仍作用于同一窗格滚动容器。
	const topButton = page.getByRole("button", { name: "回到顶部", exact: true });
	await until("分页后回到顶部按钮显示", async () => (await topButton.isVisible().catch(() => false)) ? true : null);
	await topButton.click();
	await until("分页后回到顶部生效", async () => (await page.locator("[data-dsh-activity-pane] .dap-scroll").evaluate((scroll) => scroll.scrollTop === 0)) ? true : null);

	// R-01-019/AC-02：没有 IntersectionObserver 时，滚动事件兜底仍能追加下一批。
	await page.evaluate(() => {
		window.IntersectionObserver = undefined;
		document.querySelector("[data-dsh-activity-pane]")?.remove();
	});
	await until("缺少 IntersectionObserver 时窗格重建", async () => (await recentCardCount(page)) === 10 ? true : null);
	await scrollPaneToBottom(page);
	await until("滚动兜底追加历史第二批", async () => (await recentCardCount(page)) === 20);

	// R-01-019/AC-04：移动端抽屉仍使用同一分页与独立滚动容器。
	await page.setViewportSize({ width: 375, height: 700 });
	await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.remove());
	await until("移动端窗格重建并恢复首批", async () => (await recentCardCount(page)) === 10);
	const mobileToggle = page.getByRole("button", { name: "切换活动会话窗格", exact: true });
	await mobileToggle.click();
	await until("移动端抽屉打开", async () => (await page.locator('[data-dsh-activity-pane][data-open="true"]').count()) === 1 ? true : null);
	const mobileMainScrollBefore = await stableMainScrollTop(page, "移动端主会话滚动位置稳定");
	assert.equal(mobileMainScrollBefore.present, true, "移动端存在独立的主会话滚动容器（R-01-019/AC-04）");
	await scrollPaneToBottom(page);
	await until("移动端滚动兜底追加历史第二批", async () => (await recentCardCount(page)) === 20);
	const mobileMainScrollAfter = await stableMainScrollTop(page, "移动端分页后主会话滚动位置稳定");
	assert.equal(mobileMainScrollAfter.top, mobileMainScrollBefore.top, "移动端历史区滚动不改变主会话滚动位置（R-01-019/AC-04）");

	assert.ok(mock.scenarioLog.filter((scenario) => scenario === "fast").length >= 21, "分页场景的会话均命中 fast mock 剧本");
}
