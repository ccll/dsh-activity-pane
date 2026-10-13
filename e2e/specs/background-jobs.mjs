// R-01-023/AC-01、AC-02、AC-05、AC-08、AC-09、AC-10、R-01-025/AC-08、R-01-003/AC-04
// 呈现与交互链路（浏览器黄金路径）：e2e:job 剧本让引擎真实启动后台任务并读取一次输出
// ——默认中间档不呈现任务子卡、仅以母卡「后台 ×N」数量注承载，切回完整档随档位重渲染
// 恢复；完整档以 job 子卡呈现（与子代理同形：层级连接线 + 两行卡面）、第一行工具名称
// 与随时钟时长、第二行任务内容原文（悬停 tooltip 完整原文）、卡面底色与子代理卡区分；
// 低档位在跑任务期间不因任务时长逐秒重绘窗格；回合结束后在跑任务期间完成提醒被抑制；
// 点击 job 子卡不触发任何操作。
import { mainAreaHas, newSessionWithMessage, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:job 后台任务探针";

export default async function backgroundJobs({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, TITLE);

	const paneState = () =>
		page.evaluate(() => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			return {
				density: pane?.getAttribute("data-density") ?? "",
				chip: pane?.querySelector(".dap-jobs-chip")?.textContent ?? "",
				jobCards: pane?.querySelectorAll('.dap-card[data-kind="job"]').length ?? 0,
			};
		});

	// 低档位逐秒重绘观测（R-01-025/AC-08）：静默闸先确立前置条件——观测开始前 1.3s
	// 内无任何变更（吸收回合收口竞态：回复行流出与回合结束事件落地之间存在窗口，期间
	// 母卡累计运行时长仍合法逐秒推进，R-01-020）——再以静默时刻为基线继续观测 0.9s，
	// 合计 ≥2.2s 静默。observer 只监听 childList/characterData：CSS 脉冲动画与滚动
	// 锚定（data-scrolling 属性）不产生结构/文本变更，不计入。变更日志用于失败归因
	// （变更类型/目标/归属卡片/增删节点），逐次记录便于定位变更源。
	const armJobClockObserver = () =>
		page.evaluate(() => {
			const target = document.querySelector("[data-dsh-activity-pane] .dap-scroll");
			window.__jobClockMutations = 0;
			window.__jobClockMutationLog = [];
			window.__jobClockLastAt = Date.now();
			if (window.__jobClockObserver) window.__jobClockObserver.disconnect();
			window.__jobClockObserver = new MutationObserver((records) => {
				for (const record of records) {
					window.__jobClockMutations += 1;
					window.__jobClockLastAt = Date.now();
					window.__jobClockMutationLog.push({
						type: record.type,
						target: record.target?.className ?? "",
						text: (record.target?.textContent ?? "").slice(0, 80),
						card: record.target?.closest?.(".dap-card")?.getAttribute("data-id") ?? "",
						added: [...record.addedNodes].map((node) => node.className ?? node.nodeName),
						removed: [...record.removedNodes].map((node) => node.className ?? node.nodeName),
					});
				}
			});
			window.__jobClockObserver.observe(target, { childList: true, subtree: true, characterData: true });
		});
	const jobClockQuietMs = () => page.evaluate(() => Date.now() - (window.__jobClockLastAt ?? Date.now()));
	const observeQuietWindow = async (label, message) => {
		await armJobClockObserver();
		const settled = await until(`${label}前置静默`, async () => (await jobClockQuietMs()) >= 1_300, 25_000);
		assert.ok(settled !== null, `${label}前置静默未达成——观测开始前列表仍在逐秒变更，无法归因门控本身`);
		const baseline = await page.evaluate(() => window.__jobClockMutations);
		await page.waitForTimeout(900);
		const after = await page.evaluate(() => ({ count: window.__jobClockMutations, log: window.__jobClockMutationLog }));
		assert.equal(after.count, baseline, `${message}${JSON.stringify(after.log.slice(baseline))}`);
	};

	// R-01-023/AC-10（默认中间档）：任务子卡不呈现，在跑任务仅以母卡数量注承载。
	const mediumGate = await until("中间档母卡数量注出现", async () => {
		const state = await paneState();
		return state.density === "medium" && state.chip.includes("后台 ×1") ? state : null;
	}, 30_000);
	assert.ok(mediumGate !== null, "前置：中间档母卡数量注出现（R-01-023/AC-01）");
	assert.equal(mediumGate.jobCards, 0, "中间档不呈现后台任务子卡（R-01-023/AC-10）");

	// 切至完整档：任务子卡随档位重渲染呈现。
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());

	// R-01-023/AC-01、AC-05：在跑后台任务以 job 子卡呈现（跟随母会话、运行点状态），
	// 第一行工具名称（友好映射）、第二行任务内容原文。
	const jobCard = await until("job 子卡呈现", async () => {
		return page.evaluate(() => {
			const job = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]');
			if (!job) return null;
			return {
				kind: job.querySelector(".dap-job-kind")?.textContent ?? "",
				content: job.querySelector(".dap-job-label")?.textContent ?? "",
				contentTitle: job.querySelector(".dap-job-label")?.getAttribute("title") ?? "",
				dotStatus: job.querySelector(".dap-job-dot")?.dataset.status ?? "",
				depth: Number(job.dataset.depth ?? "0"),
			};
		});
	}, 30_000);
	assert.ok(jobCard !== null, "在跑后台任务以 job 子卡呈现（R-01-023/AC-01）");
	assert.equal(jobCard.kind, "Bash", "job 子卡第一行显示工具名称友好映射（R-01-023/AC-05）");
	assert.ok(jobCard.content.includes("e2e-job-tick-start"), "job 子卡第二行为任务内容原文（探针 echo 行在内，R-01-023/AC-05）");
	assert.ok(jobCard.dotStatus === "running", "job 子卡状态点为运行态");

	// R-01-023/AC-09：任务子卡状态点活性——运行态以 dap-pulse 固定节奏持续闪烁并带同色相光晕。
	const dotMotion = await page.evaluate(() => {
		const dot = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"] .dap-job-dot');
		if (!dot) return null;
		const style = getComputedStyle(dot);
		return { animationName: style.animationName, boxShadow: style.boxShadow };
	});
	assert.ok(dotMotion !== null, "前置：job 子卡状态点存在（R-01-023/AC-09）");
	assert.equal(dotMotion.animationName, "dap-pulse", "任务子卡状态点以 dap-pulse 固定节奏闪烁（R-01-023/AC-09）");
	assert.ok(dotMotion.boxShadow !== "none" && dotMotion.boxShadow !== "", "任务子卡状态点带同色相光晕（R-01-023/AC-09）");

	// R-01-003/AC-04：后台任务子卡与子代理一视同仁——轨道层绘制母会话到任务子卡的连接线。
	const tracks = await until("任务子卡连接线", async () => {
		return page.evaluate(() => {
			const layer = document.querySelector('[data-dsh-activity-pane] .dap-tracks');
			if (!layer) return null;
			return layer.querySelector(".dap-conn-track") !== null && layer.querySelectorAll(".dap-conn-stub").length >= 1
				? { track: true, stubs: layer.querySelectorAll(".dap-conn-stub").length }
				: null;
		});
	}, 10_000);
	assert.ok(tracks !== null && tracks.stubs >= 1, "母会话到任务子卡的层级连接线已绘制（R-01-003/AC-04）");

	// R-01-023/AC-01：母卡标题行「后台 ×1」数量注。
	const active = await paneRegions(page);
	assert.ok(active && active.active.includes("后台 ×1"), "母卡标题行标注在跑后台任务数量（R-01-023/AC-01）");

	// R-01-023/AC-05：内容行悬停 tooltip 承载完整命令原文。
	assert.ok(jobCard.contentTitle.includes("e2e-job-tick-start"), "job 子卡内容行悬停显示完整命令（R-01-023/AC-05）");

	// R-01-023/AC-02：回合收口（回复行已流出）后任务仍在跑——完成提醒被抑制。以
	// data-wait="done" 结构标记判定，不以「已完成」文本子串判定：时间线末行 agent
	// 回复文本本身含「已完成」字样，子串匹配会误报（T-152 修正既有断言缺陷）。
	await until("回合回复已流出", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("E2E 快速回合已完成") ? true : null;
	}, 20_000);
	const suppressed = await page.evaluate(() => {
		return document.querySelector('[data-dsh-activity-pane] .dap-card[data-wait="done"]') === null;
	});
	assert.ok(suppressed, "回合收口后在跑后台任务期间完成提醒被抑制（R-01-023/AC-02）");
	// 完成登记跨客户端的竞态窗口内再核一次：任务持续期间抑制保持。
	await new Promise((resolve) => setTimeout(resolve, 3_000));
	const stillSuppressed = await page.evaluate(() => {
		return document.querySelector('[data-dsh-activity-pane] .dap-card[data-wait="done"]') === null;
	});
	assert.ok(stillSuppressed, "在跑任务期间完成提醒持续被抑制（R-01-023/AC-02）");

	// R-01-023/AC-10、R-01-025/AC-08：切至紧凑档——任务子卡不呈现，数量注照常承载。
	// data-density 在点击时同步写入而重渲染异步落地，谓词必须合取门控结果（子卡清零），
	// 否则断言会读到渲染前的旧 DOM。
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());
	const compactGate = await until("紧凑档门控生效", async () => {
		const state = await paneState();
		return state.density === "compact" && state.jobCards === 0 ? state : null;
	}, 10_000);
	assert.ok(compactGate !== null, "前置：已切至紧凑档且任务子卡已摘除——紧凑档不呈现后台任务子卡（R-01-023/AC-10）");
	assert.ok(compactGate.chip.includes("后台 ×1"), "紧凑档母卡数量注照常承载（R-01-023/AC-10）");

	// R-01-025/AC-08：回合已收口、活动区无自身回合运行中的会话/子代理——紧凑档在跑
	// 后台任务期间不为任务时长维持逐秒重绘，观测窗内列表 DOM 零变更。
	await observeQuietWindow("紧凑档", "紧凑档在跑后台任务期间列表零逐秒重绘（R-01-025/AC-08）");

	// R-01-023/AC-10：中间档同门控。
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());
	const mediumGate2 = await until("中间档门控复核", async () => {
		const state = await paneState();
		return state.density === "medium" && state.jobCards === 0 ? state : null;
	}, 10_000);
	assert.ok(mediumGate2 !== null, "前置：已切回中间档且任务子卡未复现——中间档不呈现后台任务子卡（R-01-023/AC-10 复核）");
	// 中间档观测窗：静默闸同时吸收切档合法重渲染——mediumGate2 谓词可在重渲染落地前
	// 通过（子卡数恒为 0，不构成中间档重渲染完成的判据），落地后才进入 ≥2.2s 零变更观测。
	await observeQuietWindow("中间档", "中间档在跑后台任务期间列表零逐秒重绘（R-01-025/AC-08）");

	// R-01-023/AC-10、R-01-025/AC-08：切回完整档——任务子卡随档位重渲染恢复，且时长
	// 恢复逐秒推进（fmtElapsedMs 秒粒度文案，2.2s 观测窗内必然变化）。
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());
	const restored = await until("完整档任务子卡恢复", async () => {
		return page.evaluate(() => {
			const elapsed = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"] .dap-job-elapsed');
			return elapsed?.textContent || null;
		});
	}, 10_000);
	assert.ok(restored !== null, "切回完整档任务子卡随档位重渲染恢复（R-01-023/AC-10）");
	// 轮询至文案变为「非空且异于首读」（fmtElapsedMs 秒粒度）：任务恰在窗内结束时
	// elapsed 清空，固定延时读取空串会以 notEqual 空转通过（spec 轴审核 c)2）。
	const advanced = await until("任务时长恢复推进", async () => {
		const text = await page.evaluate(
			() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"] .dap-job-elapsed')?.textContent ?? "",
		);
		return text && text !== restored ? text : null;
	}, 8_000);
	assert.ok(advanced !== null, "切回完整档后任务时长恢复逐秒推进（R-01-025/AC-08）");

	// R-01-023/AC-08：后台任务子卡为纯展示——切到新会话后点击 job 子卡，不发生会话
	// 切换（任务在跑期间归属会话保留在活动区，job 子卡跨会话可见）。子卡无激活绑定，
	// 不存在重试链等延迟路径，1.5s 窗口覆盖事件派发已足够；另以结构断言钉住非按钮语义。
	await newSessionWithMessage(page, "e2e:fast 会话切换探针");
	assert.ok(await mainAreaHas(page, "e2e:fast 会话切换探针"), "前置：已切换到新会话");
	const jobStillShown = await page.evaluate(
		() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]') !== null,
	);
	assert.ok(jobStillShown, "前置：切会话后任务子卡仍在（任务仍在跑，避免点击断言空转）");
	const jobRole = await page.evaluate(() =>
		document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]')?.getAttribute("role") ?? null
	);
	assert.equal(jobRole, null, "job 子卡不承载按钮语义（R-01-023/AC-08）");
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]')?.click());
	await page.waitForTimeout(1500);
	assert.ok(await mainAreaHas(page, "e2e:fast 会话切换探针"), "点击后台任务子卡不切换会话（R-01-023/AC-08）");
}
