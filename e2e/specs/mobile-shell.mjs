// R-01-008/AC-04（真移动壳层代差回归，T-171）：隔离环境按 spec 声明另装
// dsh-web-mobile 手机壳层，以移动视口（390×844）+ 触屏 + 移动 UA 验证两类
// 壳层代差回归：
// ① hero 空白会话页：壳层以 display:none 隐藏空 header（其设计为「抽屉入口
//    即 ⊡」），开关不得嵌入被隐藏的 header 连带不可见——应回落 hero 贴靠
//    形态，落在壳层 ⊡ 右侧 8px 并垂直居中（0.1.5 时代同款几何）。
// ② active 会话页：壳层把 header 左座（left:8）留给自己的目录开关
//    （button[data-mobile-nav="toggle"]，absolute 定位）；开关应避开该座位、
//    落在真标题行（会话头槽首行）行首，与壳层开关及其余可交互元素无叠置，
//    且两个开关各自只开自己的抽屉。
// 桌面壳层窄视口行为由 mobile-drawer 覆盖；壳层目录开关自身行为非本插件
// 契约，仅作刺激源与前提断言。真机触感与软键盘行为保留人工验收。

import { devices } from "playwright";
import { dismissNotice, openApp, paneBox, sendHeroMessage, until } from "../helpers.mjs";

export const mobileShell = true;
export const contextOptions = devices["iPhone 13"];

// 沿父链查 display:none（几何判定规约，T-171）：开关不得挂在被隐藏的祖先链上。
const hiddenByDisplayNone = (page, selector) => page.evaluate((selector) => {
	let node = document.querySelector(selector);
	for (; node !== null && node !== document.body; node = node.parentElement) {
		if (getComputedStyle(node).display === "none") return true;
	}
	return false;
}, selector);

// 宿主 frame：壳层抽屉状态机本体（[data-shell-overlay] 的 parentElement）。
const drawerState = (page) => page.evaluate(() => {
	const frame = document.querySelector("[data-shell-overlay]")?.parentElement;
	return frame == null ? null : frame.hasAttribute("data-sidebar-collapsed");
});

