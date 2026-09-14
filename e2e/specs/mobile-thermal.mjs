// T-127 移动端常驻功耗收敛回归（无 AC 锚点；达标类性能优化，PRD 不变）：
// 移动视口下抽屉关闭即屏外休眠（content-visibility: hidden），流式回合期间渲染
// 频率被 SYNC_MIN_INTERVAL_MS 节流硬顶；屏外休眠不冻结数据，打开抽屉即见最新呈现。

import { openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const MOBILE_VIEWPORT = { width: 375, height: 700 };
const WINDOW_MS = 5_000;
/** 节流上限 10Hz（5s ≤ 50 次插件渲染请求）+ 宿主自身与偶发合法重绘余量。
 *  无节流直通时渲染请求随事件率与刷新率（headless 60Hz）放大，无法压到该线内。 */
const MAX_RAF_REQUESTS = 80;

async function drawerClosedComputedVisibility(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		return getComputedStyle(pane).contentVisibility;
	});
}

export default async function mobileThermal({ page, url, assert }) {
	await page.setViewportSize(MOBILE_VIEWPORT);
	await openApp(page, url);
	// 初始未点过开关（data-open 缺省视同关闭）：抽屉屏外且子树休眠。
	assert.equal(
		await drawerClosedComputedVisibility(page),
		"hidden",
		"移动端抽屉关闭时 pane 子树屏外休眠（content-visibility: hidden）",
	);

	await sendHeroMessage(page, "e2e:slow 节流探针");
	// e2e:slow ≈24 块 × 150ms ≈ 3.6s：计量窗覆盖流式尾段与回合收尾渲染。
	const rafRequests = await page.evaluate((durationMs) => new Promise((resolve) => {
		let count = 0;
		const original = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (callback) => {
			count += 1;
			return original((time) => callback(time));
		};
		setTimeout(() => resolve(count), durationMs);
	}), WINDOW_MS);
	assert.ok(
		rafRequests <= MAX_RAF_REQUESTS,
		`流式回合 ${WINDOW_MS / 1000}s 内 rAF 请求 ${rafRequests} 次超过节流阈值 ${MAX_RAF_REQUESTS}——渲染频率未被硬顶`,
	);
	console.log(`mobile-thermal: 流式回合 ${WINDOW_MS / 1000}s rAF 请求 ${rafRequests} 次（阈值 ${MAX_RAF_REQUESTS}）`);

	// 屏外休眠只跳过渲染，不冻结数据：textContent 不依赖布局，隐藏期仍应反映最新
	// 状态（回合已完成、完成提醒成立）；innerText 在 content-visibility:hidden 下为空。
	await until("休眠期数据持续更新", async () => {
		const text = await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.textContent ?? "");
		return text.includes("e2e:slow 节流探针") && text.includes("已完成") ? text : null;
	});
	// 打开抽屉：滑入后内容即最新呈现。
	await page.getByRole("button", { name: "切换活动会话窗格" }).click();
	await until("抽屉展开且内容最新", async () => {
		const regions = await paneRegions(page);
		return regions !== null && regions.active.includes("e2e:slow 节流探针") && regions.active.includes("已完成") ? regions : null;
	});
	// 打开后 data-open="true"，休眠解除。
	assert.equal(
		await drawerClosedComputedVisibility(page),
		"visible",
		"抽屉打开后 content-visibility 恢复 visible",
	);
}
