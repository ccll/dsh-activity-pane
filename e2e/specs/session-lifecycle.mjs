// R-01-001/AC-01、AC-02、R-01-002/AC-03、AC-10、R-01-010/AC-01、AC-02
// 会话生命周期端到端：空态 → e2e:slow 剧本运行卡 → 完成提醒卡 → 确认移入历史区。
// 只断言用户可观察的呈现（区域文字、按钮、页面 URL），不依赖内部 DOM 结构（C-045）。

const POLL_INTERVAL_MS = 200;
const TITLE = "e2e:slow 慢速任务探针";

/** 轮询直到 fn() 返回真值或超时；超时抛错并附最后一次观测值。 */
async function until(label, fn, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	let last;
	for (;;) {
		last = await fn();
		if (last) return last;
		if (Date.now() > deadline) throw new Error(`等待超时：${label}（最后观测：${JSON.stringify(last)}）`);
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
}

/** 读取窗格可见文字，按「最近历史」区段标题切成活动区/历史区两段。 */
async function paneRegions(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const text = pane.innerText;
		const marker = text.indexOf("最近历史");
		return {
			active: marker === -1 ? text : text.slice(0, marker),
			recent: marker === -1 ? "" : text.slice(marker),
		};
	});
}

export default async function sessionLifecycle({ page, url, mock, assert }) {
	await page.goto(url, { waitUntil: "networkidle" });

	// 首跑公告弹窗仅在首次出现，存在则关掉。
	const notice = page.getByRole("button", { name: "Continue" });
	if (await notice.isVisible().catch(() => false)) await notice.click();

	// R-01-001/AC-02 无活动会话时为空态。
	await until("窗格挂载并显示空态", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("暂无活动会话") ? regions : null;
	});

	// 经真实 composer 发送 e2e:slow 指令（R-01-001/AC-01 的驱动路径）。
	// hero 页首渲染后可能二次水合清空输入，填入后校验、必要时重填。
	const composer = page.locator('textarea[placeholder="Describe what you want to build"]');
	await composer.waitFor();
	for (let attempt = 0; attempt < 3; attempt += 1) {
		await composer.fill(TITLE);
		await page.waitForTimeout(500);
		if ((await composer.inputValue()) === TITLE) break;
	}
	assert.equal(await composer.inputValue(), TITLE, "composer 填入后应保持文本");
	await page.keyboard.press("Enter");
	// 提交成功的标志：会话页出现（hero composer 消失）。
	await until("消息提交并进入会话页", async () => ((await composer.count()) === 0 ? true : null));

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
