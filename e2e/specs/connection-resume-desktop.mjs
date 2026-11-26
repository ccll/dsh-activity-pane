//  回归（T-192）：壳层连接自愈触发面收窄——半开死连接是移动 OS 挂起
// 特有的失效形态，桌面浏览器与桌面安装版 PWA 由壳层既有 close/online 路径兜底；真机
// 探针实证桌面主动 reconnect 是纯代价（generation 重建的快照重放中间态让全卡
// displayTitle 短暂退化为工作区派生名再恢复，叠加时长跳变构成整窗格刷新风暴）。本
// spec 钉住：桌面形态（headless context 主输入有 hover）下，长隐藏→可见不触发壳层
// 连接重建，平台门控在长隐藏评估之后、软依赖之前短路（阈值/seam 达标也不触发）。

import { CONNECTION_HEAL_MARKER as HEAL_MARKER, openApp, syntheticHideRestore, until } from "../helpers.mjs";

const SEAM_THRESHOLD_MS = 0;

export default async function connectionResumeDesktop({ page, url, assert }) {
	const selfHealLogs = [];
	const websocketUrls = [];
	page.on("console", (message) => {
		if (message.text().includes(HEAL_MARKER)) selfHealLogs.push(message.text());
	});
	page.on("websocket", (socket) => websocketUrls.push(socket.url()));
	const params = new URLSearchParams({ "dap-e2e-resume-reconnect-ms": String(SEAM_THRESHOLD_MS) });
	await openApp(page, `${url}#${params}`);
	const wsBaseline = websocketUrls.length;

	// 桌面形态（无触屏主输入）：seam 阈值 0 + 观测 hidden 边沿 + 长隐藏，
	// 平台门控仍应直接跳过重建——标记与新连接世代都不出现。
	await syntheticHideRestore(page, 1200);
	await new Promise((resolve) => setTimeout(resolve, 600));
	assert.equal(selfHealLogs.length, 0, "桌面形态长隐藏恢复不重建（平台门控）");
	await until("桌面形态回前台无新连接世代", async () => (websocketUrls.length === wsBaseline ? websocketUrls : null));
	assert.equal(selfHealLogs.length, 0, "桌面形态无自愈标记");
}
