// R-01-008/AC-01、AC-02（点击/键盘）、AC-03（鼠标）、AC-04（徽标单挂/嵌入标题行行首/不遮挡几何/兜底落位）、AC-05（显隐/嵌入态留位）、AC-06（点击/键盘）；R-01-015/AC-03
// 移动端抽屉：默认隐藏、开关展开、标题/外部点击收起、开关随状态显隐，
// 键盘激活当前卡只收起抽屉、激活其它卡仍切换会话；真触摸、行首观感与真机残留保留人工。

import {activateCard, ensureFullDensity, mainAreaHas, newSessionWithMessage, openApp, paneBox, sendHeroMessage, until} from "../helpers.mjs";

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
	await ensureFullDensity(page);
	await sendHeroMessage(page, TITLE_A);
	await newSessionWithMessage(page, TITLE_B);
	await until("当前为会话乙", () => mainAreaHas(page, TITLE_B));

	// R-01-008/AC-01：默认隐藏在屏外，不占主会话宽度。
	const hiddenBox = await until("窗格挂载", () => paneBox(page));
	assert.ok(hiddenBox.x + hiddenBox.width <= 1, `窗格默认隐藏在屏外（右缘 ${Math.round(hiddenBox.x + hiddenBox.width)} ≤ 1）`);
	assert.equal(await page.locator("[data-dsh-activity-pane] .dap-resize").isVisible(), false, "移动端抽屉不提供拖拽调宽手柄（R-01-015/AC-03）");

	// R-01-008/AC-04：浮动开关徽标单挂（无图标与文字标签）、嵌入头部标题行行首
	// 参与布局（视觉上位于左边栏切换按钮右侧）、不遮挡宿主控件（T-163）。
	const toggle = await toggleButton(page);
	const toggleBox = await until("浮动开关可见", () => toggle.boundingBox());
	const text = (await toggle.innerText()).trim();
	assert.ok(/^\d+\/\d+$/.test(text), `浮动开关为紧凑形（仅计数徽标，无图标与文字标签），实际：${text}`);
	assert.ok(toggleBox.x >= 0 && toggleBox.x + toggleBox.width <= MOBILE_VIEWPORT.width, "浮动开关在移动视口内");
	const embedded = await page.evaluate(() => {
		const toggle = document.querySelector(".dap-toggle");
		const seat = document.querySelector('#root [data-slot="main"]');
		const header = seat?.querySelector("header") ?? null;
		const titleRow = header?.firstElementChild ?? null;
		if (!toggle || titleRow === null) return null;
		const box = toggle.getBoundingClientRect();
		// 嵌入守卫：开关为标题行布局子项且位于行首（位于标题簇 nav 之前）。
		const nav = titleRow.querySelector("nav") ?? null;
		const inRow = toggle.parentElement === titleRow && toggle.hasAttribute("data-embedded") &&
			toggle === titleRow.firstElementChild &&
			(nav === null || (toggle.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
		// 其余头部控件仍在行内：宿主不得以删控件方式为开关腾位。
		const others = [...titleRow.querySelectorAll("button, [role='button']")]
			.filter((el) => el !== toggle && !toggle.contains(el)).length;
		// 不遮挡回归：视口内任何其它可交互元素的矩形不得与开关相交。
		const overlapped = [...document.querySelectorAll("button, [role='button'], a, input, textarea, select")]
			.filter((el) => el !== toggle && !toggle.contains(el) && !el.contains(toggle))
			.some((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0 &&
					r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
			});
		return { inRow, others, overlapped };
	});
	assert.notEqual(embedded, null, "宿主头部标题行可寻址（嵌入锚点存在）");
	assert.equal(embedded.inRow, true, "浮动开关嵌入头部标题行行首且位于 crumb 之前（R-01-008/AC-04）");
	assert.equal(embedded.overlapped, false, "浮动开关不与视口内其它可交互元素相交（R-01-008/AC-04 不遮挡）");
	assert.ok(embedded.others > 0, "标题行内其余头部控件仍在行内（R-01-008/AC-04 后挤不删减）");

	// R-01-008/AC-02、AC-05：开关展开，打开期间开关隐藏（嵌入态留位、标题行不重排）；
	// Space 激活标题行收起后恢复。
	await openDrawer(page);
	assert.equal(await toggle.isVisible().catch(() => false), false, "抽屉打开时浮动开关隐藏");
	// boundingBox 对 visibility:hidden 返回 null，留位断言经 getBoundingClientRect 承载。
	const openBox = await page.evaluate(() => {
		const el = document.querySelector(".dap-toggle");
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
	});
	assert.ok(
		openBox !== null &&
			Math.abs(openBox.x - toggleBox.x) < 1 && Math.abs(openBox.width - toggleBox.width) < 1 &&
			Math.abs(openBox.y - toggleBox.y) < 1 && Math.abs(openBox.height - toggleBox.height) < 1,
		`嵌入态打开抽屉时开关留位（x ${toggleBox.x}→${openBox?.x}、宽 ${toggleBox.width}→${openBox?.width}、y ${toggleBox.y}→${openBox?.y}）`,
	);
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
	// R-01-005/AC-01 回归：切换会话后宿主 composer 不得自动聚焦（真机上会弹软键盘）。
	// 卡片 data-current 标记即插件观察到 current 切换完成的时点，宿主聚焦 effect 在同一
	// 提交周期内发生；补 150ms 沉降保证断言前 effect 已执行。
	await until("卡片甲标记为当前会话", () =>
		page.evaluate((text) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			return [...(pane?.querySelectorAll('[role="button"]') ?? [])]
				.some((card) => card.innerText.includes(text) && card.hasAttribute("data-current"));
		}, TITLE_A),
	);
	await page.waitForTimeout(150);
	assert.equal(
		await page.evaluate(() => document.activeElement?.matches?.("[data-composer-input]") ?? false),
		false,
		"移动端切换会话后 composer 未自动聚焦",
	);
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await waitDrawerClosed(page, "切换后收起抽屉以观察主会话");
	await until("激活非当前卡切换到甲", () => mainAreaHas(page, TITLE_A));
	// 抑制窗口（1200ms）结束后手动点按 composer 仍可正常聚焦，抑制不得误伤用户输入。
	await page.waitForTimeout(1_300);
	await page.locator("[data-composer-input]").click();
	assert.equal(
		await page.evaluate(() => document.activeElement?.matches?.("[data-composer-input]") ?? false),
		true,
		"抑制窗口结束后手动点按 composer 可正常聚焦",
	);

	// 宿主视图替换窗口期回归（真机宿主重渲染节奏与桌面不同）：窗格被宿主替换移除后，
	// 开关点击必须重新绑定并展开，而非静默无响应（R-01-008/AC-01）。
	await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.remove());
	const reboundToggle = await toggleButton(page);
	await reboundToggle.click();
	await until("窗格被移除后开关点击重新绑定并展开", async () => {
		const box = await paneBox(page);
		return box && box.x >= -1 ? box : null;
	});

	// R-01-008/AC-04 兜底分支（T-163）：宿主标题行不可得时开关回退 body fixed 兜底形态，
	// left 随侧栏切换按钮实测右缘 + 8px 写入（无侧栏按钮时清回 CSS 默认 44px）。
	// 宿主可能自发重建头部令兜底态回嵌：每轮先重摘 header（不派发 resize，避免宿主
	// 重渲染抢先回嵌），守卫经 conversationObserver 唤醒后回退，轮询捕获兜底态。
	const fallbackLeft = await until("开关回退兜底形态", async () => {
		await page.evaluate(() => {
			document.querySelector('#root [data-slot="main"] header')?.remove();
		});
		return page.evaluate(() => {
			const toggle = document.querySelector(".dap-toggle");
			if (!toggle || toggle.parentElement !== document.body || toggle.hasAttribute("data-embedded")) return null;
			const sidebar = document.querySelector("[data-slot=sidebar] button");
			const right = sidebar?.getBoundingClientRect().right ?? NaN;
			// 镜像实现的兜底守卫：右缘为 0（隐藏/未渲染）视同测不到，实现清空 inline left、
			// CSS 默认 44px 生效；经 getComputedStyle 取生效 left，两条分支同一口径。
			const expected = Number.isFinite(right) && right > 0 ? Math.round(right + 8) : 44;
			const left = Number.parseFloat(getComputedStyle(toggle).left);
			return Number.isFinite(left) && Math.abs(left - expected) <= 1 ? expected : null;
		});
	});
	assert.ok(fallbackLeft !== null, `宿主头部移除后开关回退 body fixed 兜底，left 按侧栏切换按钮右缘落位（实测 ${fallbackLeft}px）`);
	// 兜底形态仍可操作：先点抽屉外部收起（恢复开关可见），再点开关展开抽屉。
	await page.mouse.click(MOBILE_VIEWPORT.width - 10, MOBILE_VIEWPORT.height / 2);
	await waitDrawerClosed(page, "兜底态下点击抽屉外部收起");
	await reboundToggle.click();
	await until("兜底形态下开关点击仍可展开抽屉", async () => {
		const box = await paneBox(page);
		return box && box.x >= -1 ? box : null;
	});
}
