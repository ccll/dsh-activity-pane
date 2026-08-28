// R-01-014/AC-01、R-01-014/AC-06、R-02-003/AC-01
// 同一页面连接世代内，列表 pending 时活动区/历史区/数量标识呈现 loading；ready 后落到真实空态与 0/0。

import { dismissNotice, paneRegions, until } from "../helpers.mjs";

export default async function loadingReady({ page, url, assert }) {
	await page.addInitScript(() => {
		window.__dapLoadingEvidence = { active: false, recent: false, count: false };
		const inspect = () => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (!pane) return;
			if (pane.querySelector(".dap-list")?.innerText.includes("加载中")) window.__dapLoadingEvidence.active = true;
			if (pane.querySelector(".dap-recent")?.innerText.includes("加载中")) window.__dapLoadingEvidence.recent = true;
			if (pane.querySelector(".dap-count")?.getAttribute("aria-label") === "活动会话计数加载中") window.__dapLoadingEvidence.count = true;
		};
		const observe = () => {
			new MutationObserver(inspect).observe(document.documentElement, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
				attributeFilter: ["aria-label"],
			});
			inspect();
		};
		if (document.documentElement) observe();
		else document.addEventListener("DOMContentLoaded", observe, { once: true });
	});
	const target = new URL(url);
	target.hash = "dap-e2e-list-delay=500";
	await page.goto(target.href, { waitUntil: "networkidle" });
	await dismissNotice(page);

	const ready = await until("列表从 pending 转为 ready 空态", async () => {
		const regions = await paneRegions(page);
		if (!regions || regions.active.includes("加载中") || regions.recent.includes("加载中")) return null;
		return regions.active.includes("暂无活动会话") ? regions : null;
	}, 6_000);
	const evidence = await page.evaluate(() => window.__dapLoadingEvidence);
	assert.deepEqual(evidence, { active: true, recent: true, count: true }, "pending 阶段实际呈现双区加载状态与加载中计数");
	assert.ok(ready.active.includes("暂无活动会话"), "ready 空列表显示真实空态，而非继续显示 loading");
	assert.equal((await page.locator("[data-dsh-activity-pane] .dap-count").innerText()).trim(), "0/0", "ready 后数量标识切换为 0/0");
	assert.equal(await page.locator("[data-dsh-activity-pane] .dap-spinner").count(), 0, "ready 后列表级与数量级加载指示均移除");
}
