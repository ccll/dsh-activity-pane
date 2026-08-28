// E2E 套件运行器（C-045、C-046、C-047、C-058）：启动隔离测试环境，执行 e2e/specs/*.mjs。
//
// 每个 spec 默认导出 async ({ browser, page, url, mock, assert })：browser/page
// 属于该次隔离环境；runner 负责环境、浏览器与 context 生命周期。spec 固定顺序
// 执行，保持单机门禁的资源上限与日志顺序稳定。
// 浏览器二进制为项目内安装（PLAYWRIGHT_BROWSERS_PATH=0）。
//
// 用法：`node e2e/run.mjs`（全量）或 `node e2e/run.mjs mobile-drawer`（指定 spec）。

import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const here = dirname(fileURLToPath(import.meta.url));
const { bootE2e } = await import("./boot.mjs");
const { chromium } = await import("playwright");
const MAX_CONCURRENCY = 1;

const specDir = join(here, "specs");
const requested = new Set(process.argv.slice(2).map((name) => (name.endsWith(".mjs") ? name : `${name}.mjs`)));
const allSpecFiles = (await readdir(specDir)).filter((name) => name.endsWith(".mjs")).sort();
const specFiles = requested.size === 0 ? allSpecFiles : allSpecFiles.filter((name) => requested.has(name));
if (specFiles.length === 0 || (requested.size > 0 && specFiles.length !== requested.size)) {
	console.error(`e2e: 找不到请求的 spec（可用：${allSpecFiles.join(", ")}）`);
	process.exit(1);
}

const failurePath = (name) => join(here, `fail-${name}.png`);

async function captureFailure(page, name) {
	await page?.screenshot({ path: failurePath(name) }).catch(() => {});
}

async function clearFailureArtifact(name) {
	await rm(failurePath(name), { force: true }).catch(() => {});
}

async function runSpec(name) {
	const spec = (await import(pathToFileURL(join(specDir, name)).href)).default;
	let env;
	let browser;
	let context;
	let page;
	const start = Date.now();
	try {
		env = await bootE2e();
		browser = await chromium.launch();
		context = await browser.newContext();
		page = await context.newPage();
		await spec({ browser, page, url: env.url, mock: env.mock, assert });
		await clearFailureArtifact(name);
		console.error(`e2e: PASS ${name}（${Date.now() - start}ms）`);
		return 0;
	} catch (error) {
		console.error(`e2e: FAIL ${name}\n${error?.stack ?? error}`);
		if (env?.webStderr.length > 0) console.error(`e2e: dsh web stderr 尾部：\n${env.webStderr.slice(-20).join("")}`);
		await captureFailure(page, name);
		return 1;
	} finally {
		await context?.close().catch(() => {});
		await browser?.close().catch(() => {});
		await env?.cleanup().catch(() => {});
	}
}

const suiteStart = Date.now();
let nextSpec = 0;
let failed = 0;
async function worker() {
	for (;;) {
		const index = nextSpec;
		nextSpec += 1;
		if (index >= specFiles.length) return;
		failed += await runSpec(specFiles[index]);
	}
}
await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, specFiles.length) }, () => worker()));

const elapsed = Date.now() - suiteStart;
if (failed > 0) {
	console.error(`e2e: ${failed} 个 spec 失败（${elapsed}ms）`);
	process.exit(1);
}
console.error(`e2e: 全部 ${specFiles.length} 个 spec 通过（${elapsed}ms）`);
