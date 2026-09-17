// R-01-002/AC-05、R-01-002/AC-10、R-01-002/AC-11、R-01-002/AC-12、R-01-002/AC-14
// 完成确认跨客户端同步与恢复：同一服务的两个独立 browser context 同时观察提醒，
// 一端确认后另一端自动解除；刷新/重新连接后保持已确认状态。

import { activateCard, clickCardButton, ensureFullDensity, mainAreaHas, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:fast 跨客户端确认探针";
// R-01-002/AC-14：状态年龄沿用历史卡相对时间的分级文案。
const AGE_PATTERN = /^(?:刚刚|\d+分钟前|\d+小时前|\d+天前|\d+周前|\d+个月前|\d+年前)$/;

export default async function completionSync({ browser, page, url, assert }) {
	const secondContext = await browser.newContext();
	const secondPage = await secondContext.newPage();
	try {
		// 先让服务端完成首个 sessions 连接世代，再接入第二客户端，避免把已知宿主
		// 冷启动竞态放大为两个并发首连；两页之后仍是独立 context 与独立 EventSource。
		await openApp(page, url);
		await ensureFullDensity(page);
		await openApp(secondPage, url);
		await ensureFullDensity(secondPage);
		await sendHeroMessage(page, TITLE);

		// 两个客户端都经宿主 SSE 收到同一未确认完成提醒。
		for (const [label, target] of [["A", page], ["B", secondPage]]) {
			await until(`客户端 ${label} 显示完成提醒`, async () => {
				const regions = await paneRegions(target);
				return regions?.active.includes(TITLE) && regions.active.includes("已完成") ? regions : null;
			}, 20_000);
		}

		// R-01-002/AC-14：完成提醒卡类型胶囊右侧显示进入完成状态的相对时间。
		const doneAge = await until("完成提醒卡显示进入状态相对时间", () =>
			page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"] .dap-await-age')
				.first().textContent().then((text) => (text ?? "").trim() || null),
		);
		assert.match(doneAge, AGE_PATTERN, "完成提醒胶囊右侧显示相对时间分级文案（R-01-002/AC-14）");

		// R-01-002/AC-05：B 打开提醒卡后提醒仍保持，不能以浏览动作隐式解除。
		await activateCard(secondPage, TITLE);
		await until("客户端 B 打开完成会话", () => mainAreaHas(secondPage, TITLE));
		const openedRegions = await paneRegions(secondPage);
		assert.ok(openedRegions.active.includes(TITLE) && openedRegions.active.includes("已完成"), "打开会话不解除完成提醒");

		// R-01-002/AC-12：未确认提醒在刷新建立新连接后由宿主持久状态恢复。
		await openApp(secondPage, url);
		await ensureFullDensity(secondPage);
		await until("未确认提醒刷新后恢复", async () => {
			const regions = await paneRegions(secondPage);
			return regions?.active.includes(TITLE) && regions.active.includes("已完成") ? regions : null;
		}, 20_000);

		// R-01-002/AC-10、AC-11：A 只点击一次确认；B 不经刷新自动解除并迁入历史。
		await clickCardButton(page, TITLE, "移入历史");
		await until("客户端 B 同步解除完成提醒", async () => {
			const regions = await paneRegions(secondPage);
			if (!regions || regions.active.includes(TITLE)) return null;
			return regions.recent.includes(TITLE) ? regions : null;
		}, 20_000);
		const aRegions = await until("客户端 A 解除完成提醒", async () => {
			const regions = await paneRegions(page);
			return regions && !regions.active.includes(TITLE) && regions.recent.includes(TITLE) ? regions : null;
		}, 20_000);
		assert.ok(aRegions.recent.includes(TITLE), "确认端同样迁入最近历史区");

		// R-01-002/AC-12：刷新建立新连接后从宿主持久状态恢复，不重新出现完成提醒。
		await openApp(secondPage, url);
		await ensureFullDensity(secondPage);
		await until("刷新后保持已确认状态", async () => {
			const regions = await paneRegions(secondPage);
			if (!regions || regions.active.includes(TITLE)) return null;
			return regions.recent.includes(TITLE) && !regions.active.includes("已完成") ? regions : null;
		}, 20_000);
	} finally {
		await secondContext.close();
	}
}
