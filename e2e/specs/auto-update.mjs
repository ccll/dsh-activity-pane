// R-01-001/AC-03～AC-06、R-01-002/AC-02、AC-06～AC-09、R-01-009/AC-02、R-01-009/AC-03、R-01-010/AC-04、R-01-017/AC-01、R-02-002/AC-01、R-02-002/AC-02
// 状态自动更新（出现/完成/等待出现/等待解除四类变化，无需手动刷新）、活动区空态、
// 折叠时间线不依赖 dsh-auto-collapse（本隔离环境按构造不含该插件，全套件功能断言
// 即「不降级」证据）、外壳重挂载恢复不重复、全程控制台无插件报错与未捕获异常。

import { mainAreaHas, newSessionWithMessage, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE_A = "e2e:fast 自动更新探针甲";
const TITLE_B = "e2e:fast 自动更新探针乙";
const TITLE_RUNTIME = "e2e:runtime 自动更新运行态探针";
const TITLE_MULTI_ASK = "e2e:multiask 多问题列表探针";
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 375, height: 700 };

async function badgeSnapshot(page, surface) {
	return page.evaluate((name) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const toggle = document.querySelector(".dap-toggle");
		const count = name === "header" ? pane?.querySelector(".dap-count") : name === "rail" ? pane?.querySelector(".dap-rail-count") : toggle?.querySelector(".dap-toggle-count");
		const owner = name === "toggle" ? toggle : count;
		if (!count || !owner) return null;
		const style = getComputedStyle(count);
		const animation = count.getAnimations()[0];
		return {
			text: count.textContent.trim(),
			awaiting: owner.hasAttribute("data-awaiting"),
			tone: owner.getAttribute("data-tone"),
			background: style.backgroundColor,
			animation: style.animationName,
			duration: style.animationDuration,
			currentTime: animation?.currentTime ?? null,
		};
	}, surface);
}

async function pulseSnapshot(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const nodes = [
			pane?.querySelector(".dap-count[data-awaiting]"),
			...(pane?.querySelectorAll('.dap-card[data-kind="awaiting"] .dap-foot :is(.dap-capsule, .dap-note)') ?? []),
		].filter(Boolean);
		return nodes.map((node) => {
			const style = getComputedStyle(node);
			const animation = node.getAnimations()[0];
			return { name: style.animationName, duration: style.animationDuration, currentTime: animation?.currentTime ?? null };
		});
	});
}

function pulsePhaseDelta(values, period = 1200) {
	const times = values.map((value) => value.currentTime).filter(Number.isFinite);
	if (times.length !== values.length || times.length === 0) return Infinity;
	const phases = times.map((time) => ((time % period) + period) % period).sort((a, b) => a - b);
	let maxGap = phases[0] + period - phases.at(-1);
	for (let index = 1; index < phases.length; index += 1) maxGap = Math.max(maxGap, phases[index] - phases[index - 1]);
	return period - maxGap;
}

