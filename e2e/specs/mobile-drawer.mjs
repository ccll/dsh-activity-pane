// R-01-008/AC-01、AC-02（点击/键盘）、AC-03（鼠标）、AC-04（文案/相对位置）、AC-05、AC-06（点击/键盘）；R-01-015/AC-03
// 移动端抽屉：默认隐藏、开关展开、标题/外部点击收起、开关随状态显隐，
// 键盘激活当前卡只收起抽屉、激活其它卡仍切换会话；真触摸和精确视觉位置保留人工。

import { activateCard, mainAreaHas, newSessionWithMessage, openApp, paneBox, sendHeroMessage, until } from "../helpers.mjs";

const MOBILE_VIEWPORT = { width: 375, height: 700 };
const TITLE_A = "e2e:fast 移动抽屉探针甲";
const TITLE_B = "e2e:fast 移动抽屉探针乙";

async function toggleButton(page) {
	return page.getByRole("button", { name: "切换活动会话窗格" });
}

async function openDrawer(page) {
	const toggle = await until("浮动开关出现", async () => {
		const candidate = await toggleButton(page);
		return (await candidate.boundingBox().catch(() => null)) ? candidate : null;
	});
	await toggle.click();
	return until("抽屉展开", async () => {
		const box = await paneBox(page);
		return box && box.x >= -1 ? box : null;
	});
}

async function waitDrawerClosed(page, label) {
	await until(label, async () => {
		const box = await paneBox(page);
		return box && box.x + box.width <= 1 ? true : null;
	});
}

export default async function mobileDrawer({ page, url, assert }) {
	await page.setViewportSize(MOBILE_VIEWPORT);
	await openApp(page, url);
	await sendHeroMessage(page, TITLE_A);
	await newSessionWithMessage(page, TITLE_B);
	await until("当前为会话乙", () => mainAreaHas(page, TITLE_B));

	// R-01-008/AC-01：默认隐藏在屏外，不占主会话宽度。
	const hiddenBox = await until("窗格挂载", () => paneBox(page));
	assert.ok(hiddenBox.x + hiddenBox.width <= 1, `窗格默认隐藏在屏外（右缘 ${Math.round(hiddenBox.x + hiddenBox.width)} ≤ 1）`);
	assert.equal(await page.locator("[data-dsh-activity-pane] .dap-resize").isVisible(), false, "移动端抽屉不提供拖拽调宽手柄（R-01-015/AC-03）");

	// R-01-008/AC-04：浮动开关文案与位置。
	const toggle = await toggleButton(page);
	const toggleBox = await until("浮动开关可见", () => toggle.boundingBox());
	const text = (await toggle.innerText()).trim();
	assert.ok(text.startsWith("活动"), `浮动开关文案以「活动」开头，实际：${text}`);
	assert.ok(toggleBox.x >= 0 && toggleBox.x + toggleBox.width <= MOBILE_VIEWPORT.width, "浮动开关在移动视口内");

	// R-01-008/AC-02、AC-05：开关展开，打开期间开关隐藏；Space 激活标题行收起后恢复。
	await openDrawer(page);
	assert.equal(await toggle.isVisible().catch(() => false), false, "抽屉打开时浮动开关隐藏");
	const drawerHeader = page.getByRole("button", { name: "收起活动会话窗格" });
	await drawerHeader.focus();
	await drawerHeader.press("Space");
	await waitDrawerClosed(page, "Space 激活标题行收起抽屉");
	assert.equal(await toggle.isVisible(), true, "抽屉关闭后浮动开关恢复");

	// R-01-008/AC-03：点击抽屉外部透明遮罩收起，不作用于抽屉内容。
	const drawerBox = await openDrawer(page);
	await page.mouse.click(Math.min(MOBILE_VIEWPORT.width - 2, drawerBox.x + drawerBox.width + 40), MOBILE_VIEWPORT.height / 2);
	await waitDrawerClosed(page, "点击抽屉外部收起");

	// R-01-008/AC-06：当前为乙；Enter 激活当前卡只收起，不切换。
	await openDrawer(page);
	const currentCard = page.locator('[data-dsh-activity-pane] [role="button"]').filter({ hasText: TITLE_B }).first();
	await currentCard.focus();
	await currentCard.press("Enter");
	await waitDrawerClosed(page, "Enter 激活当前卡收起抽屉");
	assert.equal(await mainAreaHas(page, TITLE_B), true, "键盘激活当前卡后仍停留在当前会话");

	// 激活非当前卡仍走原生会话切换路径。
	await openDrawer(page);
	await activateCard(page, TITLE_A);
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await waitDrawerClosed(page, "切换后收起抽屉以观察主会话");
	await until("激活非当前卡切换到甲", () => mainAreaHas(page, TITLE_A));
}
