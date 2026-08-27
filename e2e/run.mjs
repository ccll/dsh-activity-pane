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

let failed = 0;
for (const name of specFiles) {
	// 每条 spec 独立隔离环境：会话状态互不可见（冷启动约 2-4s，可接受）。
	const spec = (await import(pathToFileURL(join(specDir, name)).href)).default;
	let lastError = null;
	// 宿主 sessions 首推挂起（见 TODO 缺陷线索）绑定服务端实例且重载不保证自愈，
	// 对该签名错误（ERR_PANE_STALL）最多换全新环境重试两次；其余失败（真回归）不重试。
	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (attempt > 0) console.error(`e2e: RETRY ${name}（上一环境数据停滞，换新环境重试）`);
		const env = await bootE2e();
		let browser;
		const start = Date.now();
		try {
			browser = await chromium.launch();
			const context = await browser.newContext();
			const page = await context.newPage();
			try {
				await spec({ page, url: env.url, mock: env.mock, assert });
				console.error(`e2e: PASS ${name}（${Date.now() - start}ms）`);
				lastError = null;
			} catch (error) {
				lastError = error;
				console.error(`e2e: FAIL ${name}\n${error?.stack ?? error}`);
				if (env.webStderr.length > 0) console.error(`e2e: dsh web stderr 尾部：\n${env.webStderr.slice(-20).join("")}`);
				await page.screenshot({ path: join(here, `fail-${name}.png`) }).catch(() => {});
			} finally {
				await context.close();
			}
		} catch (error) {
			lastError = error;
			console.error(`e2e: FAIL ${name}（环境启动失败）\n${error?.stack ?? error}`);
		} finally {
			await browser?.close();
			await env.cleanup();
		}
		if (lastError === null || lastError?.code !== "E2E_PANE_STALL") break;
	}
	if (lastError !== null) failed += 1;
}

if (failed > 0) {
	console.error(`e2e: ${failed} 个 spec 失败`);
	process.exit(1);
}
console.error(`e2e: 全部 ${specFiles.length} 个 spec 通过`);
