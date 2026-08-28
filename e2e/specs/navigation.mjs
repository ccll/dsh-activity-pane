// R-01-005/AC-01、R-01-006/AC-01
// 点击与键盘跳转：Enter 激活活动卡、Space 激活最近卡并切换会话；切换后高亮当前卡。

import { clickCardButton, mainAreaHas, newSessionWithMessage, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE_A = "e2e:fast 跳转探针甲";
const TITLE_B = "e2e:fast 跳转探针乙";

/** 卡片（含指定标题文字的）向上找到带可见描边的卡面元素，取其边框与阴影计算样式。 */
async function cardVisual(page, title) {
	return page.evaluate((title) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const leaf = [...pane.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.trim() === title);
		if (!leaf) return null;
		let el = leaf;
		while (el && el !== pane) {
			const cs = getComputedStyle(el);
			if (parseFloat(cs.borderTopWidth) > 0) return { border: cs.borderTopColor, shadow: cs.boxShadow };
			el = el.parentElement;
		}
		return null;
	}, title);
}

export default async function navigation({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, TITLE_A);
	await newSessionWithMessage(page, TITLE_B);
	// 两张完成提醒卡都在活动区。
	await until("两张卡片就位", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE_A) && regions.active.includes(TITLE_B) ? regions : null;
	});

	// R-01-005/AC-01（活动卡）：当前在会话乙，Enter 激活会话甲卡片，主会话切换到甲。
	assert.ok(await mainAreaHas(page, TITLE_B), "前置：当前为会话乙");
	const activeCardA = page.locator('[data-dsh-activity-pane] [role="button"]').filter({ hasText: TITLE_A }).first();
	await activeCardA.focus();
	assert.equal(await activeCardA.evaluate((el) => document.activeElement === el), true, "活动卡可经键盘聚焦");
	await activeCardA.press("Enter");
	await until("Enter 激活活动卡切换到甲", () => mainAreaHas(page, TITLE_A));

	// R-01-006/AC-01：切换后窗格高亮对应卡片——当前卡与非当前卡的描边/光晕呈现不同。
	const currentStyle = await until("甲卡片呈现高亮", async () => {
		const a = await cardVisual(page, TITLE_A);
		const b = await cardVisual(page, TITLE_B);
		return a && b && (a.border !== b.border || a.shadow !== b.shadow) ? a : null;
	});
	const otherStyle = await cardVisual(page, TITLE_B);
	assert.notDeepEqual(currentStyle, otherStyle, "当前会话卡片高亮区别于非当前卡");

	// R-01-005/AC-01（最近卡）：把乙确认移入历史，再以 Space 激活最近卡切回乙。
	await clickCardButton(page, TITLE_B, "移入历史");
	await until("乙进入最近历史区", async () => {
		const regions = await paneRegions(page);
		return regions && regions.recent.includes(TITLE_B) && !regions.active.includes(TITLE_B) ? regions : null;
	});
	const recentCardB = page.locator('[data-dsh-activity-pane] [role="button"]').filter({ hasText: TITLE_B }).first();
	await recentCardB.focus();
	assert.equal(await recentCardB.evaluate((el) => document.activeElement === el), true, "最近卡可经键盘聚焦");
	await recentCardB.press("Space");
	await until("Space 激活最近卡切回乙", () => mainAreaHas(page, TITLE_B));
}
