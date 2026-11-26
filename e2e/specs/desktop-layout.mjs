// 、
// 桌面贴边布局：窗格作为外壳侧栏右侧的常驻列，不随主区域在会话视图与全局面板之间切换
// 而显隐；展开/收起只由用户操作决定，主内容按当前页面弹性填充窗格右侧余宽。

import { MOCK_FAST_REPLY, openApp, paneBox, sendHeroMessage, sessionComposer, until } from "../helpers.mjs";

// 窄条特征：宽度远小于窗格、高度容纳竖排标题与计数；位置容差取 2px 抗亚像素抖动。
const STRIP_MAX_WIDTH_PX = 60;
const STRIP_MIN_HEIGHT_PX = 60;
const POSITION_TOLERANCE_PX = 2;
// #5 触发条件：全局面板根声明 inline-size containment 时内在宽度为 0；窗格常驻后
// 面板根必须获得窗格右侧的弹性余宽，不能被压成窄条。以 section 根为目标，只命中
// 宿主全局面板（会话根为 div），打开即生效。
const GLOBAL_PANEL_CONTAINMENT_CSS = '#root [data-slot="main"] > section { container-type: inline-size; }';

// 单次读取宿主中间列、当前 entry 根与窗格的可观察布局状态；结构不齐时返回 null。
// entry 根取槽座首个非 display:contents 后代；面板/会话/hero 各自以独立字段判别，
// 避免「等待条件在切页前已成立」的假绿。
const layoutState = (page) =>
	page.evaluate(() => {
		const seat = document.querySelector('#root [data-slot="main"]');
		const center = seat?.parentElement;
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!center || !seat || !pane) return null;
		let root = seat.firstElementChild;
		while (root !== null && getComputedStyle(root).display === "contents") root = root.firstElementChild;
		if (root === null) return null;
		const paneRect = pane.getBoundingClientRect();
		const rootRect = root.getBoundingClientRect();
		// 侧栏锚优先宿主语义槽座（[data-slot="sidebar"]），向上跳过 contents 占位层，
		// 不耦合宿主内部哈希类名。
		let sidebar = document.querySelector('[data-slot="sidebar"]');
		while (sidebar !== null && getComputedStyle(sidebar).display === "contents") sidebar = sidebar.parentElement;
		const hit = document.elementFromPoint(rootRect.x + 8, rootRect.y + rootRect.height / 2);
		return {
			direction: getComputedStyle(center).flexDirection,
			paneDisplay: getComputedStyle(pane).display,
			paneWidth: paneRect.width,
			paneHeight: paneRect.height,
			paneX: paneRect.x,
			paneRight: paneRect.right,
			sidebarRight: sidebar?.getBoundingClientRect().right ?? null,
			centerWidth: center.getBoundingClientRect().width,
			rootWidth: rootRect.width,
			rootX: rootRect.x,
			entryTag: root.tagName,
			containerType: getComputedStyle(root).containerType,
			globalPanelMarker: center.hasAttribute("data-global-panel"),
			conversationScroll: document.querySelector('[data-conversation-scroll]') !== null,
			heroPhase: root.getAttribute("data-phase") === "hero",
			paneHitInPane: hit === null ? null : pane.contains(hit),
			collapsed: pane.getAttribute("data-collapsed"),
			flexGrow: getComputedStyle(root).flexGrow,
			docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
		};
	});

/** 断言主区域页面与窗格并列：窗格未被隐藏、贴侧栏右缘、入口根紧贴窗格右缘并占满余宽。 */
const assertPaneResident = (state, label, assert) => {
	assert.ok(state, label);
	assert.equal(state.direction, "row", `${label}：中列保持行布局`);
	assert.notEqual(state.paneDisplay, "none", `${label}：窗格未被自动隐藏`);
	assert.ok(state.paneWidth > 0, `${label}：窗格宽度非零（不得塌陷）`);
	assert.ok(state.sidebarRight !== null, `${label}：外壳侧栏可定位`);
	assert.ok(
		Math.abs(state.paneX - state.sidebarRight) <= POSITION_TOLERANCE_PX,
		`${label}：窗格贴侧栏右缘（pane x=${state.paneX}、sidebar right=${state.sidebarRight}）`,
	);
	assert.ok(
		Math.abs(state.rootX - state.paneRight) <= POSITION_TOLERANCE_PX,
		`${label}：主内容紧贴窗格右缘（root x=${state.rootX}、pane right=${state.paneRight}）`,
	);
	assert.ok(
		Math.abs(state.rootWidth - (state.centerWidth - state.paneWidth)) <= POSITION_TOLERANCE_PX,
		`${label}：主内容占满窗格右侧余宽（root=${state.rootWidth}、center-pane=${state.centerWidth - state.paneWidth}）`,
	);
	assert.equal(state.flexGrow, "1", `${label}：当前 entry 根弹性填充`);
	assert.equal(state.paneHitInPane, false, `${label}：主区域左缘命中不被窗格遮挡`);
	assert.equal(state.docOverflowX, false, `${label}：无文档横向溢出`);
};

