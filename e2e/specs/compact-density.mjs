// R-01-021/AC-01、R-01-021/AC-02、R-01-021/AC-03、R-01-021/AC-04、R-01-021/AC-05、R-01-021/AC-06、R-01-021/AC-07、R-01-021/AC-08
// 显示档位三档循环：右上角标题栏下方常显切换按钮，完整→中间→紧凑循环；中间档保留
// 工作区徽标行/等待末行/最近卡预览行，紧凑档仅保留标题行；切换时当前选中卡片顶部
// 相对滚动视口的位置稳定（滚动锚定）；档位持久化、状态变化不解除、窄条不显示。
// 找卡一律用 data-wait/data-kind/data-current 结构选择器：宿主自动命名会用 LLM
// 回复改写会话标题，卡片可见文本对断言不稳定。

import { mainAreaHas, newSessionWithMessage, openApp, paneBox, sendHeroMessage, until, wheelOver } from "../helpers.mjs";

const DONE_CARD = '.dap-card[data-wait="done"]';
const RECENT_CARD = '.dap-card[data-kind="recent"]';
const KEEP_DONE_TITLES = ["e2e:fast 紧凑A", "e2e:fast 紧凑B", "e2e:fast 紧凑C", "e2e:fast 紧凑D"];
const RECENT_TITLES = ["e2e:fast 紧凑历史A", "e2e:fast 紧凑历史B"];
const ACTIVE_DONE_COUNT = 4;

/** 单次 DOM 观测：窗格根 data-density 与切换按钮状态（不经 locator 自动等待）。 */
function densityState(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const button = pane.querySelector(".dap-density");
		const buttonRect = button?.getBoundingClientRect();
		const buttonDisplay = button ? getComputedStyle(button).display : "none";
		return {
			density: pane.getAttribute("data-density"),
			label: button?.getAttribute("aria-label") ?? null,
			buttonHidden: !button || buttonDisplay === "none" || buttonRect.width === 0 || buttonRect.height === 0,
			buttonBox: buttonRect?.toJSON() ?? null,
		};
	});
}

/** 当前选中卡片顶部相对滚动视口的位置（滚动锚定断言用，R-01-021/AC-01）。 */
function currentCardAnchor(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const scroll = pane?.querySelector(".dap-scroll");
		const card = scroll?.querySelector(".dap-card[data-current]");
		if (!scroll || !card) return null;
		return {
			anchor: card.getBoundingClientRect().top - scroll.getBoundingClientRect().top,
			scrollTop: scroll.scrollTop,
			offsetTop: card.offsetTop,
		};
	});
}

/** 匹配选择器首张卡片的行可见性：档位行为断言与不稳定的会话标题文本解耦。 */
function cardRowState(page, selector) {
	return page.evaluate((sel) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const card = pane.querySelector(sel);
		if (!card) return null;
		const visible = (cls) => {
			const node = card.querySelector(cls);
			return node ? node.getBoundingClientRect().height > 0 : false;
		};
		return {
			wait: card.getAttribute("data-wait"),
			titleRow: visible(".dap-row"),
			head: visible(".dap-card-head"),
			trace: visible(".dap-trace"),
			subtrace: visible(".dap-subtrace"),
			historyLine: visible(".dap-history-line"),
			foot: visible(".dap-foot"),
			background: getComputedStyle(card).backgroundColor,
		};
	}, selector);
}

/** 激活匹配选择器的第 index 张卡片（激活 = 跳转会话并使其成为当前选中，与卡片文本无关）。 */
function activateCardByIndex(page, selector, index) {
	return page.evaluate(({ sel, idx }) => {
		const card = [...document.querySelectorAll(`[data-dsh-activity-pane] ${sel}`)][idx];
		card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	}, { sel: selector, idx: index });
}

/** 等待窗格根 data-density 达到期望档位。 */
async function untilDensity(page, expected, label) {
	await until(label, async () => ((await densityState(page))?.density === expected ? true : null));
}

