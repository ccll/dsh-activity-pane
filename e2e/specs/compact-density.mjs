// R-01-021/AC-01、R-01-021/AC-02、R-01-021/AC-03、R-01-021/AC-04、R-01-021/AC-05、R-01-021/AC-06、R-01-021/AC-07、R-01-021/AC-08、R-01-011/AC-07
// 显示档位三档循环：切换按钮常显于「活动会话」标题行右侧工具区，紧凑→中间→完整循环；
// 无持久化档位时默认中间档；中间档保留工作区徽标行/等待末行/最近卡预览行，紧凑档仅
// 保留标题行；切换时当前选中卡片顶部相对滚动视口的位置稳定（滚动锚定）；档位持久化、
// 状态变化不解除、窄条不显示；悬停标题区时于其最右端显现收起方向图标，不高亮工具区。
// 找卡一律用 data-wait/data-kind/data-current 结构选择器：宿主自动命名会用 LLM
// 回复改写会话标题，卡片可见文本对断言不稳定。

import { mainAreaHas, newSessionWithMessage, openApp, paneBox, sendHeroMessage, until } from "../helpers.mjs";

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
			inTools: !!pane.querySelector(".dap-tools .dap-density") && !pane.querySelector(".dap-titlebar .dap-density"),
			buttonBox: buttonRect?.toJSON() ?? null,
		};
	});
}

