// R-01-001/AC-03 回归：iOS 后台挂起会丢弃在途 setTimeout——T-127 的节流窗口尾与
// 流式派生窗口若在挂起前排队，恢复前台后永不交付，syncScheduled/logDeriveTimer
// 永久滞留，此后一切更新（store 订阅推送、SSE 快照、时钟 tick）被 queueSync 早退
// 吞掉，窗格停留在挂起前状态（会话已完成仍显示运行中）。回前台（visibilitychange/
// pageshow）必须无条件清掉在途 timer 并立即交付一轮渲染，使窗格自愈到最新状态。
//
// 复现手法：包装 setTimeout 吞掉在途 ≤100ms timer 模拟挂起丢弃（SYNC_MIN_INTERVAL_MS
// 节流与派生窗口的共用量级）；借 resize→queueSync 与 rAF 帧交付的确定次序，在帧交付
// 后 30ms（仍在 100ms 节流窗口内）再触发一次 resize，逼出一次节流窗口尾排队并被吞
// ——渲染管线进入与真机挂起一致的滞留态。

import { activityAcks, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const MOBILE_VIEWPORT = { width: 375, height: 700 };

export default async function mobileResume({ page, url, assert }) {
	await page.setViewportSize(MOBILE_VIEWPORT);
	await openApp(page, url);
	await sendHeroMessage(page, "e2e:slow 后台恢复探针");

	// 建立挂起丢弃语义并逼出一次「节流窗口尾排队被吞」。rAF 同帧回调按注册次序执行，
	// 插件的渲染 rAF 先于探针回调，故 resize#2 落在上次渲染交付后 30ms——wait>0，走
	// setTimeout 窗口尾排队，timer 被吞后 syncScheduled 永久滞留。
	await page.evaluate(
		() =>
			new Promise((resolve) => {
				const original = window.setTimeout.bind(window);
				window.__dapDroppedTimers = 0;
				window.__dapSuspended = true;
				window.setTimeout = (fn, ms, ...rest) => {
					if (window.__dapSuspended && typeof ms === "number" && ms > 0 && ms <= 100) {
						window.__dapDroppedTimers += 1;
						return original(() => {}, 2_147_000_000);
					}
					return original(fn, ms, ...rest);
				};
				window.dispatchEvent(new Event("resize"));
				window.requestAnimationFrame(() => {
					original(() => {
						window.dispatchEvent(new Event("resize"));
						original(resolve, 150);
					}, 30);
				});
			}),
	);
	const drops = await page.evaluate(() => window.__dapDroppedTimers);
	assert.ok(drops >= 1, "至少丢弃一次在途 timer（挂起丢弃语义已建立）");

	// 回合在宿主侧收尾——对应真机场景「后台过程中会话完成」。
	await until("回合已在宿主侧结束", async () => {
		const acks = await activityAcks(page);
		return Object.values(acks ?? {}).some((record) => Number(record?.lastTurnEnd) > 0) ? acks : null;
	});

	// 滞留期间窗格停留在旧状态：给足更新窗口后仍不得出现完成呈现。
	await new Promise((resolve) => setTimeout(resolve, 1500));
	const staleText = await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.textContent ?? "");
	assert.ok(!staleText.includes("已完成"), "渲染管线滞留期间窗格停留在旧状态（缺陷复现前置条件）");

	// 回前台：无条件清掉在途 timer 并立即交付一轮渲染，窗格自愈到最新状态。
	await page.evaluate(() => {
		window.__dapSuspended = false;
		document.dispatchEvent(new Event("visibilitychange"));
	});
	const regions = await until("回前台后窗格自愈到最新状态", async () => {
		const current = await paneRegions(page);
		return current !== null && current.active.includes("已完成") ? current : null;
	});
	assert.ok(regions.active.includes("e2e:slow 后台恢复探针"), "自愈后的呈现即会话最新内容");
}
