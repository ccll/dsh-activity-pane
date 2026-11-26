// skills 检查：技能层拓扑（AGENTS.md 路由 ↔ 目录）、大小、frontmatter、
// README 索引、文档内路径与命令引用、.claude/skills 符号链接。
import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
	ROOT,
	SUBCOMMANDS,
	backtickTokens,
	byCodeUnit,
	isDir,
	isFile,
	readText,
	tableRows,
} from "./util.mjs";

const SKILLS_DIR = ".agents/skills";
const AGENTS_LIMIT = 5600;
const SKILL_LIMIT = 3600;
/** pnpm 内建子命令不要求出现在 package.json scripts。 */
const PNPM_BUILTIN = new Set([
	"add", "audit", "bin", "config", "create", "dedupe", "deploy", "dlx", "doctor", "env",
	"exec", "fetch", "help", "i", "import", "init", "install", "install-test", "licenses",
	"link", "list", "ls", "outdated", "pack", "patch", "patch-commit", "prune", "publish",
	"rebuild", "recursive", "remove", "rm", "root", "run", "server", "setup", "store",
	"uninstall", "unlink", "up", "update", "why", "workspace",
]);

/** 含 SKILL.md 的技能目录名集合；目录不存在返回 null。 */
function skillSlugs() {
	const base = join(ROOT, SKILLS_DIR);
	if (!isDir(base)) return null;
	let names = [];
	try {
		names = readdirSync(base).sort(byCodeUnit);
	} catch {
		return null;
	}
	const slugs = names.filter((name) => isDir(join(base, name)) && isFile(join(base, name, "SKILL.md")));
	return new Set(slugs);
}

/** AGENTS.md 路由声明的技能 slug（反引号路径与 Markdown 链接两种写法）。 */
function routerSlugs(agentsText) {
	const slugs = new Set();
	for (const token of backtickTokens(agentsText)) {
		const match = token.match(/^\.agents\/skills\/([^/`]+)\/SKILL\.md$/);
		if (match) slugs.add(match[1]);
	}
	for (const match of agentsText.matchAll(/\.agents\/skills\/([^/`\s)]+)\/SKILL\.md/g)) {
		slugs.add(match[1]);
	}
	return slugs;
}

/** frontmatter 简易解析：返回 Map 或 null（缺失/未闭合）。 */
function parseFrontmatter(text) {
	const lines = text.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return null;
	const fields = new Map();
	for (const line of lines.slice(1)) {
		if (line.trim() === "---") return fields;
		const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (match) fields.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
	}
	return null;
}

/** 反引号 token 是否像仓库相对路径；是则返回清理后的路径，否则 null。 */
function candidateRepoPath(token) {
	let text = token.trim();
	if (!text) return null;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null; // URL
	if (/[<>*{}]/.test(text)) return null; // 占位符/派生模板/glob
	if (/\s/.test(text)) return null; // 命令行而非单路径
	if (text.startsWith("~") || text.startsWith("-") || text.startsWith("@")) return null;
	// 规范模板占位（非真实路径）：N/A、path.md、NN-name.sh、T-nnn-slug.md 等。
	if (/^N\/A$/.test(text) || /^path\.md$/.test(text)) return null;
	if (/(?:^|[-/])(?:NN|nnn)(?:[-./]|$)/.test(text)) return null;
	text = text.replace(/#[^/]*$/, ""); // 锚点
	text = text.replace(/:\d+(?:-\d+)?$/, ""); // path:NN / path:NN-MM
	text = text.replace(/^["']|["']$/g, "");
	if (!text) return null;
	if (text.startsWith("/")) text = text.slice(1);
	const first = text.split("/")[0];
	if (["origin", "refs", "remotes"].includes(first) || text.includes("..")) return null;
	if (!text.includes("/") && !/\.(mjs|cjs|js|mts|ts|json|md|txt|sh|yml|yaml|jsx|css)$/i.test(text)) return null;
	return text;
}

/** 被引用的文档集合：AGENTS.md + 每份 SKILL.md。 */
function citedDocs(agentsText, slugs) {
	const docs = [];
	if (agentsText !== null) docs.push({ label: "AGENTS.md", text: agentsText });
	for (const slug of [...slugs].sort(byCodeUnit)) {
		const text = readText(join(ROOT, SKILLS_DIR, slug, "SKILL.md"));
		if (text !== null) docs.push({ label: `${SKILLS_DIR}/${slug}/SKILL.md`, text });
	}
	return docs;
}

function checkPaths(rep, docs) {
	const unresolved = [];
	for (const { label, text } of docs) {
		for (const token of backtickTokens(text)) {
			const path = candidateRepoPath(token);
			if (path === null) continue;
			if (!isFile(join(ROOT, path)) && !isDir(join(ROOT, path))) unresolved.push(`${label} → ${path}`);
		}
	}
	if (unresolved.length === 0) rep.ok("skills/路径", "所有反引号仓库路径均可解析");
	else {
		const shown = unresolved.slice(0, 8).join("；");
		rep.fail("skills/路径", unresolved.length > 8 ? `${shown}（共 ${unresolved.length} 处）` : shown);
	}
}

function checkPnpm(rep, docs, scripts) {
	const missing = [];
	for (const { label, text } of docs) {
		for (const match of text.matchAll(/`pnpm\s+(?:run\s+)?([^`\s]+)/g)) {
			const name = match[1];
			if (name.startsWith("-") || name.startsWith("<") || PNPM_BUILTIN.has(name)) continue;
			if (!Object.hasOwn(scripts, name)) missing.push(`${label} → pnpm ${name}`);
		}
	}
	if (missing.length === 0) rep.ok("skills/pnpm", "引用的 pnpm 脚本均存在于 package.json");
	else rep.fail("skills/pnpm", missing.slice(0, 8).join("；"));
}

function checkXtask(rep, docs) {
	const missing = [];
	for (const { label, text } of docs) {
		for (const match of text.matchAll(/`(?:node\s+tools\/xtask\.mjs|xtask)\s+([^`\s]+)/g)) {
			const name = match[1];
			if (name.startsWith("-") || name.startsWith("<")) continue;
			if (!SUBCOMMANDS.includes(name)) missing.push(`${label} → xtask ${name}`);
		}
	}
	if (missing.length === 0) rep.ok("skills/xtask", "引用的 xtask 子命令均存在");
	else rep.fail("skills/xtask", missing.slice(0, 8).join("；"));
}

