// policy 检查：提交标题/正文规范、main 分支保护、生成物与源码同步、
// 禁止路径与新文件退役 ID；--replay 逐个复检 origin/main..HEAD 的提交。
import { basename, isAbsolute, join, resolve } from "node:path";
import {
	ROOT,
	currentBranch,
	git,
	isFile,
	readText,
	statusEntries,
} from "./util.mjs";

const BRANCH_MAIN = "main";
const MAX_TITLE_RUNES = 100;

/** emoji + 中文类型 + (scope): 描述；scope 为小写字母数字连字符。 */
const TITLE_RE = /^(\p{Extended_Pictographic}\uFE0F?) (功能|改进|修复|文档|测试|计划|维护|配置|重构|发布)\(([a-z0-9][a-z0-9-]*)\): (.+)$/u;
const EXCEPTION_PREFIXES = ["Merge ", "Revert ", "fixup! ", "squash! "];
const REQUIRED_HEADINGS = ["原因", "影响", "取舍"];

/** 单个提交信息的校验错误；合规返回 null。 */
function validateMessage(text) {
	const lines = text.split(/\r?\n/);
	const title = (lines[0] ?? "").trim();
	if (EXCEPTION_PREFIXES.some((prefix) => title.startsWith(prefix))) {
		return { exception: true, title };
	}
	const titleMatch = title.match(TITLE_RE);
	if (!titleMatch) {
		return {
			title,
			error: `标题不符合「emoji 中文类型(scope): 描述」（首行：${title || "空"}）`,
		};
	}
	const runes = [...title].length;
	if (runes > MAX_TITLE_RUNES) return { title, error: `标题 ${runes} 字符 > ${MAX_TITLE_RUNES}` };
	const body = lines.slice(1).join("\n");
	const missing = REQUIRED_HEADINGS.filter((heading) => !new RegExp(`^##\\s+${heading}\\s*$`, "m").test(body));
	if (missing.length > 0) return { title, error: `正文缺少标题：${missing.map((heading) => `## ${heading}`).join("、")}` };
	return { title, error: null };
}

function parseArgs(argv) {
	const opts = { replay: false, push: false, message: null, positional: [], base: "origin/main" };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--replay") opts.replay = true;
		else if (arg === "--push") opts.push = true;
		else if (arg === "--message") {
			const value = argv[(index += 1)];
			if (!value) throw new Error("--message 需要一个消息文件路径");
			opts.message = value;
		}
		else if (arg === "--base") opts.base = argv[(index += 1)] ?? "origin/main";
		else if (arg.startsWith("-")) throw new Error(`未知参数：${arg}`);
		else opts.positional.push(arg);
	}
	return opts;
}

/** 校验一组提交信息，逐条打印。 */
function checkMessages(rep, messages) {
	for (const { label, text } of messages) {
		const result = validateMessage(text);
		if (result.exception) {
			rep.skip(`policy/提交信息 ${label}`, `例外提交（Merge/Revert/fixup/squash）`);
			continue;
		}
		if (result.error) rep.fail(`policy/提交信息 ${label}`, result.error);
		else rep.ok(`policy/提交信息 ${label}`, `标题/正文合规：${result.title}`);
	}
}

/** --replay：复检 origin/main..HEAD 的每个 outgoing commit。 */
function replayMessages(rep, base) {
	const commits = git(["rev-list", "--reverse", `${base}..HEAD`], { allowFail: true });
	if (commits === null) {
		rep.fail("policy/--replay", `无法计算 ${base}..HEAD（基 ref 不存在？）`);
		return;
	}
	const list = commits.split(/\s+/).filter(Boolean);
	if (list.length === 0) {
		rep.ok("policy/--replay", `无 outgoing commit（${base}..HEAD 为空）`);
		return;
	}
	for (const commit of list) {
		const message = git(["log", "-1", "--format=%B", commit], { allowFail: true });
		if (message === null) {
			rep.fail(`policy/提交信息 ${commit.slice(0, 8)}`, "无法读取提交信息");
			continue;
		}
		const result = validateMessage(message);
		if (result.exception) {
			rep.skip(`policy/提交信息 ${commit.slice(0, 8)}`, "例外提交（Merge/Revert/fixup/squash）");
			continue;
		}
		if (result.error) rep.fail(`policy/提交信息 ${commit.slice(0, 8)}`, result.error);
		else rep.ok(`policy/提交信息 ${commit.slice(0, 8)}`, `标题/正文合规：${result.title}`);
	}
}

/** 生成物 .dsh-plugin/client.js 改动但 src/** 未改动：必须重跑 bundle。 */
function checkGeneratedSync(rep) {
	const entries = statusEntries();
	const clientChanged = entries.some(
		(entry) => entry.path === ".dsh-plugin/client.js" || entry.oldPath === ".dsh-plugin/client.js",
	);
	const srcChanged = entries.some(
		(entry) => entry.path.startsWith("src/") || entry.oldPath?.startsWith("src/"),
	);
	if (clientChanged && !srcChanged) {
		rep.fail(
			"policy/生成物",
			"只改了 .dsh-plugin/client.js 而 src/** 无改动；请用 `node tools/xtask.mjs bundle` 重建并同提交源码",
		);
	} else if (clientChanged) {
		rep.ok("policy/生成物", ".dsh-plugin/client.js 与 src/** 同批改动");
	} else {
		rep.ok("policy/生成物", "生成物未改动");
	}
}