/** 标题行收起方向图标状态：悬停可见性、与工具区按钮的相邻关系（R-01-011/AC-07）。 */
function collapseHintState(page) {
	return page.evaluate(() => {
		const header = document.querySelector("[data-dsh-activity-pane] .dap-header");
		const hint = header?.querySelector(".dap-titlebar .dap-collapse-hint");
		const tools = header?.querySelector(".dap-tools");
		if (!header || !hint || !tools) return null;
		const rect = hint.getBoundingClientRect();
		// T-139：工具区第一颗按钮可能是仓库入口，锚点用工具区容器左缘（不感知按钮顺序）。
		const toolsRect = tools.getBoundingClientRect();
		return {
			visible: getComputedStyle(hint).opacity !== "0" && rect.width > 0 && rect.height > 0,
			gapToTools: toolsRect.left - rect.right,
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

/** 同行判定的垂直中心容差（px）：收合行内胶囊与按钮中线偏差的噪声上界。 */
const ROW_TOLERANCE_PX = 2;

/** 完成提醒卡末行几何：胶囊/正文/按钮的可见性与相对位置（中间档收合形态断言用）。 */
function footLayout(page, selector) {
	return page.evaluate(({ sel, rowTolerancePx }) => {
		const card = document.querySelector(`[data-dsh-activity-pane] ${sel}`);
		if (!card) return null;
		const rect = (cls) => {
			const node = card.querySelector(cls);
			return node ? node.getBoundingClientRect() : null;
		};
		const capsule = rect(".dap-capsule");
		const note = rect(".dap-note");
		const confirm = rect(".dap-confirm");
		const mid = (r) => (r ? r.top + r.height / 2 : null);
		const capsuleEl = card.querySelector(".dap-capsule");
		return {
			capsuleVisible: capsule !== null && capsule.height > 0,
			noteVisible: note !== null && note.height > 0,
			confirmVisible: confirm !== null && confirm.height > 0,
			capsulePulse: capsuleEl ? getComputedStyle(capsuleEl).animationName : "",
			sameRow: capsule && confirm ? Math.abs(mid(capsule) - mid(confirm)) <= rowTolerancePx : false,
			capsuleLeft: capsule && confirm ? capsule.left < confirm.left : false,
		};
	}, { sel: selector, rowTolerancePx: ROW_TOLERANCE_PX });
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

/** 按可访问名称点击档位切换按钮并等待进入期望档位；升序循环的每步推进共用此形状。 */
async function stepDensity(page, name, expected, label) {
	await page.getByRole("button", { name }).click();
	await untilDensity(page, expected, label);
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

	// R-01-021/AC-06：无持久化档位时默认中间档；R-01-021/AC-05：按钮常显于标题行右侧工具区。
	const box = await paneBox(page);
	const mediumState = await densityState(page);
	assert.equal(mediumState.density, "medium", "无持久化记录默认为中间呈现（R-01-021/AC-06）");
	assert.equal(mediumState.inTools, true, "切换按钮位于标题行右侧固定工具区内（R-01-021/AC-05）");
	assert.equal(mediumState.label, "切换为完整显示", "中间档下按钮可访问名称表达目标档位（R-01-021/AC-01）");
	assert.ok(
		mediumState.buttonBox && mediumState.buttonBox.y >= box.y && mediumState.buttonBox.y + mediumState.buttonBox.height <= box.y + 48 && mediumState.buttonBox.x + mediumState.buttonBox.width >= box.x + box.width - 72,
		`切换按钮位于标题行右侧工具区（右侧可再并排仓库入口按钮，button y=${Math.round(mediumState.buttonBox?.y ?? -1)}，pane y=${Math.round(box.y)}，R-01-021/AC-05、R-01-022/AC-01）`,
	);

	// 中间档基线（默认档）：完成提醒卡时间线仅最新一行。
	const mediumBaseline = await cardRowState(page, DONE_CARD);
	assert.equal(mediumBaseline?.titleRow, true, "中间下完成提醒卡标题行保留（R-01-021/AC-08）");
	assert.equal(mediumBaseline?.head, true, "中间下工作区徽标行保留（R-01-021/AC-08）");
	assert.equal(mediumBaseline?.foot, true, "中间下等待胶囊与正文行保留（R-01-021/AC-08）");
	assert.equal(mediumBaseline?.trace, true, "中间呈现下完成提醒卡时间线可见");
	assert.equal(mediumBaseline?.wait, "done", "前置：完成提醒卡带等待类别标识");
	// R-01-002/AC-09 基线：末行在中间档收合为单行（R-01-021/AC-08）。
	const mediumFootAtDefault = await footLayout(page, DONE_CARD);
	assert.equal(mediumFootAtDefault?.capsuleVisible, true, "中间档完成提醒卡「已完成」胶囊显示（R-01-021/AC-08）");
	assert.equal(mediumFootAtDefault?.confirmVisible, true, "中间档完成提醒卡「移入历史」按钮显示（R-01-021/AC-08）");
	assert.equal(mediumFootAtDefault?.noteVisible, false, "中间档完成提醒卡正文行不再显示（R-01-021/AC-08）");
	assert.equal(mediumFootAtDefault?.sameRow, true, "中间档完成提醒卡胶囊与按钮同行（R-01-021/AC-08）");
	assert.equal(mediumFootAtDefault?.capsuleLeft, true, "中间档完成提醒卡胶囊居左、按钮居右（R-01-021/AC-08）");
	assert.equal(mediumFootAtDefault?.capsulePulse, "dap-pulse", "中间档完成提醒卡胶囊保持 dap-pulse 脉冲（R-01-002/AC-08）");
	const mediumTraceLines = await page.evaluate((sel) => {
		const card = document.querySelector(`[data-dsh-activity-pane] ${sel}`);
		return card ? card.querySelectorAll(".dap-trace .dap-trace-item").length : -1;
	}, DONE_CARD);
	assert.equal(mediumTraceLines, 1, "中间档每卡时间线恰 1 行——时间线最新一行（R-01-021/AC-08）");
	const mediumRecent = await cardRowState(page, RECENT_CARD);
	assert.equal(mediumRecent?.head, true, "中间下最近卡工作区徽标行保留（R-01-021/AC-08）");
	assert.equal(mediumRecent?.historyLine, true, "中间下最近卡消息预览行保留（R-01-021/AC-08）");

	// R-01-021/AC-04（中间档）：激活卡片照常跳转。
	await activateCardByIndex(page, RECENT_CARD, 0);
	await until("中间下跳转生效", async () =>
		((await mainAreaHas(page, RECENT_TITLES[0])) || (await mainAreaHas(page, RECENT_TITLES[1])) ? true : null));

	// R-01-021/AC-02：紧凑档仅保留标题行（升序循环：中间 → 完整 → 紧凑两步推进）。
	await stepDensity(page, "切换为完整显示", "full", "第一步切换进入完整呈现");
	await stepDensity(page, "切换为紧凑显示", "compact", "切换后进入紧凑呈现");
	const compactActive = await cardRowState(page, DONE_CARD);
	assert.equal(compactActive?.titleRow, true, "紧凑下完成提醒卡标题行保留（R-01-021/AC-02）");
	assert.equal(compactActive?.head, false, "紧凑下工作区徽标行隐藏（R-01-021/AC-02）");
	assert.equal(compactActive?.foot, false, "紧凑下等待胶囊与正文行隐藏（R-01-021/AC-02）");
	const compactRecent = await cardRowState(page, RECENT_CARD);
	assert.equal(compactRecent?.historyLine, false, "紧凑下最近卡消息预览行隐藏（R-01-021/AC-02）");

	// R-01-021/AC-03：等待类别底色在紧凑下保持。
	assert.equal(compactActive?.wait, "done", "完成提醒卡在紧凑下保留等待类别标识");
	assert.equal(compactActive?.background, mediumBaseline?.background, "紧凑下完成提醒卡面底色与中间呈现一致（R-01-021/AC-03）");

	// R-01-021/AC-04：紧凑下激活卡片照常跳转。
	await activateCardByIndex(page, RECENT_CARD, 1);
	await until("紧凑下跳转生效", async () =>
		((await mainAreaHas(page, RECENT_TITLES[0])) || (await mainAreaHas(page, RECENT_TITLES[1])) ? true : null));

	// R-01-021/AC-07：会话状态变化（新会话入列表）不解除档位。
	await newSessionWithMessage(page, "e2e:fast 紧凑后续会话");
	assert.equal((await densityState(page)).density, "compact", "新会话出现后仍保持紧凑档（R-01-021/AC-07）");

	// R-01-021/AC-06：刷新后恢复已选档位（紧凑），切回完整后刷新保持完整（升序循环：
	// 紧凑 → 中间 → 完整两步推进，切换同步写 localStorage，reload 读到的即完整档）。
	await page.reload();
	await until("刷新后恢复紧凑档", async () => ((await densityState(page))?.density === "compact" ? true : null), 30_000);
	await stepDensity(page, "切换为中间显示", "medium", "紧凑后第一步进入中间呈现");
	await stepDensity(page, "切换为完整显示", "full", "第二步切回完整呈现");
	await page.reload();
	await until("切回完整后刷新保持完整", async () => ((await densityState(page))?.density === "full" ? true : null), 30_000);

	// R-01-021/AC-01（滚动锚定）：中间 → 完整（升序方向一步切换）后，当前选中卡片顶部
	// 相对视口位置不变。先把档位从完整档两步带到中间档，再激活第三张完成卡并等
	// data-current 落定（跳转异步完成），把其顶部滚到与视口顶对齐后切换档位。
	await stepDensity(page, "切换为紧凑显示", "compact", "完整后第一步进入紧凑呈现");
	await stepDensity(page, "切换为中间显示", "medium", "第二步回到中间呈现");
	await activateCardByIndex(page, DONE_CARD, 2);
	await until("第三张完成卡成为当前选中", async () => {
		return page.evaluate(() => {
			const cards = [...document.querySelectorAll('[data-dsh-activity-pane] .dap-card[data-wait="done"]')];
			const current = document.querySelector("[data-dsh-activity-pane] .dap-card[data-current]");
			return cards.indexOf(current) === 2 ? true : null;
		});
	});
	await page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const scroll = pane?.querySelector(".dap-scroll");
		const card = scroll?.querySelector(".dap-card[data-current]");
		if (scroll && card) scroll.scrollTop = card.offsetTop;
	});
	const anchorBefore = await currentCardAnchor(page);
	await stepDensity(page, "切换为完整显示", "full", "切换后进入完整呈现");
	// 等渲染落地与锚定补偿执行（queueSync 经 SYNC_MIN_INTERVAL_MS 节流）。
	await page.waitForTimeout(300);
	const anchorAfter = await currentCardAnchor(page);
	assert.ok(
		anchorBefore !== null && anchorAfter !== null && Math.abs(anchorBefore.anchor - anchorAfter.anchor) <= 2,
		`切换前后当前选中卡片顶部相对视口位置稳定（${JSON.stringify(anchorBefore)} → ${JSON.stringify(anchorAfter)}，R-01-021/AC-01）`,
	);

	// R-01-011/AC-07：常态不显示收起方向图标；悬停标题区后于标题区最右端（紧邻工具区
	// 左侧）显现——不挤动工具区按钮，悬停高亮也只落在标题区。
	await page.mouse.move(box.x + box.width / 2, box.y + 200);
	await until("常态收起方向图标不占位", async () => ((await collapseHintState(page))?.visible === false ? true : null));
	const densityBefore = (await densityState(page)).buttonBox;
	await page.hover(".dap-titlebar");
	await until("悬停标题区后收起方向图标显现", async () => ((await collapseHintState(page))?.visible ? true : null));
	const hint = await collapseHintState(page);
	assert.ok(
		hint.gapToTools >= 0 && hint.gapToTools <= 24,
		`收起方向图标位于标题区最右端、紧邻工具区左侧（gap=${Math.round(hint.gapToTools)}px，R-01-011/AC-07）`,
	);
	const densityAfter = (await densityState(page)).buttonBox;
	assert.equal(densityAfter.x, densityBefore.x, "收起方向图标显现不挤动工具区切换按钮（R-01-011/AC-07）");
	const hoverSurface = await page.evaluate(() => ({
		titlebar: getComputedStyle(document.querySelector("[data-dsh-activity-pane] .dap-titlebar")).backgroundColor,
		tools: getComputedStyle(document.querySelector("[data-dsh-activity-pane] .dap-tools")).backgroundColor,
	}));
	assert.notEqual(hoverSurface.titlebar, "rgba(0, 0, 0, 0)", "悬停高亮落在标题区（R-01-011/AC-07）");
	assert.equal(hoverSurface.tools, "rgba(0, 0, 0, 0)", "工具区不参与标题区悬停高亮（R-01-011/AC-07）");

	// R-01-021/AC-05（窄条）：折叠后不显示切换按钮。
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		return b && b.width < 60 && b.height > 60 ? true : null;
	});
	assert.equal((await densityState(page)).buttonHidden, true, "折叠窄条不显示显示档位切换按钮（R-01-021/AC-05）");
}
