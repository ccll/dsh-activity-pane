// lists 检查：只减清单排序/去重/尾随空格、package.json files[] 排序、
// .githooks/*.d 脚本命名与编号唯一；--fix 重写文本清单与 package.json。
import { join } from "node:path";
import {
	ROOT,
	byCodeUnit,
	isDir,
	listDir,
	readText,
	writeText,
} from "./util.mjs";

const RATCHET_DIR = "tools/ratchet";

/** 读取一份文本清单：分离注释行与条目。 */
function parseTextList(text) {
	const comments = [];
	const items = [];
	const problems = [];
	let lineNumber = 0;
	for (const raw of text.split(/\r?\n/)) {
		lineNumber += 1;
		if (raw.trim() === "") continue;
		if (/^\s*#/.test(raw)) {
			comments.push(raw);
			continue;
		}
		if (raw !== raw.trimEnd()) problems.push(`第 ${lineNumber} 行有尾随空格`);
		items.push(raw);
	}
	const seen = new Set();
	for (const item of items) {
		if (seen.has(item)) problems.push(`重复条目「${item}」`);
		seen.add(item);
	}
	for (let index = 1; index < items.length; index += 1) {
		if (byCodeUnit(items[index - 1], items[index]) > 0) {
			problems.push(`未排序：第 ${index} 行「${items[index - 1]}」>「${items[index]}」`);
			break;
		}
	}
	return { comments, items, problems };
}

function sortedItems(items) {
	return [...new Set(items.map((item) => item.trimEnd()))].sort(byCodeUnit);
}

function renderTextList(comments, items) {
	const lines = [...comments, ...items];
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function checkRatchetTextLists(rep, fix) {
	if (!isDir(join(ROOT, RATCHET_DIR))) {
		rep.fail("lists/ratchet", `${RATCHET_DIR} 不存在`);
		return;
	}
	const files = listDir(join(ROOT, RATCHET_DIR), (entry) => entry.isFile() && entry.name.endsWith(".txt"));
	if (files.length === 0) {
		rep.fail("lists/ratchet", `${RATCHET_DIR} 下没有 .txt 清单`);
		return;
	}
	for (const name of files) {
		const relative = `${RATCHET_DIR}/${name}`;
		const text = readText(join(ROOT, relative));
		if (text === null) {
			rep.fail(`lists/${relative}`, "无法读取");
			continue;
		}
		const { comments, items, problems } = parseTextList(text);
		if (fix) {
			const sorted = sortedItems(items);
			const rendered = renderTextList(comments, sorted);
			if (rendered !== text) {
				writeText(join(ROOT, relative), rendered);
				rep.ok(`lists/${relative}`, `${sorted.length} 项已排序写回（--fix）`);
			} else {
				rep.ok(`lists/${relative}`, `${sorted.length} 项已有序`);
			}
			continue;
		}
		if (problems.length === 0) rep.ok(`lists/${relative}`, `${items.length} 项有序、无重复、无尾随空格`);
		else rep.fail(`lists/${relative}`, problems.slice(0, 5).join("；"));
	}
}

function checkPackageFiles(rep, fix) {
	const relative = "package.json";
	const text = readText(join(ROOT, relative));
	if (text === null) {
		rep.fail("lists/package.json files", "package.json 不存在");
		return;
	}
	let pkg;
	try {
		pkg = JSON.parse(text);
	} catch (error) {
		rep.fail("lists/package.json files", `无法解析：${error.message}`);
		return;
	}
	const files = pkg.files;
	if (!Array.isArray(files)) {
		rep.fail("lists/package.json files", "files[] 缺失或不是数组");
		return;
	}
	const items = files.map((item) => String(item));
	const problems = [];
	for (let index = 1; index < items.length; index += 1) {
		if (byCodeUnit(items[index - 1], items[index]) > 0) {
			problems.push(`未排序：${items[index - 1]} > ${items[index]}`);
			break;
		}
	}
	if (new Set(items).size !== items.length) problems.push("存在重复项");
	if (fix) {
		const sorted = sortedItems(items);
		const next = { ...pkg, files: sorted };
		const rendered = `${JSON.stringify(next, null, 2)}\n`;
		if (rendered !== text) {
			writeText(join(ROOT, relative), rendered);
			rep.ok("lists/package.json files", `${sorted.length} 项已排序写回（--fix）`);
		} else {
			rep.ok("lists/package.json files", `${sorted.length} 项已有序`);
		}
		return;
	}
	if (problems.length === 0) rep.ok("lists/package.json files", `${items.length} 项有序`);
	else rep.fail("lists/package.json files", problems.join("；"));
}

function checkHookNames(rep) {
	const hooksRoot = join(ROOT, ".githooks");
	if (!isDir(hooksRoot)) {
		rep.fail("lists/.githooks", ".githooks 不存在");
		return;
	}
	const dirs = listDir(hooksRoot, (entry) => entry.isDirectory() && entry.name.endsWith(".d"));
	if (dirs.length === 0) {
		rep.fail("lists/.githooks", "没有 .githooks/*.d 目录");
		return;
	}
	for (const dir of dirs) {
		const relativeDir = `.githooks/${dir}`;
		const scripts = listDir(join(hooksRoot, dir), (entry) => entry.isFile() && entry.name.endsWith(".sh"));
		const problems = [];
		const numbers = new Map();
		for (const script of scripts) {
			const match = script.match(/^(\d{2})-([a-z0-9][a-z0-9-]*)\.sh$/);
			if (!match) {
				problems.push(`${script} 不符合 NN-name.sh`);
				continue;
			}
			const number = match[1];
			if (numbers.has(number)) problems.push(`编号 ${number} 重复：${numbers.get(number)}、${script}`);
			else numbers.set(number, script);
		}
		if (problems.length === 0) rep.ok(`lists/${relativeDir}`, `${scripts.length} 个脚本命名为 NN-name.sh 且编号唯一`);
		else rep.fail(`lists/${relativeDir}`, problems.join("；"));
	}
}

export function runLists(rep, argv = []) {
	const fix = argv.includes("--fix");
	checkRatchetTextLists(rep, fix);
	checkPackageFiles(rep, fix);
	checkHookNames(rep);
}