export default async function compactDensity({ page, url, assert }) {
	// 视口压到 500px 保证列表可滚（滚动锚定断言需要视口内外的位置差）。
	await page.setViewportSize({ width: 1100, height: 500 });
	await openApp(page, url);

	// 四张完成提醒卡留在活动区（立即结束剧本 → data-wait="done"），两张经「移入历史」进历史区；
	// 活动区多张完成卡保证完整档列表高于视口，滚动锚定有上下行余量。
	await sendHeroMessage(page, KEEP_DONE_TITLES[0]);
	for (const title of [...KEEP_DONE_TITLES.slice(1), ...RECENT_TITLES]) {
		await newSessionWithMessage(page, title);
	}
	for (let n = 0; n < RECENT_TITLES.length; n += 1) {
		await until(`出现第 ${n + 1} 张待移入历史的完成卡`, async () => {
			const done = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
			return done >= 1 ? true : null;
		}, 30_000);
		const before = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
		await page.evaluate(() => document.querySelector(".dap-card[data-wait='done'] .dap-confirm")?.click());
		// 「移入历史」点击后卡片经迁移动画离开活动区，等计数比点击前下降再处理下一张。
		await until("完成提醒卡减少一张", async () => {
			const done = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
			return done < before ? true : null;
		}, 30_000);
	}
	await until("四张完成提醒卡就位", async () => {
		const done = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
		return done >= ACTIVE_DONE_COUNT ? true : null;
	}, 30_000);

	// R-01-021/AC-05（完整态）：按钮常显于窗格右上角、标题栏正下方（悬浮于列表之上）。
	const box = await paneBox(page);
	const fullState = await densityState(page);
	assert.equal(fullState.density, "full", "默认为完整呈现");
	assert.equal(fullState.label, "切换为中间显示", "完整档下按钮可访问名称表达目标档位（R-01-021/AC-01）");
	assert.ok(
		fullState.buttonBox && fullState.buttonBox.y >= box.y && fullState.buttonBox.y <= box.y + 60 && fullState.buttonBox.x + fullState.buttonBox.width >= box.x + box.width - 40,
		`切换按钮位于窗格右上角、标题栏正下方（button y=${Math.round(fullState.buttonBox?.y ?? -1)}，pane y=${Math.round(box.y)}，R-01-021/AC-05）`,
	);

	// 完整态基线：完成提醒卡时间线可见。
	const fullActive = await cardRowState(page, DONE_CARD);
	assert.equal(fullActive?.trace, true, "完整呈现下完成提醒卡时间线可见");
	assert.equal(fullActive?.wait, "done", "前置：完成提醒卡带等待类别标识");

	// R-01-021/AC-01（滚动锚定）：完整 → 中间后，当前选中卡片顶部相对视口位置不变。
	// 先激活第三张完成卡使 data-current 落在列表中部，再把其顶部滚到与视口顶对齐：
	// 上方滚动余量（= 卡内容偏移）恒不小于上方行收缩量，锚定补偿可精确执行。
	await activateCardByIndex(page, DONE_CARD, 2);
	await page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const scroll = pane?.querySelector(".dap-scroll");
		const card = scroll?.querySelector(".dap-card[data-current]");
		if (scroll && card) scroll.scrollTop = card.offsetTop;
	});
	const anchorBefore = await currentCardAnchor(page);

	// R-01-021/AC-08：完整 → 中间，保留标题行/工作区徽标行/等待末行/消息预览行，隐藏时间线与统计。
	await page.getByRole("button", { name: "切换为中间显示" }).click();
	await untilDensity(page, "medium", "切换后进入中间呈现");
	const anchorAfter = await currentCardAnchor(page);
	assert.ok(
		anchorBefore !== null && anchorAfter !== null && Math.abs(anchorBefore.anchor - anchorAfter.anchor) <= 2,
		`切换前后当前选中卡片顶部相对视口位置稳定（${JSON.stringify(anchorBefore)} → ${JSON.stringify(anchorAfter)}，R-01-021/AC-01）`,
	);
	const mediumActive = await cardRowState(page, DONE_CARD);
	assert.equal(mediumActive?.titleRow, true, "中间下完成提醒卡标题行保留（R-01-021/AC-08）");
	assert.equal(mediumActive?.head, true, "中间下工作区徽标行保留（R-01-021/AC-08）");
	assert.equal(mediumActive?.foot, true, "中间下等待胶囊与正文行保留（R-01-021/AC-08）");
	assert.equal(mediumActive?.trace, false, "中间下时间线隐藏（R-01-021/AC-08）");
	const mediumRecent = await cardRowState(page, RECENT_CARD);
	assert.equal(mediumRecent?.head, true, "中间下最近卡工作区徽标行保留（R-01-021/AC-08）");
	assert.equal(mediumRecent?.historyLine, true, "中间下最近卡消息预览行保留（R-01-021/AC-08）");

	// R-01-021/AC-02：紧凑档仅保留标题行。
	await page.getByRole("button", { name: "切换为紧凑显示" }).click();
	await untilDensity(page, "compact", "切换后进入紧凑呈现");
	const compactActive = await cardRowState(page, DONE_CARD);
	assert.equal(compactActive?.titleRow, true, "紧凑下完成提醒卡标题行保留（R-01-021/AC-02）");
	assert.equal(compactActive?.head, false, "紧凑下工作区徽标行隐藏（R-01-021/AC-02）");
	assert.equal(compactActive?.foot, false, "紧凑下等待胶囊与正文行隐藏（R-01-021/AC-02）");
	const compactRecent = await cardRowState(page, RECENT_CARD);
	assert.equal(compactRecent?.historyLine, false, "紧凑下最近卡消息预览行隐藏（R-01-021/AC-02）");

	// R-01-021/AC-03：等待类别底色在紧凑下保持。
	assert.equal(compactActive?.wait, "done", "完成提醒卡在紧凑下保留等待类别标识");
	assert.equal(compactActive?.background, fullActive?.background, "紧凑下完成提醒卡面底色与完整呈现一致（R-01-021/AC-03）");

	// R-01-021/AC-04：紧凑下激活卡片照常跳转。
	await activateCardByIndex(page, RECENT_CARD, 0);
	await until("紧凑下跳转生效", async () =>
		((await mainAreaHas(page, RECENT_TITLES[0])) || (await mainAreaHas(page, RECENT_TITLES[1])) ? true : null));

	// R-01-021/AC-07：会话状态变化（新会话入列表）不解除档位。
	await newSessionWithMessage(page, "e2e:fast 紧凑后续会话");
	assert.equal((await densityState(page)).density, "compact", "新会话出现后仍保持紧凑档（R-01-021/AC-07）");

	// R-01-021/AC-06：刷新后恢复已选档位（紧凑），切回完整后刷新保持完整。
	await page.reload();
	await until("刷新后恢复紧凑档", async () => ((await densityState(page))?.density === "compact" ? true : null), 30_000);
	await page.getByRole("button", { name: "切换为完整显示" }).click();
	await page.reload();
	await until("切回完整后刷新保持完整", async () => ((await densityState(page))?.density === "full" ? true : null), 30_000);

	// R-01-021/AC-05（窄条）：折叠后不显示切换按钮。
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		return b && b.width < 60 && b.height > 60 ? true : null;
	});
	assert.equal((await densityState(page)).buttonHidden, true, "折叠窄条不显示显示档位切换按钮（R-01-021/AC-05）");
}
