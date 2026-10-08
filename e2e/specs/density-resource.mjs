// R-01-024/AC-01、R-01-024/AC-02、R-01-024/AC-05、R-01-024/AC-07、R-01-010/AC-09
// 档位资源纪律：紧凑档不为不可见内容构建时间线与统计行（trace 容器零子节点、
// 统计行保持未写入，DOM 层可观察）；标题行可见信息与累计运行时长照常逐秒推进
// （非日志通道不停摆）；切回更高档位后被裁剪数据按既有渐进语义重建就绪。
// 传输层节省（日志窗口 dispose 停流、深翻跳过）由 task 终态探针证据与 bundle
// 契约断言承载——宿主会话窗口按会话对象去重，网络层无法按发起方归因（T-157）。
// 找卡一律用 data-wait/data-kind/data-current 结构选择器：宿主自动命名会用 LLM
// 回复改写会话标题，卡片可见文本对断言不稳定。

import { newSessionWithMessage, openApp, sendHeroMessage, until } from "../helpers.mjs";

const RUNNING_CARD = '.dap-card[data-kind="running"]';
const DONE_CARD = '.dap-card[data-wait="done"]';

/** 单卡档位资源相关状态：时间线构建量、统计行文本与标题行可见性。 */
function cardBuildState(page, index) {
	return page.evaluate((idx) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const card = [...(pane?.querySelectorAll('.dap-card[data-wait="done"]') ?? [])][idx];
		if (!card) return null;
		return {
			density: pane.getAttribute("data-density"),
			traceChildren: card.querySelector(".dap-trace")?.childElementCount ?? -1,
			statsText: card.querySelector(".dap-token-stats")?.textContent ?? "",
			titleRowVisible: (card.querySelector(".dap-row")?.getBoundingClientRect().height ?? 0) > 0,
		};
	}, index);
}

/** 等待窗格根 data-density 达到期望档位。 */
async function untilDensity(page, expected, label) {
	await until(label, async () => ((await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.getAttribute("data-density"))) === expected ? true : null));
}

/** 按可访问名称点击档位切换按钮并等待进入期望档位。 */
async function stepDensity(page, name, expected, label) {
	await page.getByRole("button", { name }).click();
	await untilDensity(page, expected, label);
}

export default async function densityResource({ page, url, assert }) {
	await page.setViewportSize({ width: 1100, height: 700 });
	await openApp(page, url);

	// 探针会话 A：完整档下完成——窗格建立其日志窗口，时间线与统计就绪（正向基线）。
	await sendHeroMessage(page, "e2e:fast 档位资源探针A");
	await until("探针A完成卡出现", async () => {
		const present = await page.evaluate(() => !!document.querySelector('[data-dsh-activity-pane] .dap-card[data-wait="done"]'));
		return present ? true : null;
	}, 30_000);
	await until("完整档下探针A时间线已构建", async () => {
		const children = await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-wait="done"] .dap-trace')?.childElementCount ?? -1);
		return children > 0 ? true : null;
	}, 30_000);

	// 当前会话 B（完成后保持完成提醒；探针A成为非当前会话）。
	await newSessionWithMessage(page, "e2e:fast 档位资源宿主B");
	await until("宿主B完成卡出现", async () => {
		const count = await page.evaluate(() => document.querySelectorAll('[data-dsh-activity-pane] .dap-card[data-wait="done"]').length);
		return count >= 2 ? true : null;
	}, 30_000);

	// 切到紧凑档（默认中间 → 完整 → 紧凑）。
	await stepDensity(page, "切换为完整显示", "full", "切到完整档");
	await stepDensity(page, "切换为紧凑显示", "compact", "切到紧凑档");

	// R-01-024/AC-05：紧凑档新建会话完成卡——时间线容器零子节点（不构建）、
	// 统计行保持未写入。档内新建C是最新完成卡（等待组按进入时刻新→旧排首）。
	await newSessionWithMessage(page, "e2e:fast 档内新建C");
	await until("档内新建C完成卡出现", async () => {
		const count = await page.evaluate(() => document.querySelectorAll('[data-dsh-activity-pane] .dap-card[data-wait="done"]').length);
		return count >= 3 ? true : null;
	}, 30_000);
	const compactC = await cardBuildState(page, 0);
	assert.ok(compactC !== null, "档内新建C完成卡在场");
	assert.equal(compactC.traceChildren, 0, "紧凑档下不构建被隐藏的时间线内容（R-01-024/AC-05）");
	assert.equal(compactC.statsText, "", "紧凑档下不写入被隐藏的统计行（R-01-024/AC-05）");
	assert.ok(compactC.titleRowVisible, "紧凑档下标题行照常呈现（R-01-024/AC-07）");

	// R-01-024/AC-02、AC-07：紧凑档下运行卡标题行可见信息照常实时更新——
	// 累计运行时长逐秒推进（轮内订阅与 busy 通道不随裁剪停摆）。
	await newSessionWithMessage(page, "e2e:slow 档内运行D");
	await until("档内运行D运行卡出现", async () => {
		const present = await page.evaluate(() => !!document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="running"]'));
		return present ? true : null;
	}, 30_000);
	const tickOne = await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-current] .dap-row .dap-total-time')?.textContent ?? "");
	assert.ok(tickOne !== "", "紧凑档下运行卡标题行显示累计运行时长（R-01-024/AC-07）");
	await page.waitForTimeout(2100);
	const tickTwo = await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="running"] .dap-row .dap-total-time')?.textContent ?? "");
	assert.notEqual(tickTwo, tickOne, "紧凑档下累计运行时长照常逐秒推进（R-01-024/AC-02、AC-07）");

	// R-01-024/AC-01：切回更高档位后被裁剪数据按既有渐进语义重建就绪——
	// 档内新建C的时间线在中间档构建（切换前容器为空）。
	await stepDensity(page, "切换为中间显示", "medium", "切回中间档");
	await until("档内新建C时间线在切回后构建", async () => {
		const state = await cardBuildState(page, 0);
		return state !== null && state.traceChildren > 0 ? true : null;
	}, 30_000);
	// 既有完成卡（宿主B，完整档时代已就绪）在中间档保持时间线呈现，数据不因往返丢失。
	const existingDone = await cardBuildState(page, 1);
	assert.ok(existingDone !== null && existingDone.traceChildren > 0, "切回后既有会话时间线数据就绪（R-01-024/AC-01）");
	assert.ok(existingDone.titleRowVisible, "切回后标题行照常呈现（R-01-024/AC-07）");
}