export default async function mobileShellSpec({ page, url, assert }) {
	await openApp(page, url);
	// 0.2.0 的 Preview Notice 可晚于 openApp 的 dismiss 轮询挂载（boot 装壳层拉长
	// 启动链路）；首轮交互前循环清遮罩，避免模态吞掉开关点击（环境噪声）。
	await until("首跑公告遮罩清除", async () => {
		await dismissNotice(page);
		return page.evaluate(() =>
			![...document.querySelectorAll("div")].some((el) => String(el.className).includes("_mask_")) ? true : null);
	}, 20_000);

	// hero：壳层以 display:none 隐藏空 header；开关必须不在该隐藏链内，
	// 且按贴靠算式落在壳层 ⊡ 右侧 8px、垂直居中（AC-04 hero 分支）。
	const hero = await until("hero 态壳层 ⊡ 与开关状态", () =>
		page.evaluate(() => {
			const fab = document.querySelector('button[data-mobile-nav="fab"]');
			const toggle = document.querySelector(".dap-toggle");
			if (!fab || !toggle) return null;
			const fr = fab.getBoundingClientRect();
			const tr = toggle.getBoundingClientRect();
			if (fr.width === 0 || tr.width === 0) return null;
			const header = document.querySelector('#root [data-slot="main"] header');
			const headerRect = header?.getBoundingClientRect() ?? null;
			return {
				fab: [fr.x, fr.y, fr.width, fr.height],
				toggle: [tr.x, tr.y, tr.width, tr.height],
				inHeader: header?.contains(toggle) ?? false,
				headerHidden: header === null || getComputedStyle(header).display === "none" ||
					(headerRect !== null && headerRect.width === 0 && headerRect.height === 0),
			};
		}));
	assert.ok(hero.fab[2] > 0 && hero.fab[0] > -10, `壳层 hero ⊡ 在屏（壳层前提，实测 [${hero.fab.map(Math.round)}]）`);
	const heroHidden = await hiddenByDisplayNone(page, ".dap-toggle");
	assert.equal(heroHidden, false, "hero 开关可见（不随壳层隐藏的空 header 连带隐藏，壳层代差回归 T-171）");
	if (hero.headerHidden) {
		assert.equal(hero.inHeader, false, "hero 开关不落入被隐藏 header（壳层代差回归 T-171）");
		const [fx, fy, fw, fh] = hero.fab;
		const [tx, ty, tw, th] = hero.toggle;
		assert.ok(
			Math.abs(tx - Math.round(fx + fw + 8)) <= 2 && Math.abs(ty - Math.round(fy + (fh - th) / 2)) <= 2,
			`hero 开关贴靠 ⊡ 右侧 8px 垂直居中（开关 [${[tx, ty].map(Math.round)}] vs ⊡ [${[fx, fy, fw, fh].map(Math.round)}]，R-01-008/AC-04）`,
		);
	} else {
		// 壳层不再隐藏 hero header 时的兜底：贴靠分支退场，开关应回归嵌入形态。
		assert.equal(hero.inHeader, true, "hero header 可见时开关嵌入 header（壳层改版兜底，T-171）");
	}

	// hero 态开关可操作：点击展开插件抽屉后收起还原（AC-01）。
	await page.locator(".dap-toggle").click();
	await until("hero 态开关展开抽屉", async () => {
		const box = await paneBox(page);
		return box && box.x >= -1 ? box : null;
	});
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("hero 态抽屉收起还原", async () => {
		const box = await paneBox(page);
		return box && box.x + box.width <= 1 ? true : null;
	});

	// active：壳层左座开关在场（前提）；窗格开关可见、位于其右侧、落在会话头
	// 标题行槽内、与全部可交互元素无叠置。
	await sendHeroMessage(page, "e2e:shell 移动壳层探针");
	const active = await until("active 态双开关几何", () =>
		page.evaluate(() => {
			const shellToggle = [...document.querySelectorAll('button[data-mobile-nav="toggle"]')]
				.find((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.x > -10;
				});
			const toggle = document.querySelector(".dap-toggle");
			if (!shellToggle || !toggle) return null;
			const sr = shellToggle.getBoundingClientRect();
			const tr = toggle.getBoundingClientRect();
			const overlapped = [...document.querySelectorAll("button, [role='button'], a, input, textarea, select")]
				.filter((el) => el !== toggle && el !== shellToggle && !toggle.contains(el) && !el.contains(toggle))
				.some((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0 &&
						r.left < tr.right && r.right > tr.left && r.top < tr.bottom && r.bottom > tr.top;
				});
			return {
				shell: [sr.x, sr.y, sr.width, sr.height],
				toggle: [tr.x, tr.y, tr.width, tr.height],
				overlapped,
				inSessionSlot: toggle.closest('[data-slot="conversation.session.header"]') !== null,
			};
		}));
	assert.ok(active.shell[2] > 0, `壳层左座目录开关在屏（壳层前提，实测 [${active.shell.map(Math.round)}]）`);
	const activeHidden = await hiddenByDisplayNone(page, ".dap-toggle");
	assert.equal(activeHidden, false, "active 开关可见（壳层代差回归 T-171）");
	assert.equal(active.inSessionSlot, true, "active 开关嵌入会话头标题行槽（真标题行行首，R-01-008/AC-04）");
	assert.ok(
		active.toggle[0] >= active.shell[0] + active.shell[2] - 0.5,
		`开关位于壳层左座开关右侧（开关 x=${active.toggle[0]} ≥ 壳层开关右缘 ${active.shell[0] + active.shell[2]}，R-01-008/AC-04）`,
	);
	assert.equal(active.overlapped, false, "active 开关不与任何可交互元素叠置（含壳层左座开关，T-171）");
	assert.ok(
		Math.abs(active.toggle[3] - 38) <= 1 && active.toggle[2] >= 44,
		`入口命中盒至少 44×38px（实测 ${active.toggle[2]}×${active.toggle[3]}，R-01-008/AC-07）`,
	);

	// 点窗格开关只开插件抽屉，不误开宿主抽屉（壳层左座冲突回归）。
	const collapsedBefore = await drawerState(page);
	await page.locator(".dap-toggle").click();
	await until("窗格开关展开插件抽屉", async () => {
		const box = await paneBox(page);
		return box && box.x >= -1 ? box : null;
	});
	const collapsedAfterPane = await drawerState(page);
	assert.equal(collapsedBefore, collapsedAfterPane, "点击窗格开关不改变宿主抽屉状态（frame 抽屉属性保持）");
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("窗格抽屉收起还原", async () => {
		const box = await paneBox(page);
		return box && box.x + box.width <= 1 ? true : null;
	});

	// 点壳层左座开关开宿主抽屉，不误开窗格。
	await page.locator('button[data-mobile-nav="toggle"]').click();
	await until("壳层开关展开宿主抽屉", async () => (await drawerState(page)) === false);
	const paneStillClosed = await page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const rect = pane.getBoundingClientRect();
		return rect.x + rect.width <= 1 ? true : null;
	});
	assert.ok(paneStillClosed, "壳层开关不误开插件抽屉（双开关职责分离）");
}
