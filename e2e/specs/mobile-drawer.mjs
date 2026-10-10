// R-01-008/AC-01、AC-02（点击/键盘）、AC-03（鼠标）、AC-04（徽标单挂/嵌入标题行行首/不遮挡几何/层级归位/hero 贴靠与不渲染/锚缺失保留原位）、AC-05（显隐/统一留位隐藏）、AC-06（点击/键盘）；R-01-015/AC-03
// 移动端抽屉：默认隐藏、开关展开、标题/外部点击收起、开关随状态显隐，
// 键盘激活当前卡只收起抽屉、激活其它卡仍切换会话；真触摸、行首观感与真机残留保留人工。

import {activateCard, ensureFullDensity, injectMobileFabAnchor, mainAreaHas, newSessionWithMessage, openApp, paneBox, sendHeroMessage, setHostDrawerCollapsed, until} from "../helpers.mjs";

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
	const embeddedZ = await page.evaluate(() => {
		const el = document.querySelector(".dap-toggle");
		return el ? Number(getComputedStyle(el).zIndex) : null;
	});
	assert.equal(embeddedZ, 1, "嵌入态 z-index 归位为 1，低于宿主任何覆盖层（T-167 层级逃逸根除）");

	// R-01-008/AC-04：外层胶囊壳去除（T-168，只留内部涂色的计数胶囊）——开关本体
	// 无描边、无底色、无投影，可见形态即 .dap-toggle-count 徽标本体。
	const chrome = await page.evaluate(() => {
		const el = document.querySelector(".dap-toggle");
		if (!el) return null;
		const shell = getComputedStyle(el);
		const inner = getComputedStyle(el.querySelector(".dap-toggle-count"));
		return {
			borderWidth: shell.borderTopWidth,
			background: shell.backgroundColor,
			shadow: shell.boxShadow,
			innerBackground: inner.backgroundColor,
		};
	});
	assert.notEqual(chrome, null, "浮动开关可寻址");
	assert.equal(chrome.borderWidth, "0px", "开关无外层描边（R-01-008/AC-04 紧凑形态，T-168）");
	assert.equal(chrome.background, "rgba(0, 0, 0, 0)", "开关无外层底色（R-01-008/AC-04 紧凑形态，T-168）");
	assert.equal(chrome.shadow, "none", "开关无外层投影（R-01-008/AC-04 紧凑形态，T-168）");
	assert.notEqual(chrome.innerBackground, "rgba(0, 0, 0, 0)", "内部计数胶囊保留涂色底（T-168）");

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

	// R-01-008/AC-04 hero 落位（T-167，C-093）：标题行与宿主侧栏展开按钮均不可得且
	// 开关未落位时不渲染（fail-visible）。本 e2e 壳层不含 dsh-web-mobile（无
	// data-mobile-nav 锚），移除 header 即构造「两落位均不可得」：开关随 header
	// 连带脱离文档（该壳层 frame 非空，守卫不摘除已落位开关，T-168），轮询捕获
	// 不在 DOM 态。宿主可能自发重建头部令开关回嵌：每轮先重摘 header（不派发
	// resize，避免宿主重渲染抢先回嵌），守卫经 conversationObserver 唤醒后维持
	// 不在文档态。
	const toggleGone = await until("标题行与锚均不可得时开关不在文档", async () => {
		await page.evaluate(() => {
			document.querySelector('#root [data-slot="main"] header')?.remove();
		});
		return page.evaluate(() => (document.querySelector(".dap-toggle") === null ? true : null));
	});
	assert.ok(toggleGone, "标题行与侧栏展开按钮均不可得时未落位开关不渲染（R-01-008/AC-04 fail-visible）");

	// hero 贴靠几何（T-167）：注入语义属性锚模拟壳层 ⊡（helper；几何取 dsh-web-mobile
	// base.css.ts 实现值，T-166 真机实测同值），验证落位算式——left = 锚右缘 + 8、
	// top 垂直居中。
	await injectMobileFabAnchor(page);
	const heroBox = await until("开关贴靠 ⊡ 右侧落位", async () => {
		await page.evaluate(() => {
			document.querySelector('#root [data-slot="main"] header')?.remove();
		});
		return page.evaluate(() => {
			const toggle = document.querySelector(".dap-toggle");
			const fab = document.querySelector('button[data-mobile-nav="fab"]');
			if (!toggle || !fab) return null;
			if (toggle.parentElement !== fab.parentElement) return null;
			const tr = toggle.getBoundingClientRect();
			const fr = fab.getBoundingClientRect();
			// 镜像实现算式：left = fab.right + 8、top 垂直居中（T-167）。
			const left = Math.round(fr.right + 8);
			const top = Math.round(fr.top + (fr.height - tr.height) / 2);
			return Math.abs(tr.x - left) <= 1 && Math.abs(tr.y - top) <= 1 ? { left, top } : null;
		});
	});
	assert.ok(heroBox !== null, `hero 态开关贴靠 ⊡ 右侧 8px 并垂直居中（实测 ${JSON.stringify(heroBox)}）`);
	const heroZ = await page.evaluate(() => {
		const toggle = document.querySelector(".dap-toggle");
		return toggle ? Number(getComputedStyle(toggle).zIndex) : null;
	});
	assert.ok(heroZ !== null && heroZ > 0 && heroZ < 1100, `hero 态 z-index 处于页面层、低于宿主覆盖层（实测 ${heroZ} < 1100）`);

	// 锚缺失期间保留原位回归（T-168）：宿主抽屉打开时壳层翻转抽屉状态属性并在同一
	// reconciler 遍内移除 ⊡（overlay-backdrop-fab ensure），落位守卫不再摘除已落位
	// 开关——真实壳层中开关由抽屉与遮罩遮挡（z 1060 < 1250/1300），关抽屉即在原位
	// 可见，无「延迟后凭空出现」。模拟：摘锚并经 helper 翻转 frame 抽屉状态属性
	// （异值往返保证突变，帧观察器在属性落定后的微任务中触发落位守卫）→ 断言开关
	// 保留摘锚前原位 → 回注锚并复位属性（模拟关抽屉 ⊡ 回归）→ 复检重锚 → 断言
	// 开关贴靠同位。
	await page.evaluate(() => {
		document.querySelector('button[data-mobile-nav="fab"]')?.remove();
	});
	// 异值两次保证至少一次属性突变，唤醒帧观察器；终态属性缺席＝壳层展开态语义。
	await setHostDrawerCollapsed(page, true);
	await setHostDrawerCollapsed(page, false);
	const kept = await until("锚移除后开关保留原位", () =>
		page.evaluate(({ left, top }) => {
			const toggle = document.querySelector(".dap-toggle");
			if (!toggle) return null;
			const tr = toggle.getBoundingClientRect();
			return Math.abs(tr.x - left) <= 1 && Math.abs(tr.y - top) <= 1 ? { x: tr.x, y: tr.y } : null;
		}, heroBox), 6_000);
	assert.ok(kept !== null, `hero 锚缺失时开关保留摘锚前原位（期望 x=${heroBox.left} y=${heroBox.top}，R-01-008/AC-04 抽屉打开窗口被遮挡，T-168）`);
	await injectMobileFabAnchor(page);
	await setHostDrawerCollapsed(page, true);
	const reanchored = await until("锚回归后开关重锚同位", async () => {
		await page.evaluate(() => {
			document.querySelector('#root [data-slot="main"] header')?.remove();
		});
		return page.evaluate(() => {
			const toggle = document.querySelector(".dap-toggle");
			const fab = document.querySelector('button[data-mobile-nav="fab"]');
			if (!toggle || !fab) return null;
			const tr = toggle.getBoundingClientRect();
			const fr = fab.getBoundingClientRect();
			const left = Math.round(fr.right + 8);
			const top = Math.round(fr.top + (fr.height - tr.height) / 2);
			return Math.abs(tr.x - left) <= 1 && Math.abs(tr.y - top) <= 1 ? true : null;
		});
	}, 6_000);
	assert.ok(reanchored, "hero 锚回归后开关重锚于 ⊡ 右侧同位（R-01-008/AC-04、AC-05）");

	// hero 态开关仍可操作：先点抽屉外部收起上一段打开的抽屉（恢复开关可见），
	// 再点击展开插件抽屉，随后收起还原。
	await page.mouse.click(MOBILE_VIEWPORT.width - 10, MOBILE_VIEWPORT.height / 2);
	await waitDrawerClosed(page, "hero 态验证前收起抽屉");
	await page.locator(".dap-toggle").click();
	await until("hero 态开关点击展开抽屉", async () => {
		const box = await paneBox(page);
		return box && box.x >= -1 ? box : null;
	});
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await waitDrawerClosed(page, "hero 态抽屉收起还原");
}
