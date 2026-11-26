// 长跑测试入口：unit（scripts/check.mjs）、e2e（逐 spec 超时/shards）、
// accept（人工清单）、perf（A/B 与预算比对）。
import { join } from "node:path";
import {
	ROOT,
	failureReason,
	formatMs,
	isDir,
	listDir,
	readText,
	runNodeScript,
} from "./util.mjs";

const UNIT_TIMEOUT_MS = 900_000;
const E2E_DEFAULT_TIMEOUT_MS = 240_000;
const ACCEPT_TIMEOUT_MS = 120_000;
const PERF_TIMEOUT_MS = 1_800_000;
const PERF_BUDGET_REL = "tools/ratchet/perf-budget.json";

export async function runUnit(rep) {
	const result = await runNodeScript("scripts/check.mjs", [], { timeoutMs: UNIT_TIMEOUT_MS });
	if (result.code === 0) {
		rep.ok("unit/check", `scripts/check.mjs 全部断言通过（${formatMs(result.ms)}）`);
	} else {
		rep.fail(
			"unit/check",
			`${result.timedOut ? "超时 " : ""}退出 ${result.code}（${formatMs(result.ms)}）：${failureReason(result)}`,
		);
	}
}

/** 解析 e2e 参数：--shard i/n、--timeout ms、位置参数为 spec 名。 */
function parseE2eArgs(argv) {
	const opts = { shard: null, timeoutMs: E2E_DEFAULT_TIMEOUT_MS, specs: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--shard") opts.shard = argv[(index += 1)] ?? null;
		else if (arg.startsWith("--shard=")) opts.shard = arg.slice("--shard=".length);
		else if (arg === "--timeout") opts.timeoutMs = Number(argv[(index += 1)]);
		else if (arg.startsWith("--timeout=")) opts.timeoutMs = Number(arg.slice("--timeout=".length));
		else if (arg.startsWith("-")) throw new Error(`未知参数：${arg}`);
		else opts.specs.push(arg.replace(/\.mjs$/, ""));
	}
	if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw new Error("--timeout 需为正数毫秒");
	if (opts.shard !== null) {
		const match = /^(\d+)\/(\d+)$/.exec(opts.shard);
		if (!match) throw new Error(`--shard 需为 i/n（收到 ${opts.shard}）`);
		const shardIndex = Number(match[1]);
		const shardTotal = Number(match[2]);
		if (shardTotal < 1 || shardIndex < 1 || shardIndex > shardTotal) {
			throw new Error(`--shard 越界：${opts.shard}`);
		}
		opts.shard = { index: shardIndex, total: shardTotal };
	}
	return opts;
}

function specNames() {
	if (!isDir(join(ROOT, "e2e/specs"))) return [];
	return listDir(join(ROOT, "e2e/specs"), (entry) => entry.isFile() && entry.name.endsWith(".mjs"))
		.map((name) => name.slice(0, -4));
}

function failScreenshots() {
	if (!isDir(join(ROOT, "e2e"))) return new Set();
	return new Set(listDir(join(ROOT, "e2e"), (entry) => /^fail-.*\.png$/.test(entry.name)));
}

export async function runE2e(rep, argv = []) {
	let opts;
	try {
		opts = parseE2eArgs(argv);
	} catch (error) {
		rep.fail("e2e/参数", error.message);
		return;
	}
	const all = specNames();
	if (all.length === 0) {
		rep.fail("e2e/specs", "e2e/specs 下没有 .mjs spec");
		return;
	}
	let selected;
	if (opts.specs.length > 0) {
		const missing = opts.specs.filter((spec) => !all.includes(spec));
		if (missing.length > 0) {
			rep.fail("e2e/参数", `未知 spec：${missing.join(", ")}`);
			return;
		}
		selected = all.filter((spec) => opts.specs.includes(spec));
	} else {
		selected = all;
	}
	if (opts.shard) {
		// 轮转分片：第 i/n 片取 sortedSpecs 中下标 % n === i-1 的 spec。
		selected = selected.filter((_, index) => index % opts.shard.total === opts.shard.index - 1);
	}
	if (selected.length === 0) {
		rep.skip("e2e", "该分片没有 spec");
		return;
	}

	const before = failScreenshots();
	let failed = 0;
	for (const spec of selected) {
		const result = await runNodeScript("e2e/run.mjs", [spec], { timeoutMs: opts.timeoutMs });
		if (result.code === 0) {
			if (/SKIP/.test(`${result.stderr}\n${result.stdout}`)) {
				rep.skip(`e2e/${spec}`, `环境缺席 SKIP（${formatMs(result.ms)}）`);
			} else {
				rep.ok(`e2e/${spec}`, `通过（${formatMs(result.ms)}）`);
			}
		} else {
			failed += 1;
			rep.fail(
				`e2e/${spec}`,
				`${result.timedOut ? `超过 ${formatMs(opts.timeoutMs)} 超时` : `退出 ${result.code}`}（${formatMs(result.ms)}）：${failureReason(result)}`,
			);
		}
	}

	const after = failScreenshots();
	const appeared = [...after].filter((name) => !before.has(name));
	if (appeared.length === 0) {
		rep.ok("e2e/截图残留", "运行期间未新增 e2e/fail-*.png");
	} else {
		rep.fail("e2e/截图残留", `运行期间新增失败截图：${appeared.join(", ")}`);
	}
}

export async function runAccept(rep) {
	const result = await runNodeScript("scripts/acceptance.mjs", [], { timeoutMs: ACCEPT_TIMEOUT_MS });
	if (result.code !== 0) {
		rep.fail("accept", `${result.timedOut ? "超时 " : ""}退出 ${result.code}：${failureReason(result)}`);
		return;
	}
	const steps = (result.stdout.match(/^\d+\.\s/gm) ?? []).length;
	rep.ok("accept", `人工验收清单打印 ${steps} 步（${formatMs(result.ms)}）`);
}

export async function runPerf(rep) {
	const budgetText = readText(join(ROOT, PERF_BUDGET_REL));
	if (budgetText === null) {
		rep.skip("perf", `无 ${PERF_BUDGET_REL}（还没有性能基线），跳过`);
		return;
	}
	let budget;
	try {
		budget = JSON.parse(budgetText);
	} catch (error) {
		rep.fail("perf", `${PERF_BUDGET_REL} 无法解析：${error.message}`);
		return;
	}
	const threshold = budget.threshold ?? budget.maxFoldSamplesRatio ?? 1.2;
	if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) {
		rep.fail("perf", `${PERF_BUDGET_REL} 缺少正数 threshold/maxFoldSamplesRatio`);
		return;
	}
	const args = ["--check", "--threshold", String(threshold)];
	if (Number.isInteger(budget.iterations)) args.push("--iterations", String(budget.iterations));
	if (Number.isInteger(budget.fill)) args.push("--fill", String(budget.fill));
	const result = await runNodeScript("scripts/perf-ab.mjs", args, { timeoutMs: PERF_TIMEOUT_MS });
	if (result.code === 0) {
		rep.ok("perf", `A/B 折叠采样比值 ≤ ${threshold}（${formatMs(result.ms)}）`);
	} else {
		rep.fail(
			"perf",
			`${result.timedOut ? "超时 " : ""}超出预算或测量失败（退出 ${result.code}）：${failureReason(result)}`,
		);
	}
}
