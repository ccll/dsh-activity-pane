// ratchet 检查：只减清单活性——未覆盖 spec、宿主 shim 行、人工验收期限、
// bundle 字节预算；--bless 只允许把预算改小。
import { readdirSync } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../../scripts/build-client.mjs";
import {
	ROOT,
	git,
	isFile,
	readText,
	todayISO,
} from "./util.mjs";

const RATCHET_DIR = join(ROOT, "tools/ratchet");
const SPECS_DIR = join(ROOT, "e2e/specs");

/** 文本清单 → 条目（忽略 # 注释与空行）。 */
function readListItems(relative) {
	const text = readText(join(ROOT, relative));
	if (text === null) return null;
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"));
}

function checkUncoveredSpecs(rep) {
	const relative = "tools/ratchet/uncovered-specs.txt";
	const items = readListItems(relative);
	if (items === null) {
		rep.fail("ratchet/uncovered-specs", `${relative} 不存在`);
		return;
	}
	const specs = readdirSpecs();
	const problems = [];
	const registered = new Set();
	for (const item of items) {
		const match = item.match(/^e2e\/specs\/([^/]+)\.mjs$/);
		if (!match) {
			problems.push(`条目格式非法：${item}`);
			continue;
		}
		registered.add(match[1]);
		if (!specs.includes(match[1])) problems.push(`spec 已不存在：${item}`);
	}
	// 新增 spec 必须显式登记（基线 = origin/main 的 spec 集；无基线则视为全部已覆盖）。
	const baselineText = git(["ls-tree", "--name-only", "origin/main", "e2e/specs/"], { allowFail: true });
	const baselineSet = baselineText === null
		? new Set()
		: new Set(
			baselineText
				.split(/\r?\n/)
				.map((line) => line.match(/^e2e\/specs\/(.+)\.mjs$/)?.[1])
				.filter(Boolean),
		);
	// 基线缺失或为空（无 origin/main / 无 specs）时不做新增判定，只查条目存活。
	const baseline = baselineSet.size === 0 ? new Set(specs) : baselineSet;
	for (const spec of specs) {
		if (!baseline.has(spec) && !registered.has(spec)) problems.push(`新增 spec 未登记：e2e/specs/${spec}.mjs`);
	}
	if (problems.length === 0) {
		rep.ok("ratchet/uncovered-specs", `${items.length} 条登记均有对应 spec，${specs.length} 个 spec 无未登记新增`);
	} else {
		rep.fail("ratchet/uncovered-specs", problems.slice(0, 8).join("；"));
	}
}

function readdirSpecs() {
	try {
		// 与 e2e/run.mjs 一致：specs 目录下的 .mjs 文件名（不含扩展名）。
		return readdirNames(SPECS_DIR).filter((name) => name.endsWith(".mjs")).map((name) => name.slice(0, -4));
	} catch {
		return [];
	}
}

function readdirNames(dir) {
	return readdirSync(dir);
}

function checkHostShims(rep) {
	const relative = "tools/ratchet/host-shims.txt";
	const items = readListItems(relative);
	if (items === null) {
		rep.fail("ratchet/host-shims", `${relative} 不存在`);
		return;
	}
	const problems = [];
	for (const item of items) {
		const match = item.match(/^((?:src\/)[^:]+):(\d+)$/);
		if (!match) {
			problems.push(`条目格式非法：${item}`);
			continue;
		}
		const [, file, lineText] = match;
		const absolute = join(ROOT, file);
		if (!isFile(absolute)) {
			problems.push(`文件不存在：${file}`);
			continue;
		}
		const lineNumber = Number(lineText);
		const lines = (readText(absolute) ?? "").split(/\r?\n/);
		const content = lines[lineNumber - 1];
		if (content === undefined) {
			problems.push(`行越界：${item}`);
			continue;
		}
		if (!/0\.2\.[02]/.test(content)) problems.push(`该行不再含 0.2.0/0.2.2 注释：${item}`);
	}
	if (problems.length === 0) rep.ok("ratchet/host-shims", `${items.length} 个宿主 shim 行均存活`);
	else rep.fail("ratchet/host-shims", problems.slice(0, 8).join("；"));
}