// e2e 宿主为 0.2.0（无 data-global-panel）：在真实对话页施加宿主标记，验证 0.2.2
// 标记不再改变窗格显隐与布局（不依赖运行中的宿主版本）。返回标记是否确实落位，
// 避免选择器失配时静默 no-op 让用例空绿。
const setGlobalPanelMarker = async (page, enabled) =>
	page.evaluate((on) => {
		const seat = document.querySelector('#root [data-slot="main"]');
		const center = seat?.parentElement;
		if (!seat || !center) return false;
		if (on) center.setAttribute("data-global-panel", "");
		else center.removeAttribute("data-global-panel");
		return center.hasAttribute("data-global-panel") === on;
	}, enabled);

export default async function desktopLayout({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, "e2e:fast 桌面布局探针");

	// 桌面宽度（1280 > 767）下窗格为侧栏右侧通高贴边列。
	const box = await until("窗格出现", () => paneBox(page));
	const composerBox = await sessionComposer(page).boundingBox();
	assert.ok(box.x >= 0 && box.width > 0, "窗格在视口内");
	assert.ok(box.y <= 1, "窗格通高贴边（顶缘与外壳侧栏对齐）");
	assert.ok(box.x + box.width <= composerBox.x + 1, `窗格在主会话左侧（窗格右缘 ${box.x + box.width} ≤ 主会话左缘 ${composerBox.x}）`);

	// 窗格不阻止主会话操作——composer 可聚焦、可输入。
	const composer = sessionComposer(page);
	await composer.click();
	await composer.pressSequentially("主会话可正常输入");
	assert.equal((await composer.textContent())?.trim(), "主会话可正常输入", "主会话 composer 可正常输入");

	//  用户既选宽度：先把窗格拖宽到非默认值，供页面往返后的宽度断言。
	const edgeX = box.x + box.width;
	const midY = box.y + box.height / 2;
	await page.mouse.move(edgeX - 2, midY);
	await page.mouse.down();
	await page.mouse.move(edgeX + 40, midY, { steps: 6 });
	await page.mouse.up();
	const chosen = await until("窗格调宽到用户选择值", async () => {
		const b = await paneBox(page);
		return b && b.width > box.width + 20 ? b : null;
	});

	// （T-144 顶缘同位语义）：Space 激活标题区收起，控件顶缘保持在窗格顶部同一屏幕位置。
	const header = page.getByRole("button", { name: "收起活动会话窗格" });
	const headerBox = await header.boundingBox();
	assert.ok(headerBox, "展开态标题行控件存在");
	await header.focus();
	assert.equal(await header.evaluate((el) => document.activeElement === el), true, "标题行可经键盘聚焦");
	await header.press("Space");
	// 折叠为窄条：窄条整体是展开控件，其顶端与原标题行同位。
	const strip = await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		// 窄条特征：窄（远小于窗格宽）且高（竖排标题）
		return b && b.width < STRIP_MAX_WIDTH_PX && b.height > STRIP_MIN_HEIGHT_PX ? candidate : null;
	});
	const stripBox = await strip.boundingBox();
	// （T-144 措辞演进）：仓库入口独立区占标题行最左后，收起控件（标题区）
	// 与展开控件（窄条）的横向起点必然不同——同位语义收敛为顶缘同位：窄条顶缘与标题行
	// 顶缘同位，且窄条贴窗格左缘通高。
	const pane = await paneBox(page);
	assert.ok(
		Math.abs(stripBox.y - headerBox.y) <= POSITION_TOLERANCE_PX && Math.abs(stripBox.x - pane.x) <= POSITION_TOLERANCE_PX,
		`窄条顶缘与标题行同位且贴窗格左缘（strip ${stripBox.x},${stripBox.y} vs header ${headerBox.x},${headerBox.y}、pane x=${pane.x}）`,
	);
	// 窄条整体为原生按钮，Enter 激活后展开恢复。
	await strip.focus();
	await strip.press("Enter");
	await until("Enter 激活窄条展开恢复", async () => {
		const b = await page.getByRole("button", { name: "收起活动会话窗格" }).boundingBox().catch(() => null);
		return b && Math.abs(b.x - headerBox.x) <= POSITION_TOLERANCE_PX && Math.abs(b.y - headerBox.y) <= POSITION_TOLERANCE_PX ? true : null;
	});

	// （T-197，C-103）：折叠态切到全局面板——窗格保持窄条可见
	// 面板占窗格右侧余宽；页面切换不由代码改变用户折叠形态。
	await header.press("Space");
	await until("再次折叠为窄条", async () => {
		const b = await page.getByRole("button", { name: /活动会话/ }).last().boundingBox().catch(() => null);
		return b && b.width < STRIP_MAX_WIDTH_PX ? true : null;
	});
	const stripWidth = (await paneBox(page)).width;
	// 记录当前窗格节点身份：页面切换不得重建窗格。
	await page.evaluate(() => {
		window.__e2ePaneNode = document.querySelector("[data-dsh-activity-pane]");
	});
	await page.getByRole("button", { name: "Plugins", exact: true }).first().click();
	const collapsedOnPanel = await until("折叠态插件页窗格常驻", async () => {
		const state = await layoutState(page);
		return state &&
			state.entryTag === "SECTION" &&
			state.conversationScroll === false &&
			state.direction === "row" &&
			state.paneDisplay !== "none" &&
			state.paneWidth >= 24 &&
			state.paneWidth < STRIP_MAX_WIDTH_PX &&
			Math.abs(state.paneWidth - stripWidth) <= 1 &&
			state.paneHeight > 100 &&
			Math.abs(state.rootWidth - (state.centerWidth - state.paneWidth)) <= POSITION_TOLERANCE_PX
			? state
			: null;
	});
	assertPaneResident(collapsedOnPanel, "折叠态插件页", assert);
	assert.equal(collapsedOnPanel.collapsed, "true", "折叠态切页后窗格仍为窄条（用户形态保持）");
	assert.equal(
		await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]") === window.__e2ePaneNode),
		true,
		"页面切换未重建窗格节点",
	);

	// 会话行标题即 mock 回复文案；原生面板打开时侧栏该行仍可见，点击即返回会话。
	await page.getByText(MOCK_FAST_REPLY, { exact: true }).filter({ visible: true }).first().click();
	const collapsedBack = await until("返回会话折叠窄条保持", async () => {
		const state = await layoutState(page);
		return state &&
			state.conversationScroll === true &&
			state.direction === "row" &&
			state.paneWidth >= 24 &&
			state.paneWidth < STRIP_MAX_WIDTH_PX &&
			Math.abs(state.paneWidth - stripWidth) <= 1 &&
			state.paneHeight > 100 &&
			state.collapsed === "true" &&
			Math.abs(state.rootWidth - (state.centerWidth - state.paneWidth)) <= POSITION_TOLERANCE_PX
			? state
			: null;
	});
	assertPaneResident(collapsedBack, "返回会话（折叠态）", assert);
	assert.equal(
		await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]") === window.__e2ePaneNode),
		true,
		"返回会话未重建窗格节点",
	);
	//  宽度：展开后回到用户此前的窗格宽度（拖拽后的非默认值）。
	const stripBack = page.getByRole("button", { name: /活动会话/ }).last();
	await stripBack.click();
	const expanded = await until("展开后窗格宽度保持", async () => {
		const state = await layoutState(page);
		return state &&
			state.conversationScroll === true &&
			state.direction === "row" &&
			state.paneWidth > STRIP_MAX_WIDTH_PX &&
			Math.abs(state.paneWidth - chosen.width) <= 1
			? state
			: null;
	});
	assert.ok(expanded, `返回会话保持用户选择宽度（${chosen.width}px）`);
	// 记录展开态窗格节点身份：展开态切页同样不得重建窗格。
	await page.evaluate(() => {
		window.__e2ePaneExpanded = document.querySelector("[data-dsh-activity-pane]");
	});

	// （T-197、#5 缺陷回归）：展开态切到 containment 全局面板——面板根
	// 仍从窗格右侧取得弹性余宽而不是塌成窄条，窗格保持用户宽度。
	await page.evaluate((css) => {
		const style = document.createElement("style");
		style.id = "e2e-global-panel-containment";
		style.textContent = css;
		document.head.appendChild(style);
	}, GLOBAL_PANEL_CONTAINMENT_CSS);
	await page.getByRole("button", { name: "Plugins", exact: true }).first().click();
	const expandedOnPanel = await until("展开态 containment 插件页窗格常驻", async () => {
		const state = await layoutState(page);
		return state &&
			state.entryTag === "SECTION" &&
			state.conversationScroll === false &&
			state.containerType === "inline-size" &&
			state.direction === "row" &&
			state.paneDisplay !== "none" &&
			state.paneWidth > STRIP_MAX_WIDTH_PX &&
			Math.abs(state.rootWidth - (state.centerWidth - state.paneWidth)) <= POSITION_TOLERANCE_PX
			? state
			: null;
	});
	assertPaneResident(expandedOnPanel, "展开态 containment 插件页", assert);
	assert.equal(
		await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]") === window.__e2ePaneExpanded),
		true,
		"展开态页面切换未重建窗格节点",
	);
	assert.ok(
		Math.abs(expandedOnPanel.paneWidth - chosen.width) <= 1,
		`全局面板期间窗格保持用户选择宽度（${expandedOnPanel.paneWidth} vs ${chosen.width}）`,
	);
	assert.ok(
		expandedOnPanel.rootWidth > expandedOnPanel.centerWidth * 0.4,
		`containment 面板根取得弹性余宽而非塌陷（root=${expandedOnPanel.rootWidth}、center=${expandedOnPanel.centerWidth}）`,
	);
	await page.getByText(MOCK_FAST_REPLY, { exact: true }).filter({ visible: true }).first().click();
	const widthBack = await until("返回会话宽度保持", async () => {
		const state = await layoutState(page);
		return state &&
			state.conversationScroll === true &&
			state.direction === "row" &&
			Math.abs(state.paneWidth - chosen.width) <= 1 &&
			Math.abs(state.rootWidth - (state.centerWidth - state.paneWidth)) <= POSITION_TOLERANCE_PX
			? state
			: null;
	});
	assertPaneResident(widthBack, "返回会话（展开态）", assert);
	assert.equal(
		await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]") === window.__e2ePaneExpanded),
		true,
		"返回会话未重建展开态窗格节点",
	);
	await page.evaluate(() => document.getElementById("e2e-global-panel-containment")?.remove());

	// 0.2.2 标记分支：e2e 宿主为 0.2.0（无 data-global-panel）。在真实对话页施加宿主
	// 标记并断言属性确实落位，跨过一个同步窗口后再断言标记不触发窗格收起或布局回退；
	// 移除后形态不变。
	assert.equal(await setGlobalPanelMarker(page, true), true, "宿主全局面板标记已落位");
	await page.waitForTimeout(500);
	const markerLayout = await until("宿主标记不改变窗格显隐", async () => {
		const state = await layoutState(page);
		return state &&
			state.globalPanelMarker === true &&
			state.direction === "row" &&
			state.paneDisplay !== "none" &&
			state.flexGrow === "1" &&
			Math.abs(state.rootWidth - (state.centerWidth - state.paneWidth)) <= POSITION_TOLERANCE_PX
			? state
			: null;
	});
	assertPaneResident(markerLayout, "data-global-panel 标记期", assert);
	assert.ok(Math.abs(markerLayout.paneWidth - chosen.width) <= 1, "标记期窗格宽度保持用户选择值");
	assert.equal(await setGlobalPanelMarker(page, false), true, "宿主全局面板标记已移除");
	await page.waitForTimeout(300);
	const markerRestored = await until("移除标记后形态不变", async () => {
		const state = await layoutState(page);
		return state &&
			state.globalPanelMarker === false &&
			state.direction === "row" &&
			state.flexGrow === "1" &&
			Math.abs(state.paneWidth - chosen.width) <= 1
			? state
			: null;
	});
	assert.ok(markerRestored, "移除标记后窗格宽度与行布局保持");

	// 反例：hero 页存在会话视图，窗格不得被误收起。
	await page.getByRole("button", { name: "New session" }).first().click();
	const hero = await until("hero 页窗格保持可见", async () => {
		const state = await layoutState(page);
		return state && state.heroPhase === true && state.conversationScroll === true && state.direction === "row" && state.paneWidth > 0
			? state
			: null;
	});
	assert.ok(hero, "hero 页窗格保持可见且为贴边列");
}
