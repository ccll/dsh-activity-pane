// xtask 共享工具：报告器、git/文件访问、Markdown 表格解析、子进程与错误格式化。
// 纪律：所有检查都不许因缺文件抛栈，调用方 catch 后落成一条 fail 行。
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 全部 xtask 子命令名（skills 检查与 dispatcher 共用）。 */
export const SUBCOMMANDS = [
	"skills", "docs", "lists", "policy", "ratchet", "bundle",
	"unit", "e2e", "accept", "perf", "release", "ci",
];

/** 仓库根：本文件位于 <root>/tools/xtask/。 */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** 逐条打印 ok/fail/skip 行，末尾打印汇总；不抛异常。 */
export class Reporter {
	constructor(name) {
		this.name = name;
		this.counts = { ok: 0, fail: 0, skip: 0 };
		this.t0 = Date.now();
	}

	#emit(kind, label, reason) {
		this.counts[kind] += 1;
		const text = reason ? `${label}: ${reason}` : label;
		console.log(`${kind.padEnd(4)} ${text}`);
	}

	ok(label, reason) {
		this.#emit("ok", label, reason);
	}

	fail(label, reason) {
		this.#emit("fail", label, reason);
	}

	skip(label, reason) {
		this.#emit("skip", label, reason);
	}

	/** 计数快照，供 ci 判断某个门禁是否新增失败。 */
	mark() {
		return { ...this.counts };
	}

	exitCode() {
		return this.counts.fail > 0 ? 1 : 0;
	}

	summary() {
		const ms = Date.now() - this.t0;
		const code = this.exitCode();
		console.log(
			`${this.name}: ${this.counts.ok} ok, ${this.counts.fail} fail, ${this.counts.skip} skip（${formatMs(ms)}）`,
		);
		return code;
	}
}

/** git 调用；失败默认抛 Error（调用方落 fail 行），allowFail 时返回 null。 */
export function git(args, { allowFail = false, input, cwd = ROOT } = {}) {
	const res = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 128 * 1024 * 1024,
		input,
	});
	if (res.error) {
		if (allowFail) return null;
		throw new Error(`git ${args.join(" ")} 无法执行：${res.error.message}`);
	}
	if (res.status !== 0) {
		if (allowFail) return null;
		throw new Error(`git ${args.join(" ")} 退出 ${res.status}：${tailLines(res.stderr || res.stdout, 3)}`);
	}
	return res.stdout ?? "";
}

/** git 调用返回原始字节（用于逐字节比较生成物）；失败返回 null。 */
export function gitBytes(args, { cwd = ROOT } = {}) {
	const res = spawnSync("git", args, { cwd, maxBuffer: 128 * 1024 * 1024 });
	if (res.error || res.status !== 0) return null;
	return res.stdout;
}

/** git 调用的文本结果；失败时返回空串（用于只读探测）。 */
export function gitOrEmpty(args) {
	return git(args, { allowFail: true }) ?? "";
}

/** 读取文本；不存在返回 null。 */
export function readText(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

/** 读取字节；不存在返回 null。 */
export function readBytes(path) {
	try {
		return readFileSync(path);
	} catch {
		return null;
	}
}

export function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

export function isDir(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export function pathExists(path) {
	return existsSync(path);
}

/** 列目录（不存在返回空数组），按码位排序。 */
export function listDir(dir, predicate = () => true) {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => predicate(entry))
			.map((entry) => entry.name)
			.sort(byCodeUnit);
	} catch {
		return [];
	}
}

/** 递归列出目录下文件相对路径；跳过 node_modules/.git/缓存。 */
export function walkFiles(dir, { skip = [] } = {}) {
	const out = [];
	const ignored = new Set(["node_modules", ".git", ".cache", ".dsh_better_edit", ".staging", "__pycache__", ...skip]);
	const visit = (absolute, prefix) => {
		for (const entry of listDir(absolute, (item) => !ignored.has(item.name))) {
			const nextAbsolute = join(absolute, entry);
			const nextPrefix = prefix ? `${prefix}/${entry}` : entry;
			if (isDir(nextAbsolute)) visit(nextAbsolute, nextPrefix);
			else out.push(nextPrefix);
		}
	};
	visit(dir, "");
	return out;
}

