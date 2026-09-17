// R-01-022/AC-01、R-01-022/AC-02、R-01-022/AC-03
// 仓库入口：标题行最左独立区常显纯图标 GitHub 链接（可访问名称、新标签页打开仓库页），
// 与右侧工具区的档位切换按钮分处标题行两端、无边框（T-139、T-144，悬停提示「报告问题，点赞收藏」，T-145）；
// 激活不进入标题区收起激活路径——不折叠窗格、不改变呈现档位与当前选中会话；折叠窄条不显示。

import { newSessionWithMessage, openApp, until } from "../helpers.mjs";

/** 仓库入口与窗格状态的单次 DOM 观测（不经 locator 自动等待）。 */
function repoState(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const link = pane.querySelector(".dap-header .dap-repo");
		const rect = link?.getBoundingClientRect();
		const titlebar = pane.querySelector(".dap-titlebar")?.getBoundingClientRect();
		return {
			inHeader: !!link,
			href: link?.getAttribute("href") ?? null,
			target: link?.getAttribute("target") ?? null,
			rel: link?.getAttribute("rel") ?? null,
			label: link?.getAttribute("aria-label") ?? null,
			title: link?.getAttribute("title") ?? null,
			borderStyle: link ? getComputedStyle(link).borderTopStyle : null,
			repoX: rect?.x ?? null,
			repoRight: rect ? rect.x + rect.width : null,
			titlebarX: titlebar?.x ?? null,
			titlebarRight: titlebar ? titlebar.x + titlebar.width : null,
			densityX: pane.querySelector(".dap-tools .dap-density")?.getBoundingClientRect().x ?? null,
			collapsed: pane.getAttribute("data-collapsed") === "true",
			density: pane.getAttribute("data-density"),
			currentSessionId: pane.querySelector(".dap-card[data-current]")?.getAttribute("data-session-id") ?? null,
			hidden: !link || getComputedStyle(link).display === "none" || rect.width === 0 || rect.height === 0,
		};
	});
}

export default async function repoEntry({ page, url, assert }) {
	await page.setViewportSize({ width: 1100, height: 600 });
	await openApp(page, url);

	// R-01-022/AC-01：仓库入口常显于标题行最左独立区，指向 GitHub 仓库页、新标签页打开。
	// T-139/T-144/T-145：与档位切换按钮分处标题行两端、无边框，悬停提示「报告问题，点赞收藏」。
	const state = await repoState(page);
	assert.equal(state.inHeader, true, "仓库入口位于标题行左侧独立区（R-01-022/AC-01）");
	assert.equal(state.href, "https://github.com/ccll/dsh-activity-pane", "仓库入口指向 GitHub 仓库页（R-01-022/AC-01）");
	assert.equal(state.target, "_blank", "仓库入口在新标签页打开（R-01-022/AC-01）");
	assert.equal(state.rel, "noreferrer noopener", "仓库入口以 noreferrer noopener 断开引用（R-01-022/AC-01）");
	assert.equal(state.label, "报告问题", "仓库入口提供可访问名称（R-01-022/AC-01）");
	assert.equal(state.title, "报告问题，点赞收藏", "仓库入口悬停提示为「报告问题，点赞收藏」（T-139、T-145）");
	assert.equal(state.borderStyle, "none", "仓库入口无边框、弱化视觉强度（T-139）");
	// T-144「分处标题行两端」量化：仓库入口右缘不越过标题区左缘，档位按钮起点在标题区右缘之外——
	// 两按钮之间隔着整个标题区，触屏点按档位按钮不落仓库入口命中区。
	assert.ok(state.repoRight <= state.titlebarX, "仓库入口位于标题区左侧独立区、不与标题区重叠（T-144）");
	assert.ok(state.densityX > state.titlebarRight, "档位切换按钮在标题区右缘之后、与仓库入口分处两端（T-144）");
	// T-146 接缝对称：仓库入口↔标题区的间隔与标题区↔档位按钮的间隔相等（±2px 抗亚像素抖动），
	// 标题区悬停高亮两侧留白对称、不贴任一按钮。
	assert.ok(
		Math.abs((state.titlebarX - state.repoRight) - (state.densityX - state.titlebarRight)) <= 2,
		"仓库入口与标题区的接缝间距对称于标题区与档位按钮的接缝间距（T-146）",
	);

	// 建一个会话使「当前选中会话」非平凡，AC-02 的不变量才有断言对象。
	await newSessionWithMessage(page, "e2e:fast 仓库入口探针");
	const before = await repoState(page);
	assert.ok(before.currentSessionId !== null, "前置：存在当前选中会话卡片");

	// R-01-022/AC-02：合成 click（不发起导航）不折叠窗格、不改变呈现档位与当前选中会话。
	await page.evaluate(() => {
		document.querySelector("[data-dsh-activity-pane] .dap-repo")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await page.waitForTimeout(300);
	const afterClick = await repoState(page);
	assert.equal(afterClick.collapsed, false, "激活仓库入口不折叠窗格（R-01-022/AC-02）");
	assert.equal(afterClick.density, before.density, "激活仓库入口不改变呈现档位（R-01-022/AC-02）");
	assert.equal(afterClick.currentSessionId, before.currentSessionId, "激活仓库入口不改变当前选中会话（R-01-022/AC-02）");

	// R-01-022/AC-03：折叠为窄条后仓库入口不显示。
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		return b && b.width < 60 && b.height > 60 ? true : null;
	});
	assert.equal((await repoState(page)).hidden, true, "折叠窄条不显示仓库入口（R-01-022/AC-03）");
}
