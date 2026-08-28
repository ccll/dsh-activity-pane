// R-01-014/AC-01、R-01-014/AC-03、R-01-014/AC-06、R-02-003/AC-01
// 同一页面连接世代内：列表 pending→ready 落到真实空态；真实 slow 卡先呈现标题/时间线，model detail 后补齐。

import { dismissNotice, MOCK_MODEL, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const DETAIL_TITLE = "e2e:slow detail 渐进探针";

export default async function loadingReady({ page, url, assert }) {
	await page.addInitScript(({ detailTitle, model }) => {
		window.__dapLoadingEvidence = { active: false, recent: false, count: false, detailWithoutModel: false, detailWithModel: false };
		const inspect = () => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (!pane) return;
			if (pane.querySelector(".dap-list")?.innerText.includes("加载中")) window.__dapLoadingEvidence.active = true;
			if (pane.querySelector(".dap-recent")?.innerText.includes("加载中")) window.__dapLoadingEvidence.recent = true;
			if (pane.querySelector(".dap-count")?.getAttribute("aria-label") === "活动会话计数加载中") window.__dapLoadingEvidence.count = true;
			const card = [...pane.querySelectorAll('[role="button"]')].find((candidate) => candidate.innerText.includes(detailTitle));
			const text = card?.innerText ?? "";
			if (text.includes(detailTitle) && text.includes("用户") && !text.includes(model)) window.__dapLoadingEvidence.detailWithoutModel = true;
			if (window.__dapLoadingEvidence.detailWithoutModel && text.includes(model) && text.includes("High")) window.__dapLoadingEvidence.detailWithModel = true;
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
	}, { detailTitle: DETAIL_TITLE, model: MOCK_MODEL });
	const target = new URL(url);
	const params = new URLSearchParams({ "dap-e2e-list-delay": "500", "dap-e2e-model-delay": "900" });
	target.hash = params.toString();
	await page.goto(target.href, { waitUntil: "networkidle" });
	await dismissNotice(page);

	const ready = await until("列表从 pending 转为 ready 空态", async () => {
		const regions = await paneRegions(page);
		if (!regions || regions.active.includes("加载中") || regions.recent.includes("加载中")) return null;
		return regions.active.includes("暂无活动会话") ? regions : null;
	}, 6_000);
	const listEvidence = await page.evaluate(() => window.__dapLoadingEvidence);
	assert.deepEqual(
		{ active: listEvidence.active, recent: listEvidence.recent, count: listEvidence.count },
		{ active: true, recent: true, count: true },
		"pending 阶段实际呈现双区加载状态与加载中计数",
	);
	assert.ok(ready.active.includes("暂无活动会话"), "ready 空列表显示真实空态，而非继续显示 loading");
	assert.equal((await page.locator("[data-dsh-activity-pane] .dap-count").innerText()).trim(), "0/0", "ready 后数量标识切换为 0/0");
	assert.equal(await page.locator("[data-dsh-activity-pane] .dap-spinner").count(), 0, "ready 后列表级与数量级加载指示均移除");

	await sendHeroMessage(page, DETAIL_TITLE);
	const detailEvidence = await until("卡片先呈现可用内容再补齐 model detail", async () => {
		const value = await page.evaluate(() => window.__dapLoadingEvidence);
		return value.detailWithoutModel && value.detailWithModel ? value : null;
	});
	assert.equal(detailEvidence.detailWithoutModel, true, "真实卡片标题与用户时间线先呈现，不等待 model detail（R-01-014/AC-03）");
	assert.equal(detailEvidence.detailWithModel, true, "同一卡片随后就地补齐 model 与 reasoning（R-01-014/AC-03）");
}
