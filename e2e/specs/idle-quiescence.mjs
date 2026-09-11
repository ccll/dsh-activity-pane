// 缺陷回归（无 AC 锚点；短路缺陷修复）：空闲期活动窗格静默。
// 缺陷：render 在签名闸口前对每个可见主会话调用 loadDirectoryOnce，而其 modelLoads
// 守卫在 load settle 后即释放，目录 store 每次都以新引用广播 → queueSync → render，
// 以显示器刷新率（60/120fps）永久循环。实测空闲期 rAF 60/s、样式重算 60/s，
// 浏览器进程 CPU 14.7%（无插件基线 1.9%），手机端表现为持续发烫。
// 断言：会话完成后空闲 5s，rAF 请求次数趋零（阈值 25 次，修复后实测 ≈0，缺陷时 ≈300）。

import { openApp, sendHeroMessage } from "../helpers.mjs";

const WINDOW_MS = 5_000;
/** 修复后空闲期 rAF 应≈0；缺陷期约 60 次/s（5s ≈300 次）。阈值留出偶发合法重绘余量。 */
const MAX_RAF_REQUESTS = 25;

export default async function idleQuiescence({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, "e2e:fast 静默探针");
	// 等回合收尾、目录/历史补读全部落定，再进入静默计量窗。
	await page.waitForTimeout(3_000);

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
		`空闲期 rAF 请求 ${rafRequests} 次超过阈值 ${MAX_RAF_REQUESTS}（${WINDOW_MS / 1000}s）——存在逐帧渲染反馈环`,
	);
}