function checkManualAcceptance(rep) {
	const relative = "tools/ratchet/manual-acceptance.txt";
	const items = readListItems(relative);
	if (items === null) {
		rep.fail("ratchet/manual-acceptance", `${relative} 不存在`);
		return;
	}
	const today = todayISO();
	const problems = [];
	for (const item of items) {
		const parts = item.split("::").map((part) => part.trim());
		if (parts.length !== 3 || parts.some((part) => !part)) {
			problems.push(`条目格式应为「id :: reason :: YYYY-MM-DD」：${item}`);
			continue;
		}
		const [, , expiry] = parts;
		const parsed = new Date(`${expiry}T00:00:00Z`);
		const valid = /^\d{4}-\d{2}-\d{2}$/.test(expiry) &&
			!Number.isNaN(parsed.getTime()) &&
			parsed.toISOString().slice(0, 10) === expiry;
		if (!valid) {
			problems.push(`日期非法：${item}`);
			continue;
		}
		if (expiry < today) problems.push(`已过期需移除或续期：${parts[0]}（${expiry}）`);
	}
	if (problems.length === 0) rep.ok("ratchet/manual-acceptance", `${items.length} 条未过期（今天 ${today}）`);
	else rep.fail("ratchet/manual-acceptance", problems.slice(0, 8).join("；"));
}

/** 用临时目录重建 bundle（不写工作树）。 */
async function rebuildBundleSize() {
	const dir = await mkdtemp(join(tmpdir(), "xtask-bundle-"));
	try {
		const outPath = join(dir, "client.js");
		await build({ outPath });
		const info = await stat(outPath);
		return info.size;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function checkBundleBytes(rep, bless) {
	const relative = join(RATCHET_DIR, "bundle-bytes.json");
	const text = readText(relative);
	let budget = null;
	if (text !== null) {
		try {
			const parsed = JSON.parse(text);
			if (!Number.isInteger(parsed.bytes) || parsed.bytes <= 0) throw new Error('缺少正整数 "bytes"');
			budget = parsed.bytes;
		} catch (error) {
			rep.fail("ratchet/bundle-bytes", `${relative} 无法解析：${error.message}`);
			return;
		}
	}
	let size;
	try {
		size = await rebuildBundleSize();
	} catch (error) {
		rep.fail("ratchet/bundle-bytes", `重建 bundle 失败：${error.message}`);
		return;
	}
	if (bless) {
		if (budget === null) {
			await writeFile(relative, `${JSON.stringify({ bytes: size }, null, 2)}\n`, "utf8");
			rep.ok("ratchet/bundle-bytes", `创建预算 ${size} B（重建实测）`);
			return;
		}
		if (size < budget) {
			await writeFile(relative, `${JSON.stringify({ bytes: size }, null, 2)}\n`, "utf8");
			rep.ok("ratchet/bundle-bytes", `已 bless：${budget} → ${size} B`);
		} else if (size > budget) {
			rep.fail("ratchet/bundle-bytes", `重建 ${size} B > 当前预算 ${budget} B，不能放大预算；请减重`);
		} else {
			rep.fail("ratchet/bundle-bytes", `重建 ${size} B 等于当前预算，bless 只接受更小值`);
		}
		return;
	}
	if (budget === null) {
		rep.fail("ratchet/bundle-bytes", `${relative} 不存在`);
		return;
	}
	if (size > budget) rep.fail("ratchet/bundle-bytes", `重建 bundle ${size} B > 预算 ${budget} B`);
	else rep.ok("ratchet/bundle-bytes", `重建 ${size} B ≤ 预算 ${budget} B`);
}

export async function runRatchet(rep, argv = []) {
	const bless = argv.includes("--bless");
	checkUncoveredSpecs(rep);
	checkHostShims(rep);
	checkManualAcceptance(rep);
	await checkBundleBytes(rep, bless);
}

export { checkUncoveredSpecs, rebuildBundleSize };
