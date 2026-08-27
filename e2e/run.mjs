// E2E 套件运行器（C-045）：启动隔离测试环境，顺序执行 e2e/specs/*.mjs。
//
// 每个 spec 文件默认导出 async ({ page, url, mock, assert })：page 为全新
// browser context 的首页（未导航），runner 负责环境与浏览器生命周期。
// 浏览器二进制为项目内安装（PLAYWRIGHT_BROWSERS_PATH=0）。
//
// 用法：`node e2e/run.mjs`（或 `pnpm test:e2e`）。

import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const here = dirname(fileURLToPath(import.meta.url));
const { bootE2e } = await import("./boot.mjs");
const { chromium } = await import("playwright");

const specDir = join(here, "specs");
const specFiles = (await readdir(specDir)).filter((name) => name.endsWith(".mjs")).sort();
if (specFiles.length === 0) {
	console.error("e2e: specs/ 下没有 spec 文件");
	process.exit(1);
}

const env = await bootE2e();
console.error(`e2e: 隔离环境就绪 ${env.url}（冷启动 ${JSON.stringify(env.timings)}）`);

let browser;
let failed = 0;
try {
	browser = await chromium.launch();
	for (const name of specFiles) {
		const spec = (await import(pathToFileURL(join(specDir, name)).href)).default;
		const context = await browser.newContext();
		const page = await context.newPage();
		const start = Date.now();
		try {
			await spec({ page, url: env.url, mock: env.mock, assert });
			console.error(`e2e: PASS ${name}（${Date.now() - start}ms）`);
		} catch (error) {
			failed += 1;
			console.error(`e2e: FAIL ${name}\n${error?.stack ?? error}`);
			await page.screenshot({ path: join(here, `fail-${name}.png`) }).catch(() => {});
		} finally {
			await context.close();
		}
	}
} finally {
	await browser?.close();
	await env.cleanup();
}

if (failed > 0) {
	console.error(`e2e: ${failed} 个 spec 失败`);
	process.exit(1);
}
console.error(`e2e: 全部 ${specFiles.length} 个 spec 通过`);
