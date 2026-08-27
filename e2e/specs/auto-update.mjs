// R-01-001/AC-03、R-01-010/AC-04、R-01-017/AC-01、R-02-002/AC-01、R-02-002/AC-02
// 状态自动更新（出现/完成/等待出现/等待解除四类变化，无需手动刷新）、活动区空态、
// 折叠时间线不依赖 dsh-auto-collapse（本隔离环境按构造不含该插件，全套件功能断言
// 即「不降级」证据）、外壳重挂载恢复不重复、全程控制台无插件报错与未捕获异常。

import { dismissNotice, mainAreaHas, newSessionWithMessage, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE_A = "e2e:fast 自动更新探针甲";
const TITLE_B = "e2e:fast 自动更新探针乙";
const TITLE_ASK = "e2e:ask 自动更新等待探针";

export default async function autoUpdate({ page, url, assert }) {
	// R-02-002/AC-02：全程收集控制台错误，结束后断言无插件报错。
	const consoleErrors = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(String(error)));

	await page.goto(url, { waitUntil: "networkidle" });
	await dismissNotice(page);

	// R-01-010/AC-04：无活动会话时活动区显示明确空态。
	await until("活动区空态提示", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("暂无活动会话") ? regions : null;
	}, 20_000);

	// R-01-001/AC-03：会话开始运行与结束的状态变化自动反映到窗格，无需手动刷新。
	await sendHeroMessage(page, TITLE_A);
	await until("新会话自动出现在活动区", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE_A) ? regions : null;
	});
	await until("回合结束自动转为完成提醒", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("已完成") ? regions : null;
	});

	// R-01-017/AC-01：本隔离环境未安装 dsh-auto-collapse，时间线仍以折叠分组呈现
	// （上下文注入合并为分组行），窗格功能不降级。
	const regionsAfterRun = await paneRegions(page);
	assert.ok(regionsAfterRun.active.includes("上下文注入"), "折叠分组行呈现（无 dsh-auto-collapse 依赖）");

	// R-02-002/AC-01：会话切换/导航触发外壳视图更替后，窗格保持恰好一个实例。
	await newSessionWithMessage(page, TITLE_B);
	await until("第二会话出现在活动区", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE_B) ? regions : null;
	});
	assert.equal(await page.locator("[data-dsh-activity-pane]").count(), 1, "导航后窗格不重复");
	// 点击窗格中会话甲的卡片切回（经窗格跳转，再次更替外壳视图）。
	await page.locator("[data-dsh-activity-pane]").getByText(TITLE_A, { exact: true }).first().click();
	await until("切回会话甲", () => mainAreaHas(page, TITLE_A));
	assert.equal(await page.locator("[data-dsh-activity-pane]").count(), 1, "切换后窗格不重复");
	const regionsAfterSwitch = await paneRegions(page);
	assert.ok(regionsAfterSwitch.active.includes(TITLE_A) && regionsAfterSwitch.active.includes(TITLE_B), "两张卡片在重挂载后保持");

	// R-01-001/AC-03（等待出现与等待解除）：ask 剧本使会话进入等待行动，
	// 窗格呈现「等待回答」；在主会话区选择选项并提交后，等待解除并转为完成提醒。
	await newSessionWithMessage(page, TITLE_ASK);
	await until("等待行动自动出现在窗格", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("等待回答") && regions.active.includes(TITLE_ASK) ? regions : null;
	});
	await page.getByText("确认继续执行").click();
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await until("等待解除并转为完成提醒", async () => {
		const regions = await paneRegions(page);
		return regions && !regions.active.includes("等待回答") && regions.active.includes("已完成") ? regions : null;
	});

	// R-02-002/AC-02：加载、运行、等待、切换全程控制台无插件报错、无未捕获异常
	// （控制台监听在 goto 之前挂接，槽座出现前的早期阶段也在覆盖范围内）。
	const pluginErrors = consoleErrors.filter((text) => text.includes("dsh-activity-pane"));
	assert.deepEqual(pluginErrors, [], `控制台无插件报错，实际：${pluginErrors}`);
	assert.deepEqual(consoleErrors, [], `全程无任何控制台错误或未捕获异常，实际：${consoleErrors.slice(0, 3)}`);
}
