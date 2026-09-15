// R-01-021/AC-01、R-01-021/AC-02、R-01-021/AC-03、R-01-021/AC-04、R-01-021/AC-05、R-01-021/AC-06、R-01-021/AC-07
// 卡片紧凑显示：右下角常显切换按钮位于「回到顶部」正上方，一键把活动区与历史区全部卡片
// 切换为仅保留标题行的紧凑呈现（等待类别底色与状态点着色保持），再次激活恢复完整呈现；
// 紧凑下跳转照常，刷新后恢复已选形态，会话状态变化不解除，折叠窄条不显示。
// 找卡一律用 data-wait/data-kind 结构选择器：宿主自动命名会用 LLM 回复改写会话标题，
// 卡片可见文本对断言不稳定。

import { mainAreaHas, openApp, paneBox, sendHeroMessage, until, wheelOver, newSessionWithMessage } from "../helpers.mjs";

const ACTIVE_TITLES = ["e2e:fast 紧凑A", "e2e:fast 紧凑B"];
const RECENT_TITLES = ["e2e:fast 紧凑历史A", "e2e:fast 紧凑历史B"];
const DONE_CARD = '.dap-card[data-wait="done"]';
const RECENT_CARD = '.dap-card[data-kind="recent"]';

/** 单次 DOM 观测：窗格根 data-density 与切换按钮状态（不经 locator 自动等待）。 */
function densityState(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const button = pane.querySelector(".dap-density");
		const top = pane.querySelector(".dap-top");
		const buttonRect = button?.getBoundingClientRect();
		// 可见性按计算样式判定：窄条态经 CSS 隐藏而非 hidden 属性（R-01-021/AC-05）。
		const buttonDisplay = button ? getComputedStyle(button).display : "none";
		return {
			density: pane.getAttribute("data-density"),
			pressed: button?.getAttribute("aria-pressed") ?? null,
			label: button?.getAttribute("aria-label") ?? null,
			buttonHidden: !button || buttonDisplay === "none" || buttonRect.width === 0 || buttonRect.height === 0,
			buttonBox: buttonRect?.toJSON() ?? null,
			topBox: top && !top.hidden ? top.getBoundingClientRect().toJSON() : null,
		};
	});
}

/** 匹配选择器的卡片行可见性（单次 DOM 观测）：标题行必须可见，次要行必须隐藏。 */
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

