// R-01-020/AC-01、R-01-020/AC-03、R-01-020/AC-05
// 懒回填 GET 与 SSE 全量快照的竞态契约（T-175 复盘发现的 flake 根因，见 tasks/T-175）：
// ① 场景 1——回填响应可能先于宿主登记 turn/start 发出（卡片渲染早于登记）、迟到落地；
//    若客户端仍对该响应用全量应用（clear + 重放），陈旧空快照会清除既有 busy 记录、
//    运行卡标题行累计运行时长在回合中段消失。修复后按 id 只补缺，标签持续可见。
//    时序必须主动构造、不依赖机器快慢：CI 快机器上 SSE 会在首帧渲染前应用 turn-start，
//    使回填 GET 因 busyById 已有记录而不发、用例空转（2026-10-20 CI run 39384759978）。
//    构造：先扣住 /busy/stream 连接（扣住的是请求发起时机，route.fallback 原样放行、
//    不缓冲 SSE 流），保证卡片首帧渲染时 busyById 必为空 → 回填 GET 结构性必发；
//    发送消息后放行 SSE，hello 全量快照（含运行中回合的 openTurnStart）填充记录并驱动
//    标签首现；被延迟的空快照 {} 落在填充与回合结束（e2e:slow ~3.6s）之后，采样断言
//    标签在整窗持续可见（修复前整快照替换会擦除至窗尾且无后续广播可恢复）。
// ② 场景 2——SSE 不可用（连接被拒）时，GET 回填数据仍能填充缺失会话的 busy 记录：
//    新页面拒绝 /busy/stream，把 /busy GET 合成为含 openTurnStart（2s 前）的快照，
//    断言累计运行时长仍出现并走字（降级路径可用，applyBusyBackfill 真正生效）。

import { ensureFullDensity, openApp, sendHeroMessage, until } from "../helpers.mjs";

const STUB_DELAY_MS = 4000;
const SAMPLE_INTERVAL_MS = 150;
const SAMPLE_WINDOW_MS = 6000;
// 渲染抖动容忍：连续缺席超过 2 个采样周期即视为消失（旧全量应用语义会把陈旧空快照
// 落地后的标签擦到采样窗尾——回合已收口、无后续广播恢复，缺席 ~10 个周期）。
const MAX_MISSING_SAMPLES = 2;

