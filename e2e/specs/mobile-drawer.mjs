// R-01-008/AC-01
// 移动端默认隐藏：视口 ≤767px 时窗格默认隐藏在屏外不占主会话宽度，仅出现浮动开关。

import { dismissNotice, paneBox, sendHeroMessage, until } from "../helpers.mjs";

// 移动断点为 767px（PRD R-01-008），取 375px 代表手机视口。
const MOBILE_VIEWPORT = { width: 375, height: 700 };

export default async function mobileDrawer({ page, url, assert }) {
	await page.setViewportSize(MOBILE_VIEWPORT);
	await page.goto(url, { waitUntil: "networkidle" });
	await dismissNotice(page);

	// 浮动开关位于会话头部，先进入一个会话。
	await sendHeroMessage(page, "e2e:fast 移动探针");

	// 窗格默认隐藏：窗格根完全处于屏外（左缘之外），不占用主会话宽度。
	const box = await until("窗格挂载", () => paneBox(page));
	assert.ok(box.x + box.width <= 1, `窗格默认隐藏在屏外（右缘 ${Math.round(box.x + box.width)} ≤ 1）`);

	// 浮动开关出现（会话头部左上角、文案「活动」带计数徽标）。
	const toggle = await until("浮动开关出现", async () => {
		const candidate = page.getByRole("button", { name: "切换活动会话窗格" });
		const b = await candidate.boundingBox().catch(() => null);
		return b ? candidate : null;
	});
	const toggleBox = await toggle.boundingBox();
	const text = (await toggle.innerText()).trim();
	assert.ok(text.startsWith("活动"), `浮动开关文案以「活动」开头，实际：${text}`);
	assert.ok(toggleBox.x >= 0 && toggleBox.x + toggleBox.width <= MOBILE_VIEWPORT.width, "浮动开关在移动视口内");
}
