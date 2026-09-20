// R-01-023/AC-01、AC-02、R-01-024/AC-01、AC-02、AC-03 呈现链路（浏览器黄金路径）：
// e2e:job 剧本让引擎真实启动后台任务并读取一次输出——窗格以 job 子卡呈现（与子代理
// 同形）、母卡标题行「后台 ×N」数量注、回合结束后在跑任务期间完成提醒被抑制、点击
// 子卡在卡内展开模型已读输出回放、悬停显示完整命令。
import { openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

const TITLE = "e2e:job 后台任务探针";

export default async function backgroundJobs({ page, url, assert }) {
	await openApp(page, url);
	await sendHeroMessage(page, TITLE);

	// R-01-023/AC-01：在跑后台任务以 job 子卡呈现（跟随母会话、运行点状态）。
	const jobCard = await until("job 子卡呈现", async () => {
		return page.evaluate(() => {
			const job = document.querySelector('[data-dsh-activity-pane] .dap-card[data-kind="job"]');
			if (!job) return null;
			return {
				title: job.querySelector(".dap-title")?.textContent ?? "",
				dotStatus: job.querySelector(".dap-job-dot")?.dataset.status ?? "",
				depth: Number(job.dataset.depth ?? "0"),
				titleAttr: job.getAttribute("title") ?? "",
			};
		});
	}, 30_000);
	assert.ok(jobCard !== null, "在跑后台任务以 job 子卡呈现（R-01-023/AC-01）");
	assert.ok(jobCard.title.includes("e2e-job-tick-start"), "job 子卡标题为命令原文（探针 echo 行在内）");
	assert.ok(jobCard.dotStatus === "running", "job 子卡状态点为运行态");

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

	// R-01-024 呈现细化：悬停 tooltip 承载完整命令原文。
	assert.ok(jobCard.titleAttr.includes("e2e-job-tick-start"), "job 子卡悬停显示完整命令（R-01-024 呈现细化）");

	// R-01-023/AC-02：回合收口（fast）后任务仍在跑——完成提醒被抑制，不出现「已完成」。
	const suppressed = await until("完成提醒抑制观测", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes("e2e:job") ? !regions.active.includes("已完成") : null;
	}, 20_000);
	assert.ok(suppressed === true, "在跑后台任务期间完成提醒被抑制（R-01-023/AC-02）");
}
