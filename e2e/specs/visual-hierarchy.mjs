// R-01-006/AC-03、AC-04、AC-05、AC-06、R-01-002/AC-04
// 当前会话前台/后台态与视觉优先级：前台态为窗格最高视觉层（1.5px 外环 + 16px 光晕 +
// 内发光），等待提醒卡降权（描边 ≤40%、外环 22%、底色向卡片底色收窄），全局面板在屏时
// 当前卡转后台态（保留蓝色、明显弱于前台态），激活当前卡一次即关闭面板并恢复前台态，
// 经原生侧栏返回会话同样恢复（C-104）。
//
// 断言读 computed style 的描边 alpha、外环宽度与光晕半径做数值比较，不依赖截图目测；
// 面板/会话判别沿用 desktop-layout 的 entry tag 与滚动区判据（不依赖宿主版本）。

import { ensureFullDensity, openApp, newSessionWithMessage, sendHeroMessage, sessionComposer, until } from "../helpers.mjs";

const TITLE_A = "e2e:fast 视觉层级后台卡";
const TITLE_B = "e2e:fast 视觉层级前台卡";

/** 从 computed color 取 alpha：兼容 rgba()、rgb() 与 color(srgb … / a)、oklch(… / a)
 *  （Chromium 把 color-mix 结果序列化为现代 color 函数；无 alpha 分量视为 1）。 */
const borderAlpha = (color) => {
	const inner = /\(([^()]*)\)\s*$/.exec(String(color ?? ""))?.[1];
	if (inner === undefined) return null;
	const slash = inner.split("/");
	if (slash.length === 2) {
		const value = Number(slash[1].trim());
		return Number.isFinite(value) ? value : null;
	}
	const comma = inner.split(",").map((part) => part.trim());
	if (comma.length === 4) {
		const value = Number(comma[3]);
		return Number.isFinite(value) ? value : null;
	}
	return 1;
};

/** 从 computed color 取 sRGB 0–255 三通道：兼容 rgb()/rgba() 与现代 color(srgb …)。 */
const channelsOf = (color) => {
	const inner = /\(([^()]*)\)\s*$/.exec(String(color ?? ""))?.[1];
	if (inner === undefined) return null;
	if (/^\s*srgb\b/.test(inner)) {
		const parts = inner.replace(/^srgb/, "").split("/")[0].trim().split(/\s+/).map(Number);
		return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)
			? parts.slice(0, 3).map((value) => value * 255)
			: null;
	}
	const comma = inner.split(",").map((part) => Number(part.trim()));
	return comma.length >= 3 && comma.slice(0, 3).every(Number.isFinite) ? comma.slice(0, 3) : null;
};

/** 断言 box-shadow 含指定长度的外环/光晕（computed 值已把 color-mix 解析为 rgba）。 */
const shadowHas = (shadow, token) => typeof shadow === "string" && shadow.includes(token);

/** computed box-shadow 中「0 0 0 Npx」外环的宽度（无外环为 0）。 */
const ringWidthOf = (shadow) => Number(/0px 0px 0px ([\d.]+)px/.exec(String(shadow ?? ""))?.[1] ?? 0);

/** computed box-shadow 中「0 0 Npx」外光晕的半径（无此类光晕为 0；不含 inset）。 */
const glowRadiusOf = (shadow) => Number(/0px 0px ([\d.]+)px 0px(?! inset)/.exec(String(shadow ?? ""))?.[1] ?? 0);

/** 按窗格密度控件循环到指定档位。 */
const setDensity = async (page, level) => {
	await until(`档位切到 ${level}`, async () => {
		const density = await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.getAttribute("data-density"));
		if (density === level) return true;
		await page.evaluate(() => document.querySelector("[data-dsh-activity-pane] .dap-density")?.click());
		return null;
	}, 10_000);
};

