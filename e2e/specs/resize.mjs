// R-01-015/AC-01、R-01-015/AC-02、R-01-015/AC-03、R-01-015/AC-04
// 桌面拖拽调宽：拖拽右缘实时调宽且主会话让位、宽度夹取 [200,480]、
// 折叠窄条不可拖拽、刷新后恢复上次宽度。

import { newSessionWithMessage, openApp, paneBox, sendHeroMessage, until } from "../helpers.mjs";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

/** 从窗格右缘拖到目标 x（分步移动模拟真实拖拽）。 */
async function dragPaneEdge(page, targetX) {
	const box = await paneBox(page);
	const y = box.y + box.height / 2;
	const startX = box.x + box.width - 2;
	await page.mouse.move(startX, y);
	await page.mouse.down();
	const steps = 12;
	for (let i = 1; i <= steps; i += 1) {
		await page.mouse.move(startX + ((targetX - startX) * i) / steps, y);
		await page.waitForTimeout(30);
	}
	await page.mouse.up();
}

async function paneWidth(page) {
	return (await paneBox(page)).width;
}

export default async function resize({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, "e2e:fast 调宽探针");
	const initialBox = await until("窗格出现", () => paneBox(page));
	const initialWidth = initialBox.width;
	// R-01-015/AC-04（默认宽度）：全新环境（无站点数据）下窗格为默认 280px。
	assert.ok(Math.abs(initialWidth - 280) <= 4, `默认宽度 280px（实际 ${initialWidth}）`);

	// R-01-015/AC-01：拖拽右缘实时调宽，主会话内容同步让位。
	const composerX = async () => (await page.locator('textarea[placeholder="Message the agent"]').boundingBox()).x;
	const mainBefore = await composerX();
	// 「实时」：拖拽进行中（未松手）宽度已随指针变化。
	const startX = initialBox.x + initialBox.width - 2;
	const dragY = initialBox.y + initialBox.height / 2;
	await page.mouse.move(startX, dragY);
	await page.mouse.down();
	await page.mouse.move(startX + 60, dragY, { steps: 6 });
	const midWidth = await paneWidth(page);
	assert.ok(midWidth > initialWidth + 20, `拖拽进行中宽度实时变化（${initialWidth} → 中途 ${midWidth}）`);
	await page.mouse.move(initialBox.x + initialBox.width + 120, dragY, { steps: 6 });
	await page.mouse.up();
	const widened = await paneWidth(page);
	assert.ok(widened > initialWidth + 40, `拖拽后窗格变宽（${initialWidth} → ${widened}）`);
	assert.ok((await composerX()) > mainBefore, "主会话内容同步让位（composer 右移）");

	// R-01-015/AC-02：宽度夹取——大幅度越过两端仍落在 [200, 480]。
	await dragPaneEdge(page, 10);
	const narrow = await paneWidth(page);
	assert.ok(Math.abs(narrow - MIN_WIDTH) <= 4, `拖到极左夹取到 ${MIN_WIDTH}（实际 ${narrow}）`);
	await dragPaneEdge(page, 1200);
	const wide = await paneWidth(page);
	assert.ok(Math.abs(wide - MAX_WIDTH) <= 4, `拖到极右夹取到 ${MAX_WIDTH}（实际 ${wide}）`);

	// R-01-015/AC-03（桌面折叠窄条）：折叠后右缘拖拽不再调宽。
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	const stripBox = await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		return b && b.width < 60 && b.height > 60 ? b : null;
	});
	await dragPaneEdge(page, stripBox.x + 400);
	const afterDrag = await paneBox(page);
	assert.ok(afterDrag.width <= stripBox.width + 4, `窄条不可拖拽调宽（${stripBox.width} → ${afterDrag.width}）`);
	// 还原展开供后续断言。
	await page.getByRole("button", { name: /活动会话/ }).last().click();
	await until("展开恢复", async () => ((await paneWidth(page)) >= MIN_WIDTH ? true : null));

	// R-01-015/AC-04：刷新后恢复上次调整的宽度（当前为夹取后的 480）。
	await page.reload({ waitUntil: "networkidle" });
	const restored = await until("刷新后窗格恢复", async () => {
		const b = await paneBox(page);
		return b && Math.abs(b.width - MAX_WIDTH) <= 4 ? b : null;
	});
	assert.ok(Math.abs(restored.width - MAX_WIDTH) <= 4, `刷新后恢复上次宽度 ${MAX_WIDTH}（实际 ${restored.width}）`);
}