function busyLabelProbe(page, title) {
	return page.evaluate((probeTitle) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const card = [...(pane?.querySelectorAll('[role="button"]') ?? [])].find((candidate) => candidate.innerText.includes(probeTitle));
		const total = card?.querySelector(".dap-total-time");
		if (!total || total.hidden) return null;
		const text = total.textContent.trim();
		return /^\d+(s|m\d+s|h\d+m\d+s)$/.test(text) ? text : null;
	}, title);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function busyBackfillRace({ page, url, assert }) {
	// ---- 场景 1：陈旧空快照迟到，不得清除运行中的累计时长（R-01-020/AC-03） ----
	// 先扣住 /busy/stream（连接发起被延迟，放行后原样透传，SSE 流不被缓冲），
	// 再把 /busy GET 延迟返回空快照 {}。
	let stubbedGets = 0;
	let releaseStream = () => {};
	const streamReleased = new Promise((resolve) => {
		releaseStream = resolve;
	});
	await page.route(/\/dsh-activity-pane\/api\/busy\/stream/, async (route) => {
		await streamReleased;
		return route.fallback();
	});
	await page.route(/\/dsh-activity-pane\/api\/busy\?/, (route) => {
		stubbedGets += 1;
		const body = JSON.stringify({});
		return new Promise((resolve) => setTimeout(() => resolve(route.fulfill({ status: 200, contentType: "application/json", body })), STUB_DELAY_MS));
	});

	await openApp(page, url);
	await ensureFullDensity(page);
	const TITLE = "e2e:slow 累计时长回填竞态探针";
	await sendHeroMessage(page, TITLE);

	// SSE 被扣住期间 busyById 必空：回填 GET 在卡片首帧渲染时结构性发出。
	await until("回填 GET 在 SSE 扣流期间发出", () => (stubbedGets >= 1 ? "yes" : null), 5000);
	// 放行 SSE：连接建立即收全量快照（含运行中回合），记录填充、标签首现。
	releaseStream();
	const firstText = await until("运行卡标题行出现累计运行时长", () => busyLabelProbe(page, TITLE));
	assert.ok(/^\d+s$/.test(firstText), `首现即实时秒读（R-01-020/AC-01，实际：${firstText}）`);

	// 首现后连续采样 6s：标签只允许极短渲染抖动，不得出现成段消失（AC-03 竞态契约）。
	let samples = 0;
	let missing = 0;
	let currentStreak = 0;
	let maxMissingStreak = 0;
	let lastText = firstText;
	for (let elapsed = 0; elapsed < SAMPLE_WINDOW_MS; elapsed += SAMPLE_INTERVAL_MS) {
		const text = await busyLabelProbe(page, TITLE);
		samples += 1;
		if (text === null) {
			missing += 1;
			currentStreak += 1;
			maxMissingStreak = Math.max(maxMissingStreak, currentStreak);
		} else {
			currentStreak = 0;
			lastText = text;
		}
		await sleep(SAMPLE_INTERVAL_MS);
	}
	assert.ok(
		stubbedGets >= 1,
		"延迟空快照的回填 GET 确实发生（避免用例空转）",
	);
	assert.ok(
		missing <= MAX_MISSING_SAMPLES,
		`累计运行时长在回填响应落地后持续可见，成段消失不超过 ${MAX_MISSING_SAMPLES} 个采样周期（R-01-020/AC-03，样本 ${samples} 缺席 ${missing}，最后读数：${lastText}）`,
	);

	// ---- 场景 2：SSE 不可用时 GET 回填仍填充缺失会话（R-01-020/AC-05） ----
	// 同 context 第二页 goto 会因宿主应用的多页持久连接卡 networkidle 超时（实测），
	// 必须开新 context 做页面隔离；断言 SSE 连接被拒后 GET 回填数据仍被应用。
	const page2 = await page.context().browser().newContext().then((context) => context.newPage());
	let backfillGets = 0;
	await page2.route(/\/dsh-activity-pane\/api\/busy\/stream/, (route) => route.abort());
	await page2.route(/\/dsh-activity-pane\/api\/busy\?/, (route) => {
		backfillGets += 1;
		const state = {};
		for (const id of (new URL(route.request().url()).searchParams.get("ids") ?? "").split(",").filter(Boolean)) {
			state[id] = { busyMs: null, openTurnStart: Date.now() - 2000, waitedMs: null, openWaitStart: null };
		}
		return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
	});

	const TITLE2 = "e2e:slow 回填降级填充探针";
	await openApp(page2, url);
	await ensureFullDensity(page2);
	await sendHeroMessage(page2, TITLE2);

	// SSE 拒连后无广播可用，标签出现即证明 GET 回填数据被应用（applyBusyBackfill 生效）。
	const downgradedText = await until("SSE 不可用时 GET 回填仍驱动累计运行时长显示", () => busyLabelProbe(page2, TITLE2), 15_000);
	assert.ok(/^\d+s$/.test(downgradedText), `降级路径显示实时秒读（R-01-020/AC-05，实际：${downgradedText}）`);

	// 持续走字：0.9s 后仍可见且读数严格递增（排除一次性渲染的巧合）。
	await sleep(900);
	const laterText = await busyLabelProbe(page2, TITLE2);
	assert.ok(backfillGets >= 1, "SSE 拒连后回填 GET 确实发生（路由失配会使降级验证空转）");
	const firstSeconds = Number.parseInt(downgradedText, 10);
	const laterSeconds = laterText === null ? 0 : Number.parseInt(laterText, 10);
	assert.ok(
		laterText !== null && /^\d+s$/.test(laterText) && laterSeconds > firstSeconds,
		`降级路径读数持续在场且单调递增（R-01-020/AC-05，${downgradedText} → ${laterText}）`,
	);
	await page2.close();
}
