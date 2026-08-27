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
	});
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

	// 移入历史，观察最近卡五层结构（等迁移动画收尾、确认按钮撤离后再取样）。
	await clickCardButton(page, TITLE, "移入历史");
	// 等标题生成落定（mock 标题取 fast 回复定值）与迁移动画收尾后按行索引取样。
	const lines = await until("最近卡五层就绪", async () => {
		const regions = await paneRegions(page);
		if (!regions || !regions.recent.includes(TITLE) || regions.recent.includes("移入历史")) return null;
		const sampled = regions.recent.split("\n").filter((line) => line.trim() !== "");
		return sampled[3] === MOCK_FAST_REPLY ? sampled : null;
	}, 20_000);

	// 行序固定：0=区段标题、1=工作区徽标、2=模型/reasoning、3=会话标题、4=「用户」标签、
	// 5=最近用户消息首行、6=「助手」标签、7=最近回复首行、8=最后活动时间。
	// R-01-013/AC-01：第一层为工作区名称与模型/reasoning。
	assert.ok(lines[1].includes("e2e") && lines[2].includes(MOCK_MODEL) && lines[2].includes("High"), `第一层为工作区+模型/reasoning（实际：${lines[1]} / ${lines[2]}）`);
	// R-01-013/AC-02：第二层为会话标题。
	assert.equal(lines[3], MOCK_FAST_REPLY, "第二层为会话标题（AC-02）");
	// R-01-013/AC-03、AC-07：第三层为最近用户消息首行，前置「用户」标签。
	assert.ok(lines[4] === "用户" && lines[5].includes("卡面内容探针"), "第三层为「用户」标签 + 最近用户消息首行（AC-03、AC-07）");
	// R-01-013/AC-04、AC-08：第四层为最近 agent reply 首行，前置「助手」标签。
	assert.ok(lines[6] === "助手" && lines[7].includes(MOCK_FAST_REPLY), "第四层为「助手」标签 + 最近回复首行（AC-04、AC-08）");
	// R-01-013/AC-05：第五层为最后活动时间（沿用宿主时间格式）。
	assert.ok(lines[8].includes("最近") || /\d{1,2}:\d{2}/.test(lines[8]), `第五层为活动时间（实际末行：${lines[8]}）`);
}
