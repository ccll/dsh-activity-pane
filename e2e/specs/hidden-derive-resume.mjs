// T-181 ③b 回归：隐藏页延迟派生的回前台补齐。
// 场景：页面在回合开始前转入插件可见性门控的隐藏态（自门控读 document.hidden，
// 此处经 defineProperty 模拟——不依赖浏览器真实生命周期事件），slow 剧本整回合
// 在隐藏期流式并收尾：流式派生折叠全程停摆（detail.history 不更新），会话状态面
// 照常把卡片翻到完成提醒（状态路径不经被门控的派生）。回前台（恢复 hidden=false
// 并派发 visibilitychange）后 resumeRenderPipeline 按最新日志窗口一次补齐派生。
// 断言：隐藏期时间线不含落定尾行（门控确实拦截）；回前台后时间线补齐落定态
// （延迟派生不丢数据、补齐路径工作）。
// 量化说明：隐藏期烧核消除的绝对量不经本 spec 承载（模拟隐藏与真实隐藏页的
// rAF/定时器口径不同），由 T-181 终态记录的运行时实测对照承载。

import { ensureFullDensity, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

/** slow 剧本落定尾行（24 块流式的最后一片，回合收尾后进入助手行全文）。 */
const SETTLED_ROW = "慢速输出片段 24/24。";

async function setPaneHidden(page, hidden) {
	await page.evaluate((hidden) => {
		Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
		document.dispatchEvent(new Event("visibilitychange"));
	}, hidden);
}

export default async function hiddenDeriveResume({ page, url, assert }) {
	await openApp(page, url);
	await ensureFullDensity(page);
	// 先转隐藏再发起回合：整回合事件流都落在隐藏期，延迟派生的拦截判定确定性成立。
	await setPaneHidden(page, true);
	await sendHeroMessage(page, "e2e:slow 隐藏派生补齐探针");
	// 回合在隐藏期收尾：完成提醒由状态面驱动翻牌（不经被门控的派生路径）。
	await until("隐藏期回合收尾显示完成提醒", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes("已完成") ? regions : null;
	}, 30_000);
	const staleRegions = await paneRegions(page);
	assert.ok(
		!staleRegions.active.includes(SETTLED_ROW),
		"隐藏期时间线不含落定尾行（延迟派生在隐藏期确实停摆）",
	);
	// 回前台：resumeRenderPipeline 对 pending 详情按最新日志窗口一次补齐。
	await setPaneHidden(page, false);
	await until("回前台后时间线补齐落定尾行", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(SETTLED_ROW) ? regions : null;
	}, 15_000);
	assert.ok(true, "隐藏期停摆→回前台补齐全链路成立（延迟派生不丢数据）");
}
