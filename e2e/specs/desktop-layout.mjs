// R-01-007/AC-01、R-01-007/AC-02、R-01-007/AC-03、R-01-007/AC-04、
// R-01-011/AC-03、R-01-011/AC-04、R-01-011/AC-05
// 桌面贴边布局：窗格位于主会话左侧贴边、不遮挡主会话；键盘折叠/展开控件保持同位；
// 全局面板占屏时窗格收起、主区域让给面板，返回会话后恢复既有折叠形态与宽度。

import { MOCK_FAST_REPLY, openApp, paneBox, sendHeroMessage, sessionComposer, until } from "../helpers.mjs";

// 窄条特征：宽度远小于窗格、高度容纳竖排标题与计数；位置容差取 2px 抗亚像素抖动。
const STRIP_MAX_WIDTH_PX = 60;
const STRIP_MIN_HEIGHT_PX = 60;
const POSITION_TOLERANCE_PX = 2;
// #5 触发条件：全局面板根声明 inline-size containment 时内在宽度为 0，行方向 flex 下
// 被压成窄条。以 section 根为目标，只命中宿主全局面板（会话根为 div），打开即生效。
const GLOBAL_PANEL_CONTAINMENT_CSS = '#root [data-slot="main"] > section { container-type: inline-size; }';

// 单次读取宿主中间列、页面根与窗格的可观察布局状态；结构不齐时返回 null。
const layoutState = (page) =>
	page.evaluate(() => {
		const seat = document.querySelector('#root [data-slot="main"]');
		const center = seat?.parentElement;
		const root = seat?.firstElementChild;
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!center || !root || !pane) return null;
		// 与 applyLayout 同口径找到真实会话弹性项（跳过 display:contents 包装层），
		// 用于断言全局面板态确实清掉 flex，而不是只隐藏窗格。
		let flexNode = document.querySelector("[data-conversation-scroll]");
		let flexItem = null;
		while (flexNode !== null && flexNode !== center && flexNode !== document.body) {
			if (getComputedStyle(flexNode).display !== "contents") flexItem = flexNode;
			flexNode = flexNode.parentElement;
		}
		return {
			direction: getComputedStyle(center).flexDirection,
			paneDisplay: getComputedStyle(pane).display,
			paneWidth: pane.getBoundingClientRect().width,
			centerWidth: center.getBoundingClientRect().width,
			rootWidth: root.getBoundingClientRect().width,
			containerType: getComputedStyle(root).containerType,
			collapsed: pane.getAttribute("data-collapsed"),
			flexGrow: flexItem === null ? null : getComputedStyle(flexItem).flexGrow,
		};
	});

// e2e 宿主为 0.2.0（无 data-global-panel）：在真实对话页施加宿主标记，再经槽座
// childList 唤醒一次重排，验证 0.2.2 标记判据本身（不依赖运行中的宿主版本）。
const setGlobalPanelMarker = async (page, enabled) => {
	await page.evaluate((on) => {
		const seat = document.querySelector('#root [data-slot="main"]');
		const center = seat?.parentElement;
		if (!seat || !center) return;
		if (on) center.setAttribute("data-global-panel", "");
		else center.removeAttribute("data-global-panel");
		// 探针节点同步移除：只制造一次槽座 childList 变化唤醒插件重排，不改会话内容。
		const probe = document.createElement("span");
		seat.appendChild(probe);
		probe.remove();
	}, enabled);
};