export default async function autoUpdate({ page, url, mock, assert }) {
	// R-02-002/AC-02：全程收集控制台错误，结束后断言无插件报错。
	const consoleErrors = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(String(error)));

	await openApp(page, url);
	await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));

	// R-01-010/AC-04：无活动会话时活动区显示明确空态。
	// 宽限 30s：观测到宿主 sessions 服务偶发推送停滞（窗格滞留「加载中…」，见 TODO 缺陷线索）。
	await until("活动区空态提示", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("暂无活动会话") ? regions : null;
	}, 30_000);
	const emptyBadge = await badgeSnapshot(page, "header");
	assert.equal(emptyBadge?.text, "0/0", "空态数量徽标显示 0/0（R-01-001/AC-06）");
	assert.equal(emptyBadge?.awaiting, false, "无等待行动时数量徽标不进入等待态（R-01-002/AC-06）");
	assert.equal(emptyBadge?.animation, "none", "无等待行动时数量徽标停止脉冲（R-01-002/AC-06）");

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

	// R-01-001/AC-04～AC-06、R-01-002/AC-06～AC-07：三处数量徽标实际呈现同一 n/m、tone、底色与脉冲周期。
	const doneHeader = await until("完成提醒列头徽标就绪", async () => {
		const value = await badgeSnapshot(page, "header");
		return value?.tone === "done" ? value : null;
	});
	assert.equal(doneHeader.text, "1/1", "列头数量徽标显示等待行动数/活动主会话总数");
	assert.equal(doneHeader.background, "rgba(32, 41, 35, 0.97)", "完成提醒列头徽标使用完成卡绿色底色");
	assert.equal(doneHeader.animation, "dap-await-pulse", "存在等待行动时列头徽标开启脉冲");
	assert.equal(doneHeader.duration, "1.2s", "列头数量胶囊使用与等待卡末行相同的固定 1.2s 周期（R-01-002/AC-07）");
	const donePulse = await pulseSnapshot(page);
	assert.deepEqual(donePulse.map(({ name, duration }) => ({ name, duration })), [
		{ name: "dap-await-pulse", duration: "1.2s" },
		{ name: "dap-pulse", duration: "1.2s" },
		{ name: "dap-pulse", duration: "1.2s" },
	], "列头数量胶囊与等待卡末行胶囊/正文同频");
	assert.ok(pulsePhaseDelta(donePulse) < 80, `列头数量胶囊与等待卡末行应同相，实际最大相位差 ${pulsePhaseDelta(donePulse)}ms`);

	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	const doneRail = await until("完成提醒窄条徽标就绪", async () => {
		const value = await badgeSnapshot(page, "rail");
		return value?.tone === "done" ? value : null;
	});
	assert.deepEqual(
		{ text: doneRail.text, background: doneRail.background, duration: doneRail.duration, animation: doneRail.animation },
		{ text: "1/1", background: "rgba(32, 41, 35, 0.97)", duration: "1.2s", animation: "dap-await-pulse" },
		"折叠窄条徽标与列头使用同一完成 tone、底色与固定脉冲",
	);
	assert.ok(Number.isFinite(doneRail.currentTime) && doneRail.currentTime < 250, `折叠切换后窄条胶囊应从统一相位起步，实际 ${doneRail.currentTime}ms`);
	await page.getByRole("button", { name: /活动会话/ }).last().click();
	await until("展开后列头与全部等待卡重新同相", async () => {
		const values = await pulseSnapshot(page);
		return values.length >= 3 && pulsePhaseDelta(values) < 80 ? values : null;
	});

	await page.setViewportSize(MOBILE_VIEWPORT);
	const doneToggle = await until("完成提醒移动开关徽标就绪", async () => {
		const value = await badgeSnapshot(page, "toggle");
		return value?.tone === "done" ? value : null;
	});
	assert.deepEqual(
		{ text: doneToggle.text, background: doneToggle.background, duration: doneToggle.duration, animation: doneToggle.animation },
		{ text: "1/1", background: "rgba(32, 41, 35, 0.97)", duration: "1.2s", animation: "dap-await-pulse" },
		"移动开关徽标与列头使用同一完成 tone、底色与固定脉冲",
	);
	assert.ok(Number.isFinite(doneToggle.currentTime) && doneToggle.currentTime < 250, `切到移动端后活动按钮胶囊应从统一相位起步，实际 ${doneToggle.currentTime}ms`);
	await page.locator(".dap-toggle").click();
	await until("移动抽屉列头与全部等待卡重新同相", async () => {
		const values = await pulseSnapshot(page);
		return values.length >= 3 && pulsePhaseDelta(values) < 80 ? values : null;
	});
	await page.getByRole("button", { name: "收起活动会话窗格" }).click();
	await page.setViewportSize(DESKTOP_VIEWPORT);

	// R-01-017/AC-01：本隔离环境未安装 dsh-auto-collapse，时间线仍以折叠分组呈现
	// （上下文注入合并为分组行），窗格功能不降级。
	await until("折叠分组行呈现（无 dsh-auto-collapse 依赖）", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes("上下文注入") ? regions : null;
	});

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

	// R-01-001/AC-03、R-01-009/AC-02、AC-03：runtime 剧本先产生真实 ask tool，
	// 窗格呈现已落定的工具分组；回答后同一会话进入 slow 流式输出并原地更新时间线。
	await newSessionWithMessage(page, TITLE_RUNTIME);
	const runtimeCard = page.locator('[data-dsh-activity-pane] [role="button"]').filter({ hasText: TITLE_RUNTIME }).first();
	await until("tool 工作项落定并进入等待行动", async () => {
		const text = await runtimeCard.innerText().catch(() => "");
		return text.includes("运行了命令") && text.includes("等待回答") && text.includes("E2E 探针问题") ? text : null;
	});
	const singleQuestionList = await runtimeCard.evaluate((card) => {
		const capsule = card.querySelector(".dap-capsule-text");
		const list = card.querySelector(".dap-note > ul");
		return {
			capsule: capsule?.textContent ?? "",
			tag: list?.tagName ?? "",
			items: [...(list?.querySelectorAll(":scope > li") ?? [])].map((item) => item.textContent),
		};
	});
	assert.deepEqual(
		singleQuestionList,
		{ capsule: "提问中", tag: "UL", items: ["E2E 探针问题：是否继续？"] },
		"单问题待回复卡使用「提问中」胶囊与 ul/li bullet list（R-01-002/AC-02、R-01-002/AC-09）",
	);
	const blockedBadge = await until("阻塞等待徽标就绪", async () => {
		const value = await badgeSnapshot(page, "header");
		return value?.tone === "blocked" ? value : null;
	});
	assert.match(blockedBadge.text, /^\d+\/\d+$/, "阻塞等待时列头保持 n/m 计数（R-01-001/AC-04～AC-06）");
	assert.equal(blockedBadge.background, "rgba(46, 42, 26, 0.97)", "阻塞等待时列头徽标使用与阻塞卡一致的金色底（R-01-002/AC-06）");
	assert.equal(blockedBadge.animation, "dap-await-pulse", "阻塞等待时列头徽标持续脉冲（R-01-002/AC-06）");
	assert.equal(blockedBadge.duration, "1.2s", "等待占比变化后列头数量胶囊仍保持固定 1.2s 周期（R-01-002/AC-07）");
	const blockedPulse = await pulseSnapshot(page);
	assert.ok(pulsePhaseDelta(blockedPulse) < 80, `新增阻塞等待后数量胶囊与等待卡末行应重新同相，实际最大相位差 ${pulsePhaseDelta(blockedPulse)}ms`);
	await page.getByText("确认继续执行").click();
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	const earlyChunk = await until("时间线出现早期流式正文", async () => {
		const text = await runtimeCard.innerText().catch(() => "");
		const match = text.match(/慢速输出片段 (\d+)\/24/);
		return match && Number(match[1]) < 24 ? Number(match[1]) : null;
	});
	const laterChunk = await until("同一时间线跟随流式输出更新", async () => {
		const text = await runtimeCard.innerText().catch(() => "");
		const chunks = [...text.matchAll(/慢速输出片段 (\d+)\/24/g)].map((match) => Number(match[1]));
		const latest = Math.max(0, ...chunks);
		return latest > earlyChunk ? latest : null;
	});
	assert.ok(laterChunk > earlyChunk, `流式时间线应从片段 ${earlyChunk} 更新到更晚片段，实际 ${laterChunk}`);
	await until("等待解除并转为完成提醒", async () => {
		const text = await runtimeCard.innerText().catch(() => "");
		return !text.includes("等待回答") && text.includes("已完成") ? text : null;
	});
	const resolvedPulse = await pulseSnapshot(page);
	assert.ok(pulsePhaseDelta(resolvedPulse) < 80, `阻塞等待转完成提醒后全部数量胶囊与等待卡末行应重新同相，实际最大相位差 ${pulsePhaseDelta(resolvedPulse)}ms`);
	const runtimeIndex = mock.scenarioLog.indexOf("runtime");
	const slowAfterRuntime = mock.scenarioLog.indexOf("slow", runtimeIndex + 1);
	assert.ok(runtimeIndex >= 0 && slowAfterRuntime > runtimeIndex, `runtime 应在 tool 请求后进入 slow，实际：${mock.scenarioLog}`);

	// R-01-002/AC-02、R-01-002/AC-09：多个可展示问题使用 ol/li，编号来自原始问题位置。
	await newSessionWithMessage(page, TITLE_MULTI_ASK);
	const multiAskCard = page.locator('[data-dsh-activity-pane] [role="button"]').filter({ hasText: TITLE_MULTI_ASK }).first();
	const multiQuestionList = await until("多问题编号列表就绪", async () =>
		multiAskCard.evaluate((card) => {
			const capsule = card.querySelector(".dap-capsule-text");
			const list = card.querySelector(".dap-note > ol");
			if (!list) return null;
			return {
				capsule: capsule?.textContent ?? "",
				tag: list.tagName,
				items: [...list.querySelectorAll(":scope > li:not(.dap-question-ellipsis)")].map((item) => ({ value: item.value, text: item.textContent })),
			};
		}),
	);
	assert.deepEqual(
		multiQuestionList,
		{
			capsule: "提问中",
			tag: "OL",
			items: [{ value: 1, text: "E2E 多问第一题？" }, { value: 2, text: "E2E 多问第二题？" }],
		},
		"多问题待回复卡使用「提问中」胶囊与 ol/li 编号列表（R-01-002/AC-02、R-01-002/AC-09）",
	);

	// R-02-002/AC-02：加载、运行、等待、切换全程控制台无插件报错、无未捕获异常
	// （控制台监听在 goto 之前挂接，槽座出现前的早期阶段也在覆盖范围内）。
	const pluginErrors = consoleErrors.filter((text) => text.includes("dsh-activity-pane"));
	assert.deepEqual(pluginErrors, [], `控制台无插件报错，实际：${pluginErrors}`);
	assert.deepEqual(consoleErrors, [], `全程无任何控制台错误或未捕获异常，实际：${consoleErrors.slice(0, 3)}`);
}
