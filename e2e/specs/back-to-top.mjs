// R-01-018/AC-01、R-01-018/AC-02、R-01-018/AC-03、R-01-018/AC-04、R-01-018/AC-05
// 回到顶部：滚动超阈值出现悬浮按钮、激活回顶（减弱动态时直接定位）、回顶后隐藏、
// 移动抽屉同样提供而折叠窄条不显示、纯图标无文字且有不透明底色与可访问名称。

import { cardVisibleInPane, newSessionWithMessage, openApp, paneBox, sendHeroMessage, until, wheelOver } from "../helpers.mjs";

const SESSION_COUNT = 6;
const TOP_TITLE = () => title(SESSION_COUNT - 1); // 最新卡位于窗格顶部
const title = (n) => `e2e:fast 回顶探针${String(n).padStart(2, "0")}`;

/** 「回到顶部」按钮的可见性与可访问信息（单次 DOM 观测，不经 locator 自动等待）。 */
async function topButtonState(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return { visible: false };
		const button = [...pane.querySelectorAll("button")].find((el) => el.getAttribute("aria-label") === "回到顶部");
		if (!button) return { visible: false };
		const rect = button.getBoundingClientRect();
		if (button.hidden || rect.width === 0 || rect.height === 0) return { visible: false };
		const cs = getComputedStyle(button);
		return { visible: true, text: button.textContent.trim(), bg: cs.backgroundColor, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
	});
}

/** 等回顶生效：按钮隐藏且顶部卡片重新可见（单次 DOM 观测）。 */
async function untilBackToTop(page, topTitle, label) {
	await until(label, () =>
		page.evaluate((expected) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (!pane) return null;
			const button = [...pane.querySelectorAll("button")].find((el) => el.getAttribute("aria-label") === "回到顶部");
			if (!button || !button.hidden) return null; // 按钮仍显示
			const paneRect = pane.getBoundingClientRect();
			const leaf = [...pane.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.includes(expected));
			if (!leaf) return null;
			const rect = leaf.getBoundingClientRect();
			return rect.height > 0 && rect.top >= paneRect.top - 1 && rect.bottom <= paneRect.bottom + 1 ? true : null;
		}, topTitle), 30_000);
}

export default async function backToTop({ page, url, assert }) {
	// 压低视口并制造 6 张卡片，让窗格一屏以上可滚。
	await page.setViewportSize({ width: 1100, height: 500 });
	await openApp(page, url);
	await sendHeroMessage(page, title(0));
	for (let n = 1; n < SESSION_COUNT; n += 1) {
		await newSessionWithMessage(page, title(n));
	}
	await until("6 张卡片就位", async () => {
		const count = await page.locator("[data-dsh-activity-pane]").getByText("回顶探针", { exact: false }).count();
		return count >= SESSION_COUNT ? true : null;
	}, 30_000);

	// R-01-018/AC-01：未滚动时不显示按钮；滚过阈值后右下角出现。
	assert.equal((await topButtonState(page)).visible, false, "顶部时不显示回到顶部按钮");
	const box = await paneBox(page);
	await wheelOver(page, box, 400, 12);
	await until("滚动后按钮出现", async () => ((await topButtonState(page)).visible ? true : null));
	const state = await topButtonState(page);
	// R-01-018/AC-05：纯图标（无文字）、不透明底色、可访问名称（aria-label 命中）。
	assert.equal(state.text, "", "按钮无文字（纯图标）");
	assert.ok(!state.bg.includes("rgba") || !state.bg.endsWith(", 0)"), `底色不透明（${state.bg}）`);
	// R-01-018/AC-01（右下角）：按钮贴合窗格右缘与底缘。
	assert.ok(state.right >= box.x + box.width - 40 && state.bottom >= box.y + box.height - 40, `按钮位于窗格右下角（right=${Math.round(state.right)} bottom=${Math.round(state.bottom)}，pane right=${Math.round(box.x + box.width)} bottom=${Math.round(box.y + box.height)}）`);

	// R-01-018/AC-02、AC-03：点击回顶——顶部卡片重新可见、按钮隐藏。
	assert.equal(await cardVisibleInPane(page, TOP_TITLE()), false, "前置：滚走后顶部卡片不可见");
	await page.getByRole("button", { name: "回到顶部" }).click();
	const topTitle = TOP_TITLE();
	await untilBackToTop(page, topTitle, "回顶完成且按钮隐藏");

	// R-01-018/AC-02（减弱动态）：直接定位不做平滑滚动——点击后极短窗口内首卡即回视野。
	await page.emulateMedia({ reducedMotion: "reduce" });
	await wheelOver(page, box, 400, 12);
	await until("减弱动态下按钮出现", async () => ((await topButtonState(page)).visible ? true : null));
	await page.getByRole("button", { name: "回到顶部" }).click();
	// 直接定位的强证据：click 返回（事件已同步派发）后不做任何等待，首卡须已在视野。
	assert.equal(await cardVisibleInPane(page, TOP_TITLE()), true, "减弱动态时直接定位回顶（无平滑过程）");
	await page.emulateMedia({ reducedMotion: null });

	// R-01-018/AC-04（窄条）：折叠后即使此前有滚动也不显示按钮。
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		return b && b.width < 60 && b.height > 60 ? true : null;
	});
	assert.equal((await topButtonState(page)).visible, false, "折叠窄条不显示回到顶部按钮");
	await page.getByRole("button", { name: /活动会话/ }).last().click();
	await until("展开恢复", async () => ((await paneBox(page)).width > 100 ? true : null));

	// R-01-018/AC-04（移动抽屉）：抽屉内滚动后同样提供按钮。
	await page.setViewportSize({ width: 375, height: 700 });
	const toggle = await until("浮动开关出现", async () => {
		const candidate = page.getByRole("button", { name: "切换活动会话窗格" });
		const b = await candidate.boundingBox().catch(() => null);
		return b ? candidate : null;
	});
	await toggle.click();
	const drawerBox = await until("抽屉展开", async () => {
		const b = await paneBox(page);
		return b && b.x >= 0 ? b : null;
	});
	await wheelOver(page, drawerBox, 400, 12);
	await until("抽屉内滚动后按钮出现", async () => ((await topButtonState(page)).visible ? true : null));
	// R-01-018/AC-04（抽屉内可用）：抽屉中点击同样回顶并隐藏。
	await page.getByRole("button", { name: "回到顶部" }).click();
	await untilBackToTop(page, topTitle, "抽屉内回顶完成且按钮隐藏");
}