export default async function desktopLayout({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, "e2e:fast 桌面布局探针");

	// R-01-007/AC-01：桌面宽度（1280 > 767）下窗格为主会话左侧通高贴边列。
	const box = await until("窗格出现", () => paneBox(page));
	const composerBox = await sessionComposer(page).boundingBox();
	assert.ok(box.x >= 0 && box.width > 0, "窗格在视口内");
	assert.ok(box.y <= 1, "窗格通高贴边（顶缘与外壳侧栏对齐）");
	assert.ok(box.x + box.width <= composerBox.x + 1, `窗格在主会话左侧（窗格右缘 ${box.x + box.width} ≤ 主会话左缘 ${composerBox.x}）`);

	// R-01-007/AC-02：窗格不阻止主会话操作——composer 可聚焦、可输入。
	const composer = sessionComposer(page);
	await composer.click();
	await composer.pressSequentially("主会话可正常输入");
	assert.equal((await composer.textContent())?.trim(), "主会话可正常输入", "主会话 composer 可正常输入");

	// AC-04 用户既选宽度：先把窗格拖宽到非默认值，供全局面板往返后的宽度断言。
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

	// R-01-011/AC-03、AC-05（T-144 顶缘同位语义）：Space 激活标题区收起，控件顶缘保持在窗格顶部同一屏幕位置。
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
	// R-01-011/AC-05（T-144 措辞演进）：仓库入口独立区占标题行最左后，收起控件（标题区）
	// 与展开控件（窄条）的横向起点必然不同——同位语义收敛为顶缘同位：窄条顶缘与标题行
	// 顶缘同位，且窄条贴窗格左缘通高。
	const pane = await paneBox(page);
	assert.ok(
		Math.abs(stripBox.y - headerBox.y) <= POSITION_TOLERANCE_PX && Math.abs(stripBox.x - pane.x) <= POSITION_TOLERANCE_PX,
		`窄条顶缘与标题行同位且贴窗格左缘（strip ${stripBox.x},${stripBox.y} vs header ${headerBox.x},${headerBox.y}、pane x=${pane.x}）`,
	);
	// R-01-011/AC-04：窄条整体为原生按钮，Enter 激活后展开恢复。
	await strip.focus();
	await strip.press("Enter");
	await until("Enter 激活窄条展开恢复", async () => {
		const b = await page.getByRole("button", { name: "收起活动会话窗格" }).boundingBox().catch(() => null);
		return b && Math.abs(b.x - headerBox.x) <= POSITION_TOLERANCE_PX && Math.abs(b.y - headerBox.y) <= POSITION_TOLERANCE_PX ? true : null;
	});

	// R-01-007/AC-03、AC-04（T-193、#5 缺陷回归）：全局面板占屏时窗格收起、面板占满
	// 主区域；返回会话后恢复贴边列与既有折叠窄条。
	await header.press("Space");
	await until("再次折叠为窄条", async () => {
		const b = await page.getByRole("button", { name: /活动会话/ }).last().boundingBox().catch(() => null);
		return b && b.width < STRIP_MAX_WIDTH_PX ? true : null;
	});
	await page.evaluate((css) => {
		const style = document.createElement("style");
		style.id = "e2e-global-panel-containment";
		style.textContent = css;
		document.head.appendChild(style);
	}, GLOBAL_PANEL_CONTAINMENT_CSS);
	await page.getByRole("button", { name: "Plugins", exact: true }).first().click();
	const globalPanel = await until("全局面板占满主区域", async () => {
		const state = await layoutState(page);
		return state &&
			state.direction === "column" &&
			state.paneDisplay === "none" &&
			state.containerType === "inline-size" &&
			state.rootWidth > state.centerWidth * 0.9
			? state
			: null;
	});
	assert.ok(
		globalPanel,
		`全局面板让出主区域且窗格收起（center=${globalPanel?.centerWidth} root=${globalPanel?.rootWidth} container=${globalPanel?.containerType}）`,
	);
	// 会话行标题即 mock 回复文案；原生面板打开时侧栏该行仍可见，点击即返回会话。
	await page.getByText(MOCK_FAST_REPLY, { exact: true }).filter({ visible: true }).first().click();
	const restored = await until("返回会话恢复贴边列与折叠窄条", async () => {
		const state = await layoutState(page);
		return state && state.direction === "row" && state.paneWidth > 0 && state.paneWidth < STRIP_MAX_WIDTH_PX && state.collapsed === "true"
			? state
			: null;
	});
	assert.ok(restored, "返回会话恢复贴边列且折叠窄条保持");
	await page.evaluate(() => document.getElementById("e2e-global-panel-containment")?.remove());
	// AC-04 宽度：展开后回到用户此前的窗格宽度（拖拽后的非默认值）。
	const stripBack = page.getByRole("button", { name: /活动会话/ }).last();
	await stripBack.click();
	const expanded = await until("展开后窗格宽度保持", async () => {
		const state = await layoutState(page);
		return state && state.direction === "row" && state.paneWidth > STRIP_MAX_WIDTH_PX && Math.abs(state.paneWidth - chosen.width) <= 1
			? state
			: null;
	});
	assert.ok(expanded, `返回会话保持用户选择宽度（${chosen.width}px）`);
	// 0.2.2 标记分支：e2e 宿主为 0.2.0（无 data-global-panel）。在真实对话页施加宿主
	// 标记后经槽座 childList 唤醒重排，验证标记优先于保留的会话 DOM，且移除后恢复。
	await setGlobalPanelMarker(page, true);
	const markerLayout = await until("宿主标记触发窗格收起", async () => {
		const state = await layoutState(page);
		return state && state.direction === "column" && state.paneDisplay === "none" && state.flexGrow === "0" ? state : null;
	});
	assert.ok(markerLayout, "data-global-panel 标记优先于保留的会话 DOM，并清掉会话根 flex");
	await setGlobalPanelMarker(page, false);
	const markerRestored = await until("移除标记后恢复贴边列", async () => {
		const state = await layoutState(page);
		return state && state.direction === "row" && state.flexGrow === "1" && state.paneWidth > STRIP_MAX_WIDTH_PX && state.collapsed !== "true"
			? state
			: null;
	});
	assert.ok(markerRestored, "移除标记后恢复贴边列、会话根 flex 与窗格宽度");
	// 反例：hero 页存在会话视图、无全局面板标记，窗格不得被误收起。
	await page.getByRole("button", { name: "New session" }).first().click();
	const hero = await until("hero 页窗格保持可见", async () => {
		const state = await layoutState(page);
		return state && state.direction === "row" && state.paneWidth > 0 ? state : null;
	});
	assert.ok(hero, "hero 页窗格保持可见且为贴边列（全局面板判据不误伤会话视图）");
}