/** 码位字典序比较（等价 LC_ALL=C 对 ASCII 的排序）。 */
export function byCodeUnit(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** 取若干行拼成单行报告文本。 */
export function tailLines(text, count = 3) {
	if (typeof text !== "string") return "";
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(-count)
		.join(" / ");
}

/** 失败原因：优先取断言/错误行，超长截断。 */
export function failureReason(result, limit = 400) {
	const text = `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`;
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const preferred =
		[...lines].reverse().find((line) => /AssertionError|Error:|FAIL|失败|error/i.test(line)) ??
		lines.at(-1) ??
		"无输出";
	return preferred.length > limit ? `${preferred.slice(0, limit)}…` : preferred;
}

export function formatMs(ms) {
	if (ms < 1000) return `${ms}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	return `${Math.floor(seconds / 60)}m${(seconds % 60).toFixed(0)}s`;
}

/** 今天（本地时区）的 YYYY-MM-DD。 */
export function todayISO() {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 运行 node 子进程（带超时与输出捕获）。 */
export function runNode(args, { timeoutMs = 300_000, cwd = ROOT, env = {} } = {}) {
	return new Promise((resolvePromise) => {
		const started = Date.now();
		const child = spawn(process.execPath, args, {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		const settle = (code, signal, error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolvePromise({
				code: timedOut ? 124 : (code ?? 1),
				signal,
				timedOut,
				stdout,
				stderr,
				ms: Date.now() - started,
				error,
			});
		};
		child.on("error", (error) => settle(1, null, error));
		child.on("close", (code, signal) => settle(code, signal));
	});
}

/** 运行 node 脚本（相对仓库根），返回 runNode 结果。 */
export function runNodeScript(script, args = [], options = {}) {
	return runNode([join(ROOT, script), ...args], options);
}

/** 把标题行（含）后的章节正文取出来；stopAtLevel2=true 时到下一个 H1/H2 为止。 */
export function sectionBody(text, heading, { stopAtLevel2 = true } = {}) {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() === heading.trim());
	if (start === -1) return null;
	const body = [];
	for (const line of lines.slice(start + 1)) {
		if (stopAtLevel2 ? /^#{1,2}\s/.test(line) : /^#\s/.test(line)) break;
		body.push(line);
	}
	return body.join("\n");
}

/** 取 Markdown 表格数据行（跳过表头行与分隔行）；返回单元格数组。 */
export function tableRows(body) {
	if (!body) return [];
	const rows = [];
	let skippedHeader = false;
	for (const raw of body.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line.startsWith("|")) continue;
		const cells = splitTableRow(line);
		if (cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === "")) continue;
		if (!skippedHeader) {
			skippedHeader = true;
			continue;
		}
		rows.push(cells);
	}
	return rows;
}

/** 拆分 Markdown 表格行：去掉首尾竖线后按未转义竖线切分并 trim。 */
export function splitTableRow(line) {
	let text = line.trim();
	if (text.startsWith("|")) text = text.slice(1);
	if (text.endsWith("|")) text = text.slice(0, -1);
	const cells = [];
	let current = "";
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === "\\" && text[index + 1] === "|") {
			current += "|";
			index += 1;
			continue;
		}
		if (char === "|") {
			cells.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	cells.push(current.trim());
	return cells;
}

/** 源码注释行文本（行首 // 或块注释 * 行）；用于版本 token 提取。 */
export function commentLines(text) {
	return text
		.split(/\r?\n/)
		.filter((line) => /^\s*(\/\/|\*|\/\*)/.test(line));
}

/** 反引号包裹的 token。 */
export function backtickTokens(text) {
	const tokens = [];
	for (const match of text.matchAll(/`([^`\n]+)`/g)) tokens.push(match[1].trim());
	return tokens;
}

/** 简单 glob → RegExp：`**` 匹配任意层，`*` 不跨 `/`。 */
export function globToRegExp(pattern) {
	let source = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === "*") {
			if (pattern[index + 1] === "*") {
				source += ".*";
				index += 1;
			} else {
				source += "[^/]*";
			}
		} else if ("\\^$.|?+()[]{}".includes(char)) {
			source += `\\${char}`;
		} else {
			source += char;
		}
	}
	return new RegExp(`^${source}$`);
}

/** 当前分支名；detached 时返回 HEAD。 */
export function currentBranch() {
	return gitOrEmpty(["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "HEAD";
}

/** porcelain 状态行解析成 {status, path, oldPath}；-z 格式。 */
export function statusEntries() {
	const raw = gitOrEmpty(["status", "--porcelain", "-z"]);
	const entries = [];
	const parts = raw.split("\0");
	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		if (!part) continue;
		const status = part.slice(0, 2);
		const path = part.slice(3);
		let oldPath = null;
		if (status.includes("R") || status.includes("C")) {
			oldPath = parts[index + 1] ?? null;
			index += 1;
		}
		entries.push({ status, path, oldPath });
	}
	return entries;
}

/** 写文件（UTF-8）。 */
export function writeText(path, text) {
	writeFileSync(path, text, "utf8");
}

/** 仓库相对路径。 */
export function repoRelative(absolute) {
	return relative(ROOT, absolute).split("\\").join("/");
}
