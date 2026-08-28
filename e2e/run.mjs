// E2E 套件运行器（C-045、C-046、C-047）：启动隔离测试环境，执行 e2e/specs/*.mjs。
//
// 每个 spec 默认导出 async ({ browser, page, url, mock, assert })：browser/page
// 属于该次隔离环境；runner 负责环境、浏览器与 context 生命周期。最多并行两条
// 独立 spec，在 GitHub hosted runner 资源内缩短墙钟时间。
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
const { ERR_PANE_STALL } = await import("./helpers.mjs");
const { chromium } = await import("playwright");
const MAX_CONCURRENCY = 2;

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
	let lastError = null;
	let recoveries = 0;
	// 宿主 sessions 首推停滞可能随浏览器进程延续；恢复时同时更换服务环境与 Chromium。
	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (attempt > 0) {
			recoveries += 1;
			console.error(`e2e: RECOVER ${name}（上一环境 sessions 首推停滞，换浏览器与环境）`);
		}
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
			lastError = null;
		} catch (error) {
			lastError = error;
			console.error(`e2e: FAIL ${name}\n${error?.stack ?? error}`);
			if (env?.webStderr.length > 0) console.error(`e2e: dsh web stderr 尾部：\n${env.webStderr.slice(-20).join("")}`);
			await captureFailure(page, name);
		} finally {
			await context?.close().catch(() => {});
			await browser?.close().catch(() => {});
			await env?.cleanup().catch(() => {});
		}
		if (lastError === null || lastError?.code !== ERR_PANE_STALL) break;
	}
	return { failed: lastError === null ? 0 : 1, recoveries };
}

const suiteStart = Date.now();
let nextSpec = 0;
let failed = 0;
let stallRecoveries = 0;
async function worker() {
	for (;;) {
		const index = nextSpec;
		nextSpec += 1;
		if (index >= specFiles.length) return;
		const result = await runSpec(specFiles[index]);
		failed += result.failed;
		stallRecoveries += result.recoveries;
	}
}
await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, specFiles.length) }, () => worker()));

const elapsed = Date.now() - suiteStart;
if (failed > 0) {
	console.error(`e2e: ${failed} 个 spec 失败（${elapsed}ms，sessions 恢复 ${stallRecoveries} 次）`);
	process.exit(1);
}
console.error(`e2e: 全部 ${specFiles.length} 个 spec 通过（${elapsed}ms，sessions 恢复 ${stallRecoveries} 次）`);
