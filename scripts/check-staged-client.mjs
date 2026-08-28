// 校验 Git index 中的 source/build script 与 staged client bundle 完全一致（C-059、T-089）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inputs = [
	"scripts/build-client.mjs",
	"src/core.mjs",
	"src/navigation.mjs",
	"src/client.mjs",
	".dsh-plugin/client.js",
];

function staged(path) {
	try {
		return execFileSync("git", ["show", `:${path}`], { cwd: root });
	} catch {
		throw new Error(`staged client check: Git index 缺少 ${path}`);
	}
}

const directory = await mkdtemp(join(tmpdir(), "dap-staged-client-"));
try {
	const stagedBundle = staged(".dsh-plugin/client.js");
	for (const path of inputs) {
		const target = join(directory, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, staged(path));
	}
	execFileSync(process.execPath, [join(directory, "scripts/build-client.mjs")], {
		cwd: directory,
		stdio: "pipe",
	});
	const generated = await readFile(join(directory, ".dsh-plugin/client.js"));
	assert.deepEqual(
		generated,
		stagedBundle,
		"staged client bundle 已过期：请运行 pnpm build:client，并重新暂存 src、scripts/build-client.mjs 与 .dsh-plugin/client.js",
	);
	console.log("staged client bundle check passed");
} finally {
	await rm(directory, { recursive: true, force: true });
}