export default async function visualHierarchy({ page, url, assert }) {
	await openApp(page, url);
	// 深浅主题分别校验：先固定深色主题（宿主默认可能为浅色）。
	await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));
	await ensureFullDensity(page);

	// 会话 A：完成一轮 → 完成提醒卡（非当前会话，绿色降权卡）。
	await sendHeroMessage(page, TITLE_A);
	await until("会话 A 进入完成提醒", async () => {
		const done = await page.evaluate((title) =>
			[...document.querySelectorAll('[data-dsh-activity-pane] .dap-card[data-wait="done"]')]
				.some((card) => card.innerText.includes(title)), TITLE_A);
		return done ? true : null;
	});

	// 会话 B：新建并完成一轮 → 成为当前会话且同为完成提醒卡（蓝环须压过已降权的绿底）。
	await newSessionWithMessage(page, TITLE_B);
	await until("会话 B 进入完成提醒且成为当前会话", async () => {
		const state = await page.evaluate((title) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			const card = pane?.querySelector(".dap-card[data-current]") ?? null;
			return card !== null && card.innerText.includes(title) && card.getAttribute("data-wait") === "done";
		}, TITLE_B);
		return state ? true : null;
	});

	const visual = () =>
		page.evaluate(({ a, b }) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (!pane) return null;
			const byTitle = (title) =>
				[...pane.querySelectorAll(".dap-card")].find((card) => card.innerText.includes(title)) ?? null;
			const read = (el) => {
				if (!el) return null;
				const style = getComputedStyle(el);
				return {
					current: el.hasAttribute("data-current"),
					foreground: el.hasAttribute("data-foreground"),
					wait: el.getAttribute("data-wait"),
					border: style.borderTopColor,
					shadow: style.boxShadow,
					background: style.backgroundColor,
				};
			};
			const cards = [...pane.querySelectorAll(".dap-card")];
			return {
				current: read(pane.querySelector(".dap-card[data-current]")),
				a: read(byTitle(a)),
				b: read(byTitle(b)),
				count: cards.length,
			};
		}, { a: TITLE_A, b: TITLE_B });

	// R-01-006/AC-06：前台态为最高视觉层——1.5px 外环、16px 光晕、内发光，描边近满强度。
	const foreground = await until("当前会话处于前台态", async () => {
		const state = await visual();
		return state?.current?.foreground === true ? state : null;
	});
	assert.equal(foreground.current.current, true, "前台态卡片同时是选中会话");
	assert.ok(
		borderAlpha(foreground.current.border) >= 0.85,
		`前台态描边接近满强度（实际 alpha=${borderAlpha(foreground.current.border)}，color=${foreground.current.border}）`,
	);
	assert.ok(shadowHas(foreground.current.shadow, "1.5px"), `前台态外环 1.5px（实际 ${foreground.current.shadow}）`);
	assert.ok(shadowHas(foreground.current.shadow, "16px"), "前台态外环光晕 16px");
	assert.ok(shadowHas(foreground.current.shadow, "inset"), "前台态带内发光");

	// R-01-002/AC-04、R-01-006/AC-06：完成提醒卡降权——描边与光晕均弱于前台态，底色只留色偏。
	assert.ok(foreground.a, "会话 A 的完成提醒卡仍在窗格（非同屏比较不能成立）");
	assert.ok(
		borderAlpha(foreground.a.border) <= 0.4,
		`完成提醒卡描边不高于 40%（实际 alpha=${borderAlpha(foreground.a.border)}）`,
	);
	assert.ok(
		borderAlpha(foreground.a.border) < borderAlpha(foreground.current.border),
		"完成提醒卡描边明显弱于当前会话前台态",
	);
	assert.ok(!shadowHas(foreground.a.shadow, "1.5px"), "完成提醒卡外环不采用前台态 1.5px");
	assert.ok(!shadowHas(foreground.a.shadow, "inset"), "完成提醒卡无内发光");
	const doneChannels = channelsOf(foreground.a.background);
	assert.ok(doneChannels, `完成提醒卡底色可解析（实际 ${foreground.a.background}）`);
	assert.ok(
		doneChannels[1] - Math.max(doneChannels[0], doneChannels[2]) <= 6,
		`完成提醒卡底色仅保留轻微绿色色偏（rgb=${doneChannels.map((value) => Math.round(value)).join(",")}）`,
	);
	// AC-06 三项数值比较：外环宽度、光晕半径、描边不透明度均须前台态更大。
	const foregroundRing = ringWidthOf(foreground.current.shadow);
	const doneRing = ringWidthOf(foreground.a.shadow);
	const foregroundGlow = glowRadiusOf(foreground.current.shadow);
	const doneGlow = glowRadiusOf(foreground.a.shadow);
	assert.ok(foregroundRing >= 1.5 && foregroundRing > doneRing, `前台态外环宽于完成卡（${foregroundRing} vs ${doneRing}）`);
	assert.ok(foregroundGlow >= 16 && foregroundGlow > doneGlow, `前台态光晕半径大于完成卡（${foregroundGlow} vs ${doneGlow}）`);
	assert.ok(
		borderAlpha(foreground.current.border) > borderAlpha(foreground.a.border),
		"前台态描边不透明度高于完成卡",
	);
	const currentBorder = channelsOf(foreground.current.border);
	assert.ok(currentBorder, `前台态描边色可解析（${foreground.current.border}）`);
	assert.ok(
		[143, 188, 255].every((value, index) => Math.abs(currentBorder[index] - value) <= 3),
		`深色前台态取 #8fbcff（实际 ${currentBorder.map((value) => Math.round(value)).join(",")}）`,
	);
	// AC-06 底色子句：前台态卡面保持活动卡基色，等待卡只许轻微色偏（禁止整卡铺色）。
	const currentChannels = channelsOf(foreground.current.background);
	assert.ok(currentChannels, `前台态底色可解析（${foreground.current.background}）`);
	const fillDelta = doneChannels.slice(0, 3).map((value, index) => Math.abs(value - currentChannels[index]));
	assert.ok(Math.max(...fillDelta) <= 16, `完成卡底色相对当前卡基色仅轻微色偏（Δ=${fillDelta.map((value) => Math.round(value)).join("/")}）`);

	// R-01-006/AC-03：切到全局面板——当前卡仍选中但转后台态，蓝色可辨、弱于前台态。
	await page.getByRole("button", { name: "Plugins", exact: true }).first().click();
	const background = await until("当前会话转为后台态", async () => {
		const state = await visual();
		if (state?.current === null || state.current.current !== true || state.current.foreground !== false) return null;
		// 卡片无 transition；仍用 until 规避属性写入与样式刷新同帧的读取差。
		return borderAlpha(state.current.border) <= 0.34 ? state : null;
	});
	assert.ok(
		borderAlpha(background.current.border) <= 0.34,
		`后台态描边显著低于前台态（实际 alpha=${borderAlpha(background.current.border)}）`,
	);
	assert.ok(
		borderAlpha(background.current.border) < borderAlpha(background.a.border),
		`后台态不强于同屏等待提醒卡（后台 ${borderAlpha(background.current.border)} vs 完成卡 ${borderAlpha(background.a.border)}）`,
	);
	assert.ok(
		borderAlpha(background.current.border) < borderAlpha(foreground.current.border),
		"后台态描边低于前台态",
	);
	assert.ok(shadowHas(background.current.shadow, "10px"), "后台态光晕收小到 10px");
	assert.ok(!shadowHas(background.current.shadow, "inset"), "后台态不保留内发光");
	assert.ok(
		background.count === foreground.count,
		`页面切换不改变窗格卡片集合（前后 ${foreground.count}/${background.count}）`,
	);

	// R-01-006/AC-04：面板页激活当前卡——一次激活即关闭面板、显示会话并恢复前台态。
	await page.locator("[data-dsh-activity-pane] .dap-card[data-current]").click();
	const restored = await until("激活当前卡回到会话并恢复前台态", async () => {
		const state = await visual();
		if (state?.current?.foreground !== true) return null;
		if (borderAlpha(state.current.border) < 0.85) return null;
		if ((await sessionComposer(page).count()) === 0) return null;
		return state;
	});
	assert.ok(
		borderAlpha(restored.current.border) >= 0.85,
		`回前台后描边恢复满强度（实际 alpha=${borderAlpha(restored.current.border)}）`,
	);
	assert.ok(shadowHas(restored.current.shadow, "16px") && shadowHas(restored.current.shadow, "inset"), "回前台后外环与内发光恢复");

	// R-01-006/AC-06 档位无关：紧凑档前台态仍保留外环与内发光（视觉规则不按档位分叉）。
	await setDensity(page, "compact");
	const compact = await until("紧凑档保持前台态光效", async () => {
		const state = await visual();
		return state?.current?.foreground === true && ringWidthOf(state.current.shadow) >= 1.5 ? state : null;
	});
	assert.ok(shadowHas(compact.current.shadow, "inset"), "紧凑档前台态同样带内发光");
	await setDensity(page, "full");

	// R-01-006/AC-05：再次切到面板后经原生侧栏返回会话——当前卡不依赖自身激活即恢复前台态。
	await page.getByRole("button", { name: "Plugins", exact: true }).first().click();
	await until("再次进入全局面板", async () => {
		const state = await visual();
		return state?.current?.foreground === false && borderAlpha(state.current.border) <= 0.34 ? true : null;
	});
	// 只点原生侧栏的会话行：标题取自当前卡的 .dap-title（会话标题，不是 prompt），
	// 且锚定在外壳 sidebar.workspaces 槽位内，避免落到窗格卡片自身的 AC-04 路径。
	const currentTitle = (await page.locator("[data-dsh-activity-pane] .dap-card[data-current] .dap-title").innerText()).trim();
	const sidebarRow = page.locator('[data-slot="sidebar.workspaces"]').getByText(currentTitle, { exact: true }).first();
	assert.ok((await sidebarRow.count()) > 0, "原生侧栏存在当前会话行（非窗格标题）");
	await sidebarRow.click();
	const sidebarReturn = await until("经原生侧栏返回后恢复前台态", async () => {
		const state = await visual();
		if (state?.current?.foreground !== true) return null;
		if (borderAlpha(state.current.border) < 0.85) return null;
		return (await sessionComposer(page).count()) > 0 ? state : null;
	});
	assert.ok(
		borderAlpha(sidebarReturn.current.border) >= 0.85,
		`侧栏返回后当前卡恢复前台态描边（实际 alpha=${borderAlpha(sidebarReturn.current.border)}）`,
	);

	// R-01-006/AC-06 浅色主题：前台态取深档蓝（#2f7cf6）且描边仍高于等待提醒卡；
	// 完成提醒卡底色向白收（绿通道偏差不超过轻微色偏）。
	await page.evaluate(() => document.body.removeAttribute("data-ds-dark-theme"));
	const light = await until("浅色主题前台态生效", async () => {
		const state = await visual();
		return state?.current?.foreground === true && borderAlpha(state.current.border) >= 0.8 ? state : null;
	});
	assert.ok(
		borderAlpha(light.current.border) >= 0.8,
		`浅色前台态描边接近满强度（实际 alpha=${borderAlpha(light.current.border)}，color=${light.current.border}）`,
	);
	assert.ok(
		borderAlpha(light.a.border) < borderAlpha(light.current.border),
		"浅色下完成提醒卡描边仍弱于当前会话前台态",
	);
	const lightBorder = channelsOf(light.current.border);
	assert.ok(lightBorder, `浅色前台态描边色可解析（${light.current.border}）`);
	assert.ok(
		[47, 124, 246].every((value, index) => Math.abs(lightBorder[index] - value) <= 3),
		`浅色前台态取深档蓝 #2f7cf6（实际 ${lightBorder.map((value) => Math.round(value)).join(",")}）`,
	);
	const lightDone = channelsOf(light.a.background);
	assert.ok(lightDone, `浅色完成提醒卡底色可解析（实际 ${light.a.background}）`);
	assert.ok(
		lightDone[1] - Math.max(lightDone[0], lightDone[2]) <= 8,
		`浅色完成提醒卡底色向白收、仅保留轻微绿色色偏（rgb=${lightDone.map((value) => Math.round(value)).join(",")}）`,
	);
	// R-01-006/AC-03 浅色后台态：描边 30%，仍低于完成提醒卡（34%）。
	await page.getByRole("button", { name: "Plugins", exact: true }).first().click();
	const lightBackground = await until("浅色后台态生效", async () => {
		const state = await visual();
		return state?.current?.foreground === false && borderAlpha(state.current.border) <= 0.3 ? state : null;
	});
	assert.ok(
		borderAlpha(lightBackground.current.border) < borderAlpha(lightBackground.a.border),
		"浅色后台态描边仍低于完成提醒卡",
	);
	await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));
}
