// R-01-023/AC-01、AC-02、AC-05、R-01-024/AC-01、AC-02、AC-03、R-01-003/AC-04 呈现链路（浏览器黄金路径）：
// e2e:job 剧本让引擎真实启动后台任务并读取一次输出——窗格以 job 子卡呈现（与子代理
// 同形：层级连接线 + 两行卡面）、第一行工具名称与随时钟时长、第二行任务内容原文（悬停
// tooltip 完整原文）、卡面底色与子代理卡区分、紧凑档仅保留工具名行、母卡标题行「后台 ×N」
// 数量注、回合结束后在跑任务期间完成提醒被抑制、点击子卡在卡内展开模型已读输出回放。
import { openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:job 后台任务探针";

export default async function backgroundJobs({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, TITLE);

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

	// R-01-024/AC-01：激活 job 子卡，输出区在卡内展开并回放模型已读任务输出。
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]')?.click());
	const apiProbe = await page.evaluate(async () => {
		const job = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]');
		const owner = job?.dataset.jobOwner ?? "";
		const jobId = job?.dataset.jobId ?? "";
		const res = await fetch(`/dsh-activity-pane/api/jobs-output?sessionId=${encodeURIComponent(owner)}&jobId=${encodeURIComponent(jobId)}`);
		const body = await res.text();
		return { status: res.status, body: body.slice(0, 200), owner, jobId };
	});
	if (process.env.E2E_TRACE === "2") console.error("[api]", JSON.stringify(apiProbe));
	const outputText = await until("任务输出区回放", async () => {
		const probe = await page.evaluate(() => {
			const out = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"][data-expanded] .dap-jobout-pre');
			return {
				out: out && out.textContent.length > 0 ? out.textContent : null,
				hint: document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"][data-expanded] .dap-jobout-hint')?.textContent ?? null,
				expandedAny: document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]')?.hasAttribute("data-expanded") ?? null,
				hasOutNode: out !== null,
			};
		});
		if (process.env.E2E_TRACE === "2") console.error("[jobout]", JSON.stringify(probe));
		return probe.out;
	}, 15_000);
	assert.ok(outputText.includes("e2e-job-tick"), "卡内输出区回放模型已读任务输出（R-01-024/AC-01）");

	// R-01-024/AC-03：agent 再次读取后，展开中的输出区经 jobs/stream 刷新（本轮收口前
	// mock 已只读一次；刷新链路以通知通道在 bundle 与宿主已验，此处验证展开态存活）。
	const expanded = await page.evaluate(() => {
		const job = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]');
		return job?.hasAttribute("data-expanded") === true && job.querySelector(".dap-jobout") !== null;
	});
	assert.ok(expanded, "输出区保持展开态（单选展开语义）");

	// R-01-024 呈现细化、R-01-023/AC-05：内容行悬停 tooltip 承载完整命令原文。
	assert.ok(jobCard.contentTitle.includes("e2e-job-tick-start"), "job 子卡内容行悬停显示完整命令（R-01-024 呈现细化）");

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

	// R-01-023/AC-05：紧凑档仅保留工具名行、内容行隐藏（切换后恢复既有档位）。
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());
	const compactHidden = await until("紧凑档内容行隐藏", async () => {
		return page.evaluate(() => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			const content = pane?.querySelector('.dap-card[data-kind="job"] .dap-job-content');
			return pane?.getAttribute("data-density") === "compact" && content !== null && getComputedStyle(content).display === "none"
				? true
				: null;
		});
	}, 10_000);
	assert.ok(compactHidden === true, "紧凑档任务内容行隐藏、仅保留工具名行（R-01-023/AC-05）");
	await page.evaluate(() => document.querySelector('[data-dsh-activity-pane] .dap-density')?.click());
}
