// R-01-001/AC-01、R-01-001/AC-02、R-01-002/AC-03、R-01-002/AC-10、R-01-010/AC-01、R-01-010/AC-02、R-01-010/AC-04
// 会话生命周期端到端：空态 → e2e:slow 剧本运行卡 → 完成提醒卡 → 确认移入历史区。
// 只断言用户可观察的呈现（区域文字、按钮、页面 URL），不依赖内部 DOM 结构（C-045）。

import { openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:slow 慢速任务探针";

export default async function sessionLifecycle({ page, url, mock, assert }) {
	await openApp(page, url);

	// R-01-001/AC-02、R-01-010/AC-04：无活动会话时活动区显示明确空态而非空白。
	// 宽限 30s：观测到宿主 sessions 服务偶发推送停滞（窗格滞留「加载中…」，见 TODO 缺陷线索）。
	await until("窗格挂载并显示空态", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("暂无活动会话") ? regions : null;
	}, 30_000);

	// 经真实 composer 发送 e2e:slow 指令（R-01-001/AC-01 的驱动路径）。
	await sendHeroMessage(page, TITLE);

	// R-01-001/AC-01：慢速剧本流式期间（约 3.6s）活动区出现该会话条目，
	// 且不呈现完成提醒文案。
	await until("活动区出现会话条目", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE) ? regions : null;
	});
	const duringRun = await paneRegions(page);
	assert.ok(!duringRun.active.includes("已完成"), "流式期间不呈现「已完成」");

	// mock 必须确实命中 slow 剧本（证明链路经 mock LLM 而非真实模型）。
	assert.ok(mock.scenarioLog.includes("slow"), `mock 应命中 slow 剧本，实际：${mock.scenarioLog}`);

	// R-01-002/AC-03：回合结束后以「已完成」呈现（完成提醒），并提供确认按钮。
	await until("呈现完成提醒与确认按钮", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("已完成") && regions.active.includes("移入历史") ? regions : null;
	});

	// R-01-002/AC-10：激活确认按钮不触发会话跳转；R-01-010/AC-01、AC-02：
	// 确认后条目离开活动区、进入历史区。
	const urlBefore = page.url();
	await page.getByRole("button", { name: "移入历史", exact: true }).click();
	assert.equal(page.url(), urlBefore, "确认按钮不得触发会话跳转");
	await until("条目迁入历史区", async () => {
		const regions = await paneRegions(page);
		if (!regions || regions.active.includes(TITLE)) return null;
		return regions.recent.includes(TITLE) ? regions : null;
	});
}