/** 旧层是否已迁出（PRD/SOLUTION/DOMAIN 不再被跟踪）；未落地时禁止路径检查 skip。 */
function migrationLanded(tracked) {
	const legacy = ["PRD.md", "SOLUTION.md", "DOMAIN.md"];
	return !legacy.some((path) => tracked.includes(path));
}

const FORBIDDEN_TRACKED = [
	{ label: "tmp-*", test: (path) => /^tmp-/.test(path) },
	{ label: ".chrome-debug*", test: (path) => /^\.chrome-debug/.test(path) },
	{ label: "tasks/", test: (path) => /^tasks\//.test(path) },
	{ label: "PRD.md", test: (path) => path === "PRD.md" },
	{ label: "SOLUTION.md", test: (path) => path === "SOLUTION.md" },
	{ label: "DOMAIN.md", test: (path) => path === "DOMAIN.md" },
	{ label: "CONVENTIONS.md", test: (path) => path === "CONVENTIONS.md" },
	{ label: "RATIONALE/", test: (path) => /^RATIONALE\//.test(path) },
	{ label: "receipts/", test: (path) => /^receipts\//.test(path) },
];

function checkForbiddenPaths(rep) {
	const trackedText = git(["ls-files"], { allowFail: true });
	if (trackedText === null) {
		rep.fail("policy/禁止路径", "无法读取 git index");
		return;
	}
	const tracked = trackedText.split(/\r?\n/).filter(Boolean);
	if (!migrationLanded(tracked)) {
		rep.skip("policy/禁止路径", "旧层尚未迁出（PRD/SOLUTION/DOMAIN 仍在跟踪），迁移落地后生效");
		rep.skip("policy/退役 ID", "旧层尚未迁出，迁移落地后生效");
		return;
	}
	const offenders = tracked.filter((path) => FORBIDDEN_TRACKED.some((rule) => rule.test(path)));
	if (offenders.length === 0) rep.ok("policy/禁止路径", "无禁止跟踪路径");
	else rep.fail("policy/禁止路径", offenders.slice(0, 8).join("、") + (offenders.length > 8 ? `（共 ${offenders.length}）` : ""));

	// 新文件不得重新引入退役 ID。历史档案层（决策与工作史）按定义引用旧编号，豁免。
	const newFiles = statusEntries()
		.filter((entry) => entry.status.includes("A") || entry.status === "??")
		.map((entry) => entry.path)
		.filter((path) => !path.startsWith("docs/decisions/") && !path.startsWith("docs/archive/"));
	const offendersByToken = [];
	for (const path of newFiles) {
		const absolute = join(ROOT, path);
		if (!isFile(absolute)) continue;
		const text = readText(absolute);
		if (text === null) continue;
		const match = text.match(/\b(?:AC-\d{2}|R-\d{2}-\d{3})\b/);
		if (match) offendersByToken.push(`${path}（${match[0]}）`);
	}
	if (offendersByToken.length === 0) rep.ok("policy/退役 ID", "新文件不含 AC-/R- 退役编号");
	else rep.fail("policy/退役 ID", offendersByToken.slice(0, 8).join("、"));
}

export function runPolicy(rep, argv = []) {
	let opts;
	try {
		opts = parseArgs(argv);
	} catch (error) {
		rep.fail("policy/参数", error.message);
		return;
	}

	// 分支保护：仅 --push（pre-push）时禁止 main。
	if (opts.push) {
		const branch = currentBranch();
		if (branch === BRANCH_MAIN) rep.fail("policy/分支", "禁止直接推送 main；请走 claim/<issue>-<slug> 分支与 PR");
		else rep.ok("policy/分支", `当前分支 ${branch}，允许推送`);
	}

	// 提交信息：--message <path> / 位置参数 / --replay。
	if (opts.replay) {
		replayMessages(rep, opts.base);
	} else {
		const path = opts.message ?? opts.positional[0] ?? null;
		if (path === null) {
			rep.skip("policy/提交信息", "无消息来源（pre-commit 树检查模式；commit-msg 用 --message <path>）");
		} else {
			// 消息文件按仓库根解析：钩子以仓库根为 cwd 传入 .git/COMMIT_EDITMSG，行为一致。
			const absolute = isAbsolute(path) ? path : resolve(ROOT, path);
			const text = readText(absolute);
			if (text === null) {
				rep.fail("policy/提交信息", `无法读取消息文件：${path}`);
			} else {
				const label = basename(path);
				checkMessages(rep, [{ label, text }]);
			}
		}
	}

	checkGeneratedSync(rep);
	checkForbiddenPaths(rep);
}

export { validateMessage, migrationLanded };