/** 点击匹配选择器的第一张卡片（激活 = 跳转会话，与卡片文本无关）。 */
function activateFirstCard(page, selector) {
	return page.evaluate((sel) => {
		document.querySelector(`[data-dsh-activity-pane] ${sel}`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	}, selector);
}

/** 等待窗格根 data-density 达到期望形态。 */
async function untilDensity(page, expected, label) {
	await until(label, async () => ((await densityState(page))?.density === expected ? true : null));
}

export default async function compactDensity({ page, url, assert }) {
	// 视口压到 500px 保证列表可滚（「回到顶部」按钮依赖滚动超阈值出现）。
	await page.setViewportSize({ width: 1100, height: 500 });
	await openApp(page, url);

	// 两张完成提醒卡留在活动区（立即结束剧本 → data-wait="done"），两张经「移入历史」进历史区。
	await sendHeroMessage(page, "e2e:fast 紧凑A");
	for (const title of ["e2e:fast 紧凑B", "e2e:fast 紧凑历史A", "e2e:fast 紧凑历史B"]) {
		await newSessionWithMessage(page, title);
	}
	for (let n = 0; n < RECENT_TITLES.length; n += 1) {
		await until("完成提醒卡在场", async () => {
			const done = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
			return done >= 1 ? true : null;
		}, 30_000);
		const before = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
		await page.evaluate(() => document.querySelector(".dap-card[data-wait='done'] .dap-confirm")?.click());
		// 「移入历史」点击后卡片经迁移动画离开活动区，等计数下降再处理下一张。
		await until("完成提醒卡减少一张", async () => {
			const done = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
			return done < before ? true : null;
		}, 30_000);
	}
	await until("两张完成提醒卡就位", async () => {
		const done = await page.locator('[data-dsh-activity-pane] .dap-card[data-wait="done"]').count();
		return done >= ACTIVE_TITLES.length ? true : null;
	}, 30_000);

	// R-01-021/AC-05（完整态）：按钮常显、位于「回到顶部」正上方。
	const box = await paneBox(page);
	await wheelOver(page, box, 400, 12); // 滚出「回到顶部」按钮以断言两者的相对位置
	await until("滚动后回到顶部按钮出现", async () => ((await densityState(page))?.topBox ? true : null));
	const fullState = await densityState(page);
	assert.equal(fullState.density, "full", "默认为完整呈现");
	assert.equal(fullState.pressed, "false", "完整形态下按钮按下态为 false");
	assert.equal(fullState.label, "切换为紧凑显示", "完整形态下按钮可访问名称表达目标形态");
	assert.ok(
		fullState.buttonBox && fullState.topBox && Math.abs(fullState.buttonBox.x - fullState.topBox.x) < 2 && fullState.buttonBox.y + fullState.buttonBox.height <= fullState.topBox.y + 2,
		"切换按钮位于「回到顶部」正上方（R-01-021/AC-05）",
	);

	// 完整态基线：完成提醒卡时间线可见。
	const fullActive = await cardRowState(page, DONE_CARD);
	assert.equal(fullActive?.trace, true, "完整呈现下完成提醒卡时间线可见");
	assert.equal(fullActive?.wait, "done", "前置：完成提醒卡带等待类别标识");

	// R-01-021/AC-01：激活切换 → 全体卡片进入紧凑呈现，按钮按下态翻转。
	await page.getByRole("button", { name: "切换为紧凑显示" }).click();
	await untilDensity(page, "compact", "切换后窗格进入紧凑呈现");
	assert.equal((await densityState(page)).pressed, "true", "紧凑形态下按钮按下态翻转（R-01-021/AC-01）");
	const compactActive = await cardRowState(page, DONE_CARD);
	assert.equal(compactActive?.titleRow, true, "紧凑下完成提醒卡标题行保留（R-01-021/AC-02）");
	assert.equal(compactActive?.head, false, "紧凑下工作区徽标行隐藏（R-01-021/AC-02）");
	assert.equal(compactActive?.trace, false, "紧凑下时间线隐藏（R-01-021/AC-02）");
	assert.equal(compactActive?.foot, false, "紧凑下等待胶囊与正文行隐藏（R-01-021/AC-02）");
	const compactRecent = await cardRowState(page, RECENT_CARD);
	assert.equal(compactRecent?.historyLine, false, "紧凑下最近卡消息预览行隐藏（R-01-021/AC-02）");

	// R-01-021/AC-03：等待类别底色在紧凑下保持。
	assert.equal(compactActive?.wait, "done", "完成提醒卡在紧凑下保留等待类别标识");
	assert.equal(compactActive?.background, fullActive?.background, "紧凑下完成提醒卡面底色与完整呈现一致（R-01-021/AC-03）");

	// R-01-021/AC-04：紧凑下激活卡片照常跳转（主区出现该历史会话的用户消息即视为跳转）。
	await activateFirstCard(page, RECENT_CARD);
	await until("紧凑下跳转生效", async () =>
		((await mainAreaHas(page, RECENT_TITLES[0])) || (await mainAreaHas(page, RECENT_TITLES[1])) ? true : null));

	// R-01-021/AC-07：会话状态变化（新会话入列表）不解除紧凑形态。
	await newSessionWithMessage(page, "e2e:fast 紧凑后续会话");
	assert.equal((await densityState(page)).density, "compact", "新会话出现后仍保持紧凑形态（R-01-021/AC-07）");

	// R-01-021/AC-06：刷新后恢复已选形态。
	await page.reload();
	await until("刷新后恢复紧凑形态", async () => ((await densityState(page))?.density === "compact" ? true : null), 30_000);
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
	assert.equal((await densityState(page)).buttonHidden, true, "折叠窄条不显示紧凑切换按钮（R-01-021/AC-05）");
}
