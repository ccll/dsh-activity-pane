// R-01-022/AC-01、R-01-022/AC-02、R-01-022/AC-03
// 仓库入口：标题行右侧工具区常显纯图标 GitHub 链接（可访问名称、新标签页打开仓库页）；
// 激活不进入标题区收起激活路径、不改变呈现档位与折叠状态；折叠窄条不显示。

import { openApp, until } from "../helpers.mjs";

/** 仓库入口与窗格状态的单次 DOM 观测（不经 locator 自动等待）。 */
function repoState(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const link = pane.querySelector(".dap-tools .dap-repo");
		const rect = link?.getBoundingClientRect();
		return {
			inTools: !!link,
			href: link?.getAttribute("href") ?? null,
			target: link?.getAttribute("target") ?? null,
			rel: link?.getAttribute("rel") ?? null,
			label: link?.getAttribute("aria-label") ?? null,
			collapsed: pane.getAttribute("data-collapsed") === "true",
			density: pane.getAttribute("data-density"),
			hidden: !link || getComputedStyle(link).display === "none" || rect.width === 0 || rect.height === 0,
		};
	});
}

export default async function repoEntry({ page, url, assert }) {
	await page.setViewportSize({ width: 1100, height: 600 });
	await openApp(page, url);

	// R-01-022/AC-01：仓库入口常显于标题行右侧工具区，指向 GitHub 仓库页、新标签页打开。
	const state = await repoState(page);
	assert.equal(state.inTools, true, "仓库入口位于标题行右侧工具区（R-01-022/AC-01）");
	assert.equal(state.href, "https://github.com/ccll/dsh-activity-pane", "仓库入口指向 GitHub 仓库页（R-01-022/AC-01）");
	assert.equal(state.target, "_blank", "仓库入口在新标签页打开（R-01-022/AC-01）");
	assert.equal(state.rel, "noreferrer noopener", "仓库入口以 noreferrer noopener 断开引用（R-01-022/AC-01）");
	assert.equal(state.label, "打开 GitHub 仓库", "仓库入口提供可访问名称（R-01-022/AC-01）");

	// R-01-022/AC-02：合成 click（不发起导航）不折叠窗格、不改变呈现档位。
	await page.evaluate(() => {
		document.querySelector("[data-dsh-activity-pane] .dap-repo")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await page.waitForTimeout(300);
	const afterClick = await repoState(page);
	assert.equal(afterClick.collapsed, false, "激活仓库入口不折叠窗格（R-01-022/AC-02）");
	assert.equal(afterClick.density, "medium", "激活仓库入口不改变呈现档位（R-01-022/AC-02）");

	// R-01-022/AC-03：折叠为窄条后仓库入口不显示。
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await until("折叠为窄条", async () => {
		const candidate = page.getByRole("button", { name: /活动会话/ }).last();
		const b = await candidate.boundingBox().catch(() => null);
		return b && b.width < 60 && b.height > 60 ? true : null;
	});
	assert.equal((await repoState(page)).hidden, true, "折叠窄条不显示仓库入口（R-01-022/AC-03）");
}
