// R-01-007/AC-01、R-01-007/AC-02、R-01-011/AC-05
// 桌面贴边布局：窗格位于主会话左侧贴边、不遮挡主会话；折叠/展开控件保持同位。

import { dismissNotice, paneBox, sendHeroMessage, until } from "../helpers.mjs";

// 窄条特征：宽度远小于窗格、高度容纳竖排标题与计数；位置容差取 2px 抗亚像素抖动。
const STRIP_MAX_WIDTH_PX = 60;
const STRIP_MIN_HEIGHT_PX = 60;
const POSITION_TOLERANCE_PX = 2;

export default async function desktopLayout({ page, url, assert }) {
	await page.goto(url, { waitUntil: "networkidle" });
	await dismissNotice(page);
	await sendHeroMessage(page, "e2e:fast 桌面布局探针");

	// R-01-007/AC-01：桌面宽度（1280 > 767）下窗格为主会话左侧通高贴边列。
	const box = await until("窗格出现", () => paneBox(page));
	const composerBox = await page.locator('textarea[placeholder="Message the agent"]').boundingBox();
	assert.ok(box.x >= 0 && box.width > 0, "窗格在视口内");
	assert.ok(box.y <= 1, "窗格通高贴边（顶缘与外壳侧栏对齐）");
	assert.ok(box.x + box.width <= composerBox.x + 1, `窗格在主会话左侧（窗格右缘 ${box.x + box.width} ≤ 主会话左缘 ${composerBox.x}）`);

	// R-01-007/AC-02：窗格不阻止主会话操作——composer 可聚焦、可输入。
	const composer = page.locator('textarea[placeholder="Message the agent"]');
	await composer.click();
	await composer.pressSequentially("主会话可正常输入");
	assert.equal(await composer.inputValue(), "主会话可正常输入", "主会话 composer 可正常输入");

	// R-01-011/AC-05：收起/展开控件保持在窗格顶部同一屏幕位置。
	const header = page.getByRole("button", { name: "收起活动会话窗格" });
	const headerBox = await header.boundingBox();
	assert.ok(headerBox, "展开态标题行控件存在");
	await header.click();
	// 折叠为窄条：窄条整体是展开控件，其顶端与原标题行同位。
	const strip = await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		// 窄条特征：窄（远小于窗格宽）且高（竖排标题）
		return b && b.width < STRIP_MAX_WIDTH_PX && b.height > STRIP_MIN_HEIGHT_PX ? candidate : null;
	});
	const stripBox = await strip.boundingBox();
	assert.ok(
		Math.abs(stripBox.x - headerBox.x) <= POSITION_TOLERANCE_PX && Math.abs(stripBox.y - headerBox.y) <= POSITION_TOLERANCE_PX,
		`窄条顶端与标题行同位（${stripBox.x},${stripBox.y} vs ${headerBox.x},${headerBox.y}）`,
	);
	await strip.click();
	await until("展开恢复", async () => {
		const b = await page.getByRole("button", { name: "收起活动会话窗格" }).boundingBox().catch(() => null);
		return b && Math.abs(b.x - headerBox.x) <= POSITION_TOLERANCE_PX && Math.abs(b.y - headerBox.y) <= POSITION_TOLERANCE_PX ? true : null;
	});
}
