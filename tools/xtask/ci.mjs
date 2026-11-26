// ci：权威门禁。GATES 声明顺序、路径条件与执行入口；--fast 只跑快检，
// --list 只打印将跑/跳过的门禁而不执行。
import { runBundle } from "./bundle.mjs";
import { runDocs } from "./docs.mjs";
import { runLists } from "./lists.mjs";
import { runPolicy } from "./policy.mjs";
import { runRatchet } from "./ratchet.mjs";
import { runRelease } from "./release.mjs";
import { runSkills } from "./skills.mjs";
import { runAccept, runE2e, runPerf, runUnit } from "./tests.mjs";
import {
	formatMs,
	git,
	globToRegExp,
	statusEntries,
} from "./util.mjs";

/**
 * 门禁表。字段：
 * - name：子命令名（同时是执行入口）
 * - run：传给该子命令的参数
 * - globs：为空表示不看变更；非空表示仅在变更文件命中任一 glob 时运行
 * - always：true 表示非 --fast 时总是运行（不受 paths 条件约束）
 * - fast：true 表示 --fast 模式也运行
 * - requiresAll：true 表示需要 --all（人工验收）
 * - what：人类可读说明
 */
export const GATES = [
	{
		name: "policy",
		run: ["policy", "--replay"],
		globs: [],
		always: true,
		fast: true,
		what: "提交标题/正文规范、生成物同步、禁止路径，复检 origin/main..HEAD",
	},
	{
		name: "skills",
		run: ["skills"],
		globs: [],
		always: true,
		fast: true,
		what: "技能拓扑、大小、frontmatter、README 索引与路径引用",
	},
	{
		name: "docs",
		run: ["docs"],
		globs: [],
		always: true,
		fast: true,
		what: "架构依赖表、宿主版本矩阵、RFC 索引、roadmap 结构",
	},
	{
		name: "lists",
		run: ["lists"],
		globs: [],
		always: true,
		fast: true,
		what: "只减清单与 package.json files[] 排序、钩子脚本命名",
	},
	{
		name: "ratchet",
		run: ["ratchet"],
		globs: [],
		always: true,
		fast: true,
		what: "只减清单存活、人工验收未过期、bundle 字节预算",
	},
	{
		name: "bundle",
		run: ["bundle", "--check"],
		globs: [],
		always: true,
		fast: true,
		what: "重建 client bundle 并与 Git index 逐字节比较（不落盘）",
	},
	{
		name: "unit",
		run: ["unit"],
		globs: [],
		always: true,
		fast: true,
		what: "scripts/check.mjs 单元与契约断言",
	},
	{
		name: "e2e",
		run: ["e2e"],
		globs: [],
		always: true,
		fast: false,
		what: "27 个 e2e spec（逐 spec 超时）",
	},
	{
		name: "perf",
		run: ["perf"],
		globs: ["src/client.mjs"],
		always: false,
		fast: false,
		what: "渲染进程 A/B 与 tools/ratchet/perf-budget.json 比对",
	},
	{
		name: "release",
		run: ["release"],
		globs: ["package.json"],
		always: false,
		fast: false,
		what: "版本 ↔ 最新 tag、files[] 完整、工作树干净",
	},
	{
		name: "accept",
		run: ["accept"],
		globs: [],
		always: false,
		fast: false,
		requiresAll: true,
		what: "人工验收清单（仅 --all）",
	},
];

const RUNNERS = {
	policy: runPolicy,
	skills: runSkills,
	docs: runDocs,
	lists: runLists,
	ratchet: runRatchet,
	bundle: runBundle,
	unit: runUnit,
	e2e: runE2e,
	perf: runPerf,
	release: runRelease,
	accept: runAccept,
};

/** 基线到 HEAD 的变更文件集合（含工作树未提交改动）；基线不可用返回 null。 */
export function changedFiles(base) {
	const mergeBase = git(["merge-base", base, "HEAD"], { allowFail: true });
	if (mergeBase === null) return null;
	const committed = git(["diff", "--name-only", "-z", `${mergeBase.trim()}..HEAD`], { allowFail: true }) ?? "";
	const changed = new Set(committed.split("\0").filter(Boolean));
	for (const entry of statusEntries()) {
		changed.add(entry.path);
		if (entry.oldPath) changed.add(entry.oldPath);
	}
	return changed;
}

/** 依据变更文件与模式计算每个门禁是否运行。 */
export function decideGates(changed, { fast = false, all = false } = {}) {
	return GATES.map((gate) => {
		let reason = null;
		if (fast && !gate.fast) {
			reason = "--fast 只跑快检（policy/skills/docs/lists/ratchet/bundle/unit）";
		} else if (gate.requiresAll && !all) {
			reason = "需要 --all（人工验收默认不跑）";
		} else if (!gate.always && gate.globs.length > 0) {
			const patterns = gate.globs.map(globToRegExp);
			const hit = [...changed].some((path) => patterns.some((pattern) => pattern.test(path)));
			if (!hit) reason = `无路径变更匹配 ${gate.globs.join(", ")}`;
		}
		return { gate, run: reason === null, reason };
	});
}

function parseArgs(argv) {
	const opts = { fast: false, all: false, list: false, base: "origin/main" };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--fast") opts.fast = true;
		else if (arg === "--all") opts.all = true;
		else if (arg === "--list") opts.list = true;
		else if (arg === "--base") opts.base = argv[(index += 1)] ?? "origin/main";
		else if (arg.startsWith("--base=")) opts.base = arg.slice("--base=".length);
		else throw new Error(`未知参数：${arg}`);
	}
	return opts;
}

function printGateTable(opts, base, changed) {
	console.log(`ci: 基线 ${base}，变更 ${changed.size} 个文件${opts.fast ? "，--fast" : ""}${opts.all ? "，--all" : ""}`);
	console.log("ci: GATES 表（name | run | globs | what）");
	for (const gate of GATES) {
		console.log(`  ${gate.name.padEnd(8)} | ${gate.run.join(" ")} | ${gate.globs.length ? gate.globs.join(",") : "-"} | ${gate.what}`);
	}
}

export async function runCi(rep, argv = []) {
	let opts;
	try {
		opts = parseArgs(argv);
	} catch (error) {
		rep.fail("ci/参数", error.message);
		return;
	}
	const changed = changedFiles(opts.base);
	if (changed === null) {
		rep.fail("ci/基线", `无法计算与 ${opts.base} 的差异（ref 不存在或不是 git 仓库）`);
		return;
	}
	const decisions = decideGates(changed, opts);

	if (opts.list) {
		printGateTable(opts, opts.base, changed);
		console.log("ci: 本轮决策（run / skip，不执行）");
		for (const decision of decisions) {
			if (decision.run) console.log(`  run  ci/${decision.gate.name}: ${decision.gate.what}`);
			else rep.skip(`ci/${decision.gate.name}`, decision.reason);
		}
		return;
	}

	for (const decision of decisions) {
		const { gate } = decision;
		if (!decision.run) {
			rep.skip(`ci/${gate.name}`, decision.reason);
			continue;
		}
		const before = rep.mark();
		const started = Date.now();
		console.log(`run  ci/${gate.name}: ${gate.what}`);
		try {
			await RUNNERS[gate.name](rep, gate.run.slice(1));
		} catch (error) {
			rep.fail(`ci/${gate.name}`, error?.message ?? String(error));
		}
		const after = rep.mark();
		const detail = `${gate.what}（${formatMs(Date.now() - started)}）`;
		if (after.fail > before.fail) rep.fail(`ci/${gate.name}`, detail);
		else rep.ok(`ci/${gate.name}`, detail);
	}
}
