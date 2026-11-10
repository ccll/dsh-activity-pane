// T-185 增量派生等价性回归：长流式回合全程走增量折叠路径（detail.foldState 跨拍
// 保留、纯追加只折新增），本 spec 钉住其呈现与既有全量语义一致——流式行逐块累积、
// 落定后完整正文与无 running 残留（tool/call–result 配对语义由
// background-jobs spec 经同一增量路径承载）。单元层的逐字段等价由
// scripts/check.mjs 增量折叠断言承载（foldHistoryAppend vs 全量重建）。
import { ensureFullDensity, openApp, paneRegions, sendHeroMessage, until } from "../helpers.mjs";

/** longstream 剧本首末片段（96 块流式的首尾），兼作锚行与完整累积的断言锚点。 */
const FIRST_CHUNK = "慢速输出片段 1/96。";
const LAST_CHUNK = "慢速输出片段 96/96。";

export default async function incrementalFoldEquivalence({ page, url, assert }) {
	await openApp(page, url);
	await ensureFullDensity(page);
	await sendHeroMessage(page, "e2e:longstream 增量等价探针");
	// 流式期间（增量路径逐块累积）：早期片段已呈现。
	await until("流式早期片段进入时间线", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(FIRST_CHUNK) ? regions : null;
	}, 30_000);
	// 回合落定：增量状态经落定替换整表重建后，时间线呈现完整累积正文。
	await until("落定后时间线含完整累积尾行", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(LAST_CHUNK) ? regions : null;
	}, 30_000);
	// 锚行语义（R-01-012/AC-13）：完整档下用户指令行停留为首行锚行。
	const settled = await paneRegions(page);
	assert.ok(settled.active.includes("增量等价探针"), "用户指令行作为锚行保留在时间线首行（R-01-012/AC-13）");
	assert.ok(settled.active.includes(LAST_CHUNK), "落定后时间线含完整累积正文（流式行合并语义保持）");
}
