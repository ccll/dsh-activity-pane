// R-01-001/AC-03 回归（T-191）：移动 PWA 挂起后壳层 gateway 连接常呈半开死形态——
// 看似 OPEN 却不再有推送，也无 close 事件（壳层连接层无心跳）、无 online 事件（解锁
// 不触发网络状态翻转），sessions.list/sessionStatus 推送永久停滞，卡片运行状态滞留
// 挂起前形态直至整页重载。壳层数据通道不经插件自建 SSE（acks/busy 的回前台重建覆盖
// 不到），窗格在 hidden→visible 边沿且隐藏时长达到阈值时经软依赖 connection.reconnect()
// 请求壳层重建 generation 兜底收敛。
//
// 复现手法：真机「连接死亡无事件」形态在桌面 Chromium 不可复现，本 spec 以机制断言
// 承载——seam（dap-e2e-resume-reconnect-ms）把重建阈值收窄到 1s，经 stub
// document.visibilityState 合成真实 hidden→visible 对（stub 窗口承载真实隐藏时长），
// 断言自愈标记日志出现且出现新的 gateway WebSocket 连接（壳层流世代重建的可观察面）；
// 门控语义以负例钉住（未观测 hidden 边沿不触发、短隐藏低于阈值不触发、同沿 2s 去重
// 不双触发），bfcache 还原（pageshow persisted）的无条件触发以去重窗外的正向用例钉住。

import { openApp, until } from "../helpers.mjs";

const SEAM_THRESHOLD_MS = 1000;
const HEAL_MARKER = "回前台重建壳层连接";
const DEDUPE_WINDOW_MS = 2000;

/** 合成一次「stub visibilityState 的 hidden→visible 对」：stub 窗口承载真实隐藏时长。 */
function syntheticHideRestore(page, hiddenMs) {
	return page.evaluate(
		(duration) =>
			new Promise((resolve) => {
				Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
				document.dispatchEvent(new Event("visibilitychange"));
				setTimeout(() => {
					Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
					document.dispatchEvent(new Event("visibilitychange"));
					resolve();
				}, duration);
			}),
		hiddenMs,
	);
}

/** 合成 bfcache 还原：pageshow 且 persisted=true（Event 构造器不支持 init persisted）。 */
function syntheticBfcacheRestore(page) {
	return page.evaluate(() => {
		const event = new Event("pageshow");
		Object.defineProperty(event, "persisted", { value: true });
		window.dispatchEvent(event);
	});
}

export default async function connectionResume({ page, url, assert }) {
	const selfHealLogs = [];
	const websocketUrls = [];
	page.on("console", (message) => {
		if (message.text().includes(HEAL_MARKER)) selfHealLogs.push(message.text());
	});
	page.on("websocket", (socket) => websocketUrls.push(socket.url()));
	const params = new URLSearchParams({ "dap-e2e-resume-reconnect-ms": String(SEAM_THRESHOLD_MS) });
	await openApp(page, `${url}#${params}`);
	const wsBaseline = websocketUrls.length;

	// 场景 1：未观测 hidden 边沿的 visible 直发不触发重建（前置门控，防合成事件误触发）。
	await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
	await new Promise((resolve) => setTimeout(resolve, 500));
	assert.equal(selfHealLogs.length, 0, "未观测 hidden 边沿的 visible 直发不重建（前置门控）");
	assert.equal(websocketUrls.length, wsBaseline, "场景 1 不产生新连接世代");

	// 场景 2：观测到 hidden 边沿且隐藏 1.2s ≥ seam 阈值 1s → 触发重建（标记 + 新连接世代）。
	await syntheticHideRestore(page, 1200);
	await until("自愈标记随长隐藏恢复出现", async () => (selfHealLogs.length >= 1 ? selfHealLogs : null));
	// 去重负例紧跟标记出现：自愈标记与重建发起同步发出，此刻距首次重建远小于 2s 去重窗口。
	await syntheticBfcacheRestore(page);
	await new Promise((resolve) => setTimeout(resolve, 400));
	assert.equal(selfHealLogs.length, 1, "同恢复沿 2s 去重窗口内不重复重建");
	await until("壳层连接世代随重建推进", async () => (websocketUrls.length > wsBaseline ? websocketUrls : null));
	const wsAfterFirstHeal = websocketUrls.length;

	// 场景 3：观测到 hidden 边沿但隐藏时长（~100ms）低于 seam 阈值 → 不触发（阈值门控）。
	await syntheticHideRestore(page, 100);
	await new Promise((resolve) => setTimeout(resolve, 400));
	assert.equal(selfHealLogs.length, 1, "隐藏时长未达阈值不重建（短切 tab 门控）");
	assert.equal(websocketUrls.length, wsAfterFirstHeal, "短隐藏不产生新连接世代");

	// 场景 4：距首次重建 ≥ 去重窗口（DEDUPE_WINDOW_MS + 余量）的 bfcache pageshow(persisted)
	// 无条件触发重建——正向钉住 pageshow 通道，防「handler 失效但去重负例仍全绿」。
	await new Promise((resolve) => setTimeout(resolve, DEDUPE_WINDOW_MS + 500));
	await syntheticBfcacheRestore(page);
	await until("bfcache 还原无条件触发重建", async () => (selfHealLogs.length >= 2 ? selfHealLogs : null));
	await until("bfcache 重建产生新连接世代", async () => (websocketUrls.length > wsAfterFirstHeal ? websocketUrls : null));
}
