// R-01-003/AC-03、R-01-012/AC-01、R-01-012/AC-05、R-01-012/AC-09、
// R-01-013/AC-01、R-01-013/AC-02、R-01-013/AC-03、R-01-013/AC-04、R-01-013/AC-05、R-01-013/AC-07、R-01-013/AC-08
// 卡面内容：活动卡显示工作区归属、模型名称与 reasoning level、用户/助手角色标签；
// 最近卡按五层信息结构呈现（工作区+模型 / 标题 / 用户预览 / 助手预览 / 活动时间）。

import { clickCardButton, MOCK_FAST_REPLY, MOCK_MODEL, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:fast 卡面内容探针";

export default async function cardContent({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, TITLE);

	// R-01-003/AC-03、R-01-012/AC-01、AC-05、AC-09：活动卡承载归属、模型上下文与角色标签。
	// 等回复流出现（「助手」行在场）再取样，避免在回合刚开始时读到半成品时间线。
	const active = await until("活动卡呈现", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE) && regions.active.includes("助手") ? regions.active : null;
	}, 20_000);
	assert.ok(active.includes("e2e"), "卡片显示工作区名称（R-01-003/AC-03）");
	assert.ok(active.includes(MOCK_MODEL) && active.includes("High"), "卡片显示模型名称与 reasoning level（R-01-012/AC-01）");
	assert.ok(active.includes("用户"), "时间线用户行带「用户」标签（R-01-012/AC-05）");
	assert.ok(active.includes("助手"), "时间线助手行带「助手」标签（R-01-012/AC-09）");
	// R-01-012/AC-01（右上角）：模型上下文与工作区徽标同行且在其右侧。
	const headerPos = await page.evaluate((model) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const leaves = [...pane.querySelectorAll("*")].filter((el) => el.children.length === 0);
		const badge = leaves.find((el) => el.textContent.trim() === "e2e");
		const modelEl = leaves.find((el) => el.textContent.trim().includes(model));
		if (!badge || !modelEl) return null;
		const b = badge.getBoundingClientRect();
		const m = modelEl.getBoundingClientRect();
		return { dx: m.x - b.x, dy: Math.abs(m.y - b.y) };
	}, MOCK_MODEL);
	assert.ok(headerPos && headerPos.dx > 0 && headerPos.dy < 24, "模型上下文在工作区徽标右侧同一行（卡面右上角，R-01-012/AC-01）");

	// 移入历史（重渲染可能吞掉首次点击，点到反映为准），随后观察最近卡五层结构。
	await until("确认移入历史", async () => {
		const regions = await paneRegions(page);
		if (regions?.recent.includes(TITLE)) return true;
		await clickCardButton(page, TITLE, "移入历史").catch(() => {});
		return null;
	}, 20_000);
	// 以 DOM 叶子顺序核验五层（innerText 折行随渲染宽度变化，不能按行索引断言）：
	// 徽标 → 模型/reasoning → 会话标题 → 「用户」标签 → 用户消息首行 → 「助手」标签 → 回复首行 → 时间。
	const matched = await until("最近卡五层就绪", async () => {
		const result = await page.evaluate(({ title, model, reply }) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (!pane) return null;
			if (pane.innerText.includes("移入历史")) return null; // 迁移动画未收尾
			const marker = [...pane.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.includes("最近历史"));
			if (!marker) return null;
			const markerY = marker.getBoundingClientRect().top;
			const leaves = [...pane.querySelectorAll("*")]
				.filter((el) => el.children.length === 0 && el.getBoundingClientRect().top > markerY)
				.map((el) => el.textContent.trim())
				.filter((text) => text !== "" && text !== "·");
			const expected = [
				(text) => text.includes("e2e"),
				(text) => text.includes(model) && text.includes("High"),
				(text) => text === title,
				(text) => text === "用户",
				(text) => text.includes("卡面内容探针"),
				(text) => text === "助手",
				(text) => text.includes(reply),
				(text) => text.includes("最近") || /\d{1,2}:\d{2}/.test(text),
			];
			let cursor = 0;
			for (const text of leaves) {
				if (cursor < expected.length && expected[cursor](text)) cursor += 1;
			}
			return cursor === expected.length ? leaves : null;
		}, { title: MOCK_FAST_REPLY, model: MOCK_MODEL, reply: MOCK_FAST_REPLY });
		return result;
	}, 20_000);
	// R-01-013/AC-01..05、AC-07、AC-08：五层结构按序命中即证（工作区+模型 / 标题 / 用户标签+首行 / 助手标签+首行 / 时间）。
	assert.ok(matched.length >= 8, `最近卡五层结构按序呈现（命中叶子 ${matched.length} 个）`);

}