function checkSymlink(rep) {
	const linkPath = join(ROOT, ".claude/skills");
	let stat;
	try {
		stat = lstatSync(linkPath);
	} catch {
		rep.fail("skills/.claude", ".claude/skills 不存在");
		return;
	}
	if (!stat.isSymbolicLink()) {
		rep.fail("skills/.claude", ".claude/skills 不是符号链接");
		return;
	}
	let target = "";
	try {
		target = readlinkSync(linkPath);
	} catch (error) {
		rep.fail("skills/.claude", `无法读取链接目标：${error.message}`);
		return;
	}
	try {
		const resolved = realpathSync(linkPath);
		const expected = realpathSync(join(ROOT, SKILLS_DIR));
		if (resolved === expected) rep.ok("skills/.claude", `.claude/skills → ${target}`);
		else rep.fail("skills/.claude", `.claude/skills → ${target}，期望指向 ${SKILLS_DIR}`);
	} catch {
		rep.fail("skills/.claude", `链接目标无法解析（${target}）`);
	}
}

export function runSkills(rep) {
	const agentsText = readText(join(ROOT, "AGENTS.md"));
	const slugs = skillSlugs();

	// 路由表 ↔ 目录集合双向对账。
	if (slugs === null) {
		rep.fail("skills/路由表", `${SKILLS_DIR} 不存在或不可读`);
	} else if (agentsText === null) {
		rep.fail("skills/路由表", "AGENTS.md 不存在");
	} else {
		const routed = routerSlugs(agentsText);
		const missing = [...slugs].filter((slug) => !routed.has(slug)).sort(byCodeUnit);
		const extra = [...routed].filter((slug) => !slugs.has(slug)).sort(byCodeUnit);
		if (missing.length === 0 && extra.length === 0) {
			rep.ok("skills/路由表", `${slugs.size} 个技能与 AGENTS.md 路由一一对应`);
		} else {
			const parts = [];
			if (missing.length) parts.push(`缺少路由：${missing.join(", ")}`);
			if (extra.length) parts.push(`多余路由：${extra.join(", ")}`);
			rep.fail("skills/路由表", parts.join("；"));
		}
	}

	// AGENTS.md 字节上限。
	if (agentsText === null) {
		rep.fail("skills/AGENTS.md", "不存在");
	} else {
		const bytes = Buffer.byteLength(agentsText, "utf8");
		if (bytes <= AGENTS_LIMIT) rep.ok("skills/AGENTS.md", `${bytes} B ≤ ${AGENTS_LIMIT} B`);
		else rep.fail("skills/AGENTS.md", `${bytes} B > ${AGENTS_LIMIT} B`);
	}

	// 单份 SKILL.md 字节上限。
	if (slugs === null) {
		rep.fail("skills/SKILL.md", `${SKILLS_DIR} 不存在`);
	} else {
		const oversized = [];
		for (const slug of [...slugs].sort(byCodeUnit)) {
			const text = readText(join(ROOT, SKILLS_DIR, slug, "SKILL.md"));
			if (text === null) continue;
			const bytes = Buffer.byteLength(text, "utf8");
			if (bytes > SKILL_LIMIT) oversized.push(`${slug}=${bytes} B`);
		}
		if (oversized.length === 0) rep.ok("skills/SKILL.md", `${slugs.size} 份均 ≤ ${SKILL_LIMIT} B`);
		else rep.fail("skills/SKILL.md", `超限：${oversized.join(", ")}`);
	}

	// frontmatter：name 等于目录 slug、description 非空。
	if (slugs === null) {
		rep.fail("skills/frontmatter", `${SKILLS_DIR} 不存在`);
	} else {
		const problems = [];
		for (const slug of [...slugs].sort(byCodeUnit)) {
			const text = readText(join(ROOT, SKILLS_DIR, slug, "SKILL.md"));
			if (text === null) {
				problems.push(`${slug}：缺少 SKILL.md`);
				continue;
			}
			const fields = parseFrontmatter(text);
			if (fields === null) {
				problems.push(`${slug}：frontmatter 缺失或未闭合`);
				continue;
			}
			if (fields.get("name") !== slug) problems.push(`${slug}：name=${fields.get("name") ?? "缺失"}`);
			if (!fields.get("description")) problems.push(`${slug}：description 为空`);
		}
		if (problems.length === 0) rep.ok("skills/frontmatter", `${slugs.size} 份 name/description 合规`);
		else rep.fail("skills/frontmatter", problems.slice(0, 8).join("；"));
	}

	// README 索引：每个技能恰好一行，无重复、无未知技能。
	const readmeText = readText(join(ROOT, SKILLS_DIR, "README.md"));
	if (slugs === null) {
		rep.fail("skills/README.md", `${SKILLS_DIR} 不存在`);
	} else if (readmeText === null) {
		rep.fail("skills/README.md", `${SKILLS_DIR}/README.md 不存在`);
	} else {
		const counts = new Map();
		const unknownRows = [];
		for (const cells of tableRows(readmeText)) {
			const joined = cells.join(" | ");
			const seen = new Set();
			for (const match of joined.matchAll(/\.agents\/skills\/([^/`\s)|]+)\/SKILL\.md/g)) seen.add(match[1]);
			if (seen.size === 0) {
				const first = (cells[0] ?? "").replace(/^`|`$/g, "").trim();
				if (slugs.has(first)) seen.add(first);
			}
			if (seen.size === 0) {
				unknownRows.push(joined);
				continue;
			}
			for (const slug of seen) {
				if (!slugs.has(slug)) unknownRows.push(joined);
				else counts.set(slug, (counts.get(slug) ?? 0) + 1);
			}
		}
		const missing = [...slugs].filter((slug) => !counts.has(slug)).sort(byCodeUnit);
		const duplicated = [...counts].filter(([, count]) => count > 1).map(([slug, count]) => `${slug}×${count}`);
		const parts = [];
		if (missing.length) parts.push(`缺少：${missing.join(", ")}`);
		if (duplicated.length) parts.push(`重复：${duplicated.join(", ")}`);
		if (unknownRows.length) parts.push(`无法识别/未知技能行：${unknownRows.slice(0, 3).join(" ; ")}`);
		if (parts.length === 0) rep.ok("skills/README.md", `${slugs.size} 个技能各一行`);
		else rep.fail("skills/README.md", parts.join("；"));
	}

	const docs = citedDocs(agentsText, slugs ?? new Set());

	checkPaths(rep, docs);

	// pnpm 脚本引用存在。
	const packageText = readText(join(ROOT, "package.json"));
	if (packageText === null) {
		rep.fail("skills/pnpm", "package.json 不存在");
	} else {
		let scripts = null;
		try {
			scripts = JSON.parse(packageText).scripts ?? {};
		} catch (error) {
			rep.fail("skills/pnpm", `package.json 无法解析：${error.message}`);
		}
		if (scripts !== null) checkPnpm(rep, docs, scripts);
	}

	checkXtask(rep, docs);
	checkSymlink(rep);
}

export { candidateRepoPath, routerSlugs };
