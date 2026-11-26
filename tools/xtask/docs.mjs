// docs 检查：架构依赖表 ↔ 真实 import 图、宿主版本矩阵 ↔ 源码注释版本 token、
// RFC 索引 ↔ RFC 文件、roadmap 结构与退役 ID。
import { join } from "node:path";
import {
	ROOT,
	byCodeUnit,
	commentLines,
	isDir,
	isFile,
	listDir,
	readText,
	sectionBody,
	tableRows,
	walkFiles,
} from "./util.mjs";

const ARCH_PATH = "docs/architecture.md";
const COMPAT_PATH = "docs/compatibility.md";
const RFC_DIR = "docs/rfcs";
const ROADMAP_PATH = "docs/roadmap.md";
const RFC_STATUSES = new Set(["Draft", "Accepted", "Rejected", "Replaced"]);

/** 真实 import 图：src/*.mjs → 同目录相对依赖集合；同时返回悬空依赖问题。 */
function realImportGraph() {
	const srcDir = join(ROOT, "src");
	const files = listDir(srcDir, (entry) => entry.isFile() && entry.name.endsWith(".mjs"));
	const graph = new Map();
	const problems = [];
	for (const name of files) {
		const fileKey = `src/${name}`;
		const text = readText(join(srcDir, name));
		const deps = new Set();
		if (text !== null) {
			const patterns = [
				/^\s*import\s+(?:[^"'\n]*?\s+from\s+)?["'](\.\/[^"']+)["']/gm, // 静态 import（单双引号）
				/import\(\s*["'](\.\/[^"']+)["']\s*\)/g, // 动态 import
				/require\(\s*["'](\.\/[^"']+)["']\s*\)/g, // require
			];
			for (const pattern of patterns) {
				for (const match of text.matchAll(pattern)) {
					const relative = match[1].replace(/^\.\//, "").replace(/[?#].*$/, "");
					const target = `src/${relative}`;
					deps.add(target);
					if (!isFile(join(ROOT, target))) problems.push(`${fileKey} 导入了不存在的 ${target}`);
				}
			}
		}
		graph.set(fileKey, deps);
	}
	return { graph, problems };
}

/** 解析 architecture.md 依赖表；返回 {rows: Map<file, Set<dep>>, problems}。 */
function parseDependencyTable() {
	const text = readText(join(ROOT, ARCH_PATH));
	if (text === null) return { missing: true };
	const body = sectionBody(text, "## 分层与依赖");
	if (body === null) return { missingSection: true };
	const rows = new Map();
	const problems = [];
	let dataRows = 0;
	for (const cells of tableRows(body)) {
		dataRows += 1;
		const first = cells[0] ?? "";
		const fileMatch = first.match(/^`(src\/[^`]+\.[cm]?js)`$/);
		if (!fileMatch) {
			problems.push(`行「${first}」第一列不是单个反引号 src/*.mjs`);
			continue;
		}
		const file = fileMatch[1];
		if (rows.has(file)) {
			problems.push(`${file} 出现多行`);
			continue;
		}
		const depCell = (cells[1] ?? "").trim();
		const deps = new Set();
		if (depCell !== "无") {
			for (const raw of depCell.split(/[,，、]/)) {
				const dep = raw.trim();
				if (!dep) continue;
				const depMatch = dep.match(/^`(src\/[^`]+)`$/);
				if (!depMatch) {
					problems.push(`${file} 依赖列「${dep}」不是反引号 src 路径`);
					continue;
				}
				deps.add(depMatch[1]);
			}
		}
		rows.set(file, deps);
	}
	if (dataRows === 0) problems.push("章节内没有表格数据行");
	return { rows, problems };
}

function checkArchitecture(rep) {
	const parsed = parseDependencyTable();
	if (parsed.missing) {
		rep.fail("docs/architecture 依赖表", `${ARCH_PATH} 不存在`);
		return;
	}
	if (parsed.missingSection) {
		rep.fail("docs/architecture 依赖表", `缺少精确标题「## 分层与依赖」`);
		return;
	}
	const { graph, problems } = realImportGraph();
	const allProblems = [...parsed.problems];
	for (const [file, actualDeps] of graph) {
		if (!parsed.rows.has(file)) {
			allProblems.push(`缺行 ${file}`);
			continue;
		}
		const docDeps = parsed.rows.get(file);
		const missing = [...actualDeps].filter((dep) => !docDeps.has(dep)).sort(byCodeUnit);
		const extra = [...docDeps].filter((dep) => !actualDeps.has(dep)).sort(byCodeUnit);
		if (missing.length || extra.length) {
			allProblems.push(`${file}: 文档=[${[...docDeps].sort(byCodeUnit).join(", ") || "无"}] 实际=[${[...actualDeps].sort(byCodeUnit).join(", ") || "无"}]`);
		}
	}
	for (const file of parsed.rows.keys()) {
		if (!graph.has(file)) allProblems.push(`表中有仓库内不存在的 ${file}`);
	}
	if (allProblems.length === 0) {
		const files = [...graph.keys()].sort(byCodeUnit);
		rep.ok("docs/architecture 依赖表", `${files.length} 个模块与真实 import 图一致`);
	} else {
		rep.fail("docs/architecture 依赖表", allProblems.slice(0, 8).join("；"));
	}
}

/** src/** 全部注释里的 0.X.Y 版本 token（广口径）。 */
function commentVersionTokens() {
	const tokens = new Set();
	for (const relative of walkFiles(join(ROOT, "src"))) {
		if (!relative.endsWith(".mjs")) continue;
		const text = readText(join(ROOT, "src", relative));
		if (text === null) continue;
		for (const line of commentLines(text)) {
			for (const match of line.matchAll(/\b0\.\d\.\d\b/g)) tokens.add(match[0]);
		}
	}
	return tokens;
}

function normalizeVersion(cell) {
	let text = cell.trim().replace(/^`|`$/g, "").replace(/^v/i, "");
	if (/^0\.\d$/.test(text)) text = `${text}.0`;
	return /^0\.\d\.\d$/.test(text) ? text : null;
}

function checkCompatibility(rep) {
	const text = readText(join(ROOT, COMPAT_PATH));
	if (text === null) {
		rep.fail("docs/compatibility 宿主矩阵", `${COMPAT_PATH} 不存在`);
		return;
	}
	const body = sectionBody(text, "## 宿主矩阵");
	if (body === null) {
		rep.fail("docs/compatibility 宿主矩阵", "缺少精确标题「## 宿主矩阵」");
		return;
	}
	const docVersions = new Set();
	const problems = [];
	for (const cells of tableRows(body)) {
		const version = normalizeVersion(cells[0] ?? "");
		if (version === null) {
			problems.push(`行「${cells[0] ?? ""}」第一列不是版本号`);
			continue;
		}
		if (docVersions.has(version)) problems.push(`版本 ${version} 出现多行`);
		docVersions.add(version);
	}
	if (docVersions.size === 0) problems.push("章节内没有版本数据行");
	const codeVersions = commentVersionTokens();
	const missing = [...codeVersions].filter((version) => !docVersions.has(version)).sort(byCodeUnit);
	const extra = [...docVersions].filter((version) => !codeVersions.has(version)).sort(byCodeUnit);
	if (missing.length) problems.push(`文档缺少源码注释中的版本：${missing.join(", ")}`);
	if (extra.length) problems.push(`文档多出来源无注释的版本：${extra.join(", ")}`);
	if (problems.length === 0) {
		rep.ok("docs/compatibility 宿主矩阵", `版本集合 {${[...docVersions].sort(byCodeUnit).join(", ")}} 与源码注释一致`);
	} else {
		rep.fail("docs/compatibility 宿主矩阵", problems.slice(0, 8).join("；"));
	}
}

/** 读取 docs/rfcs 下的 RFC 文件（排除 README.md）。 */
function rfcFiles() {
	const dir = join(ROOT, RFC_DIR);
	if (!isDir(dir)) return null;
	return listDir(dir, (entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md");
}

function checkRfcIndex(rep) {
	const files = rfcFiles();
	if (files === null) {
		rep.fail("docs/rfcs 索引", `${RFC_DIR} 不存在`);
		return;
	}
	const readme = readText(join(ROOT, RFC_DIR, "README.md"));
	if (readme === null) {
		rep.fail("docs/rfcs 索引", `${RFC_DIR}/README.md 不存在`);
		return;
	}
	const problems = [];
	const rowFiles = new Map();
	for (const cells of tableRows(readme)) {
		const first = cells[0] ?? "";
		const link = first.match(/\]\(([^)\s]+)\)/);
		const target = link ? link[1].replace(/^\.\//, "") : null;
		const status = (cells[2] ?? "").trim();
		if (!target) {
			problems.push(`表格行「${first}」缺少 RFC 链接`);
			continue;
		}
		const basename = target.split("/").at(-1);
		if (!files.includes(basename)) problems.push(`索引行 ${basename} 没有对应文件`);
		if (rowFiles.has(basename)) problems.push(`${basename} 在索引中重复`);
		if (!RFC_STATUSES.has(status)) problems.push(`${basename} 状态「${status}」非法`);
		rowFiles.set(basename, status);
	}
	for (const file of files) {
		if (!rowFiles.has(file)) problems.push(`文件 ${file} 未进索引`);
	}
	for (const [file, status] of rowFiles) {
		if (!files.includes(file)) continue;
		const text = readText(join(ROOT, RFC_DIR, file));
		if (text === null) continue;
		const declared = text.match(/^状态:\s*(\S+)/m);
		if (!declared) problems.push(`${file} 缺少「状态:」行`);
		else if (declared[1] !== status) problems.push(`${file} 状态 ${declared[1]} ≠ 索引 ${status}`);
		const supersedes = text.match(/^取代:\s*(\d{4})\b/m);
		if (supersedes) {
			const target = files.find((name) => name.startsWith(`${supersedes[1]}-`));
			if (!target) problems.push(`${file} 的 取代: ${supersedes[1]} 目标不存在`);
		}
	}
	if (problems.length === 0) rep.ok("docs/rfcs 索引", `${files.length} 份 RFC 与索引一致`);
	else rep.fail("docs/rfcs 索引", problems.slice(0, 8).join("；"));
}

function checkRoadmap(rep) {
	const text = readText(join(ROOT, ROADMAP_PATH));
	if (text === null) {
		rep.fail("docs/roadmap 结构", `${ROADMAP_PATH} 不存在`);
		return;
	}
	const lines = text.split(/\r?\n/).map((line) => line.trim());
	const required = ["## 愿景", "## 目标", "## 非目标", "## 里程碑"];
	const missing = required.filter((heading) => !lines.includes(heading));
	if (missing.length === 0) rep.ok("docs/roadmap 结构", `四个章节标题齐备`);
	else rep.fail("docs/roadmap 结构", `缺少标题：${missing.join(", ")}`);

	const retired = new Set();
	for (const match of text.matchAll(/\b(?:R-\d{2}-\d{3}|AC-\d{2}|M-\d{3})\b/g)) retired.add(match[0]);
	if (retired.size === 0) rep.ok("docs/roadmap 退役 ID", "不含 R-/AC-/M- 旧编号 token");
	else rep.fail("docs/roadmap 退役 ID", `出现退役 token：${[...retired].sort(byCodeUnit).slice(0, 10).join(", ")}`);
}

export function runDocs(rep) {
	checkArchitecture(rep);
	checkCompatibility(rep);
	checkRfcIndex(rep);
	checkRoadmap(rep);
}

export { realImportGraph, parseDependencyTable, commentVersionTokens };
