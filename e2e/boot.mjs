// 隔离测试环境启动器（C-045）：mock LLM + 独立 $DSH_HOME + dsh web 随机端口。
//
// 流程：启动 mock LLM → 创建临时 $DSH_HOME 并写入指向 mock 的
// settings.yaml → `dsh plugin --profile web add` 脚手架 profile 并以
// link: 装入本仓库 → `dsh web --port 0` 启动并轮询就绪。cleanup() 终止
// dsh web 进程组、关闭 mock、删除临时目录。
//
// 用法：`node e2e/boot.mjs` 启动并打印 JSON 就绪信息（调试用，Ctrl+C 清理）；
// 或被 spec 导入调用 bootE2e()。

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockLlm } from "./mock-llm.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const BOOT_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 依次执行全部清理步骤，返回带标签的错误；单步失败不阻止其余资源释放。 */
export async function settleCleanupSteps(steps) {
	const errors = [];
	for (const [label, cleanup] of steps) {
		try {
			await cleanup();
		} catch (error) {
			errors.push(`${label}: ${error?.stack ?? error}`);
		}
	}
	return errors;
}

export function formatPassTimings(name, timings) {
	const { boot, browser, spec, cleanup, total } = timings;
	return `e2e: PASS ${name}（boot=${boot}ms browser=${browser}ms spec=${spec}ms cleanup=${cleanup}ms total=${total}ms）`;
}

/** 预置工作区存储：隔离环境内建一个工作区目录并登记为唯一工作区，免除 UI 选工作区步骤。 */
async function seedWorkspace(home) {
	const id = "e2e-workspace";
	const path = join(home, "workspace");
	await mkdir(path, { recursive: true });
	const now = new Date().toISOString();
	const storage = {
		unit: { name: "workspace", version: 2 },
		global: { initialized: true, workspaceIds: [id], archivedSessionIds: [] },
		tables: { workspaces: { [id]: { path, title: "e2e", sessionIds: [], createdAt: now, updatedAt: now } } },
	};
	await mkdir(join(home, "storages"), { recursive: true });
	await writeFile(join(home, "storages", "workspace.json"), JSON.stringify(storage));
}

function settingsYaml(mockUrl) {
	return [
		"llm-deepseek:",
		`  baseURL: ${mockUrl}`,
		"  apiKeyEnv: DEEPSEEK_API_KEY",
		"agent-default-model:",
		"  provider: deepseek-official",
		"  model: deepseek-v4-flash",
		// 预置欢迎内测声明确认（dsh 0.1.5 宿主 OnboardingModal）：不预置则宿主会在运行
		// 途中弹出带遮罩的模态，拦截 spec 的指针操作（环境噪声，非被测行为）。
		"ui-onboarding:",
		'  welcomeNoticeVersion: "2026-08-13.1"',
		"",
	].join("\n");
}

/**
 * 启动一套隔离测试环境。
 * @returns Promise<{ home, url, mock, timings, cleanup }>
 *   timings 记录各阶段毫秒耗时（mock/settings/plugin/webReady/total）。
 */
export async function bootE2e() {
	const t0 = Date.now();
	const timings = {};
	const mark = (name) => {
		timings[name] = Date.now() - t0;
	};

	const mock = await startMockLlm();
	mark("mock");

	const home = await mkdtemp(join(tmpdir(), "dsh-e2e-"));
	await writeFile(join(home, "settings.yaml"), settingsYaml(mock.url));
	await seedWorkspace(home);
	mark("settings");

	const env = { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: "e2e-mock-key" };

	let web;
	let url;
	const webStderr = [];
	// detached 使 dsh web 自成进程组，清理按组终止（其子进程不留孤儿）。
	const killWebGroup = (signal) => {
		if (!web || web.exitCode !== null) return;
		try {
			process.kill(-web.pid, signal);
		} catch {
			web.kill(signal);
		}
	};
	const cleanup = async () => {
		if (web && web.exitCode === null) {
			killWebGroup("SIGTERM");
			let escalationTimer = null;
			try {
				await Promise.race([
					new Promise((resolve) => web.once("exit", resolve)),
					new Promise((resolve) => {
						escalationTimer = setTimeout(() => {
							killWebGroup("SIGKILL");
							resolve();
						}, 5_000);
					}),
				]);
			} finally {
				if (escalationTimer !== null) clearTimeout(escalationTimer);
			}
		}
		await mock.close();
		await rm(home, { recursive: true, force: true });
	};

	try {
		await execFileAsync("dsh", ["plugin", "--profile", "web", "add", repoRoot], { env });
		mark("plugin");

		web = spawn("dsh", ["web", "--port", "0"], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
		// 保留 web stderr 尾部供 spec 失败时取证（宿主侧错误不在浏览器控制台出现）。
		web.stderr.on("data", (data) => {
			webStderr.push(String(data));
			if (webStderr.length > 200) webStderr.shift();
		});
		url = await new Promise((resolve, reject) => {
			let buffer = "";
			const timer = setTimeout(() => reject(new Error(`dsh web 启动超时（${BOOT_TIMEOUT_MS}ms），输出：${buffer.slice(-500)}`)), BOOT_TIMEOUT_MS);
			web.stdout.on("data", (data) => {
				buffer += data;
				const match = buffer.match(/dsh web: (http:\/\/\S+)/);
				if (match) {
					clearTimeout(timer);
					resolve(match[1]);
				}
			});
			web.once("exit", (code) => {
				clearTimeout(timer);
				reject(new Error(`dsh web 提前退出（code=${code}），输出：${buffer.slice(-500)}`));
			});
		});

		// 就绪轮询：鉴权开启的 dsh web 首页经 token→303→Set-Cookie→带 cookie 的 / 才返回
		// 200，无 cookie 的裸 fetch 只会拿到 303/401；鉴权关闭的部署对 token URL 直接 200。
		// 就绪判定走完整鉴权链，交付浏览器前证明应用真实可服务（CI 的 runtime 无本地
		// AUTH-DISABLE 补丁，轮询必须自行完成 token 换 cookie）。
		const deadline = Date.now() + BOOT_TIMEOUT_MS;
		for (;;) {
			try {
				const bootstrap = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
				if (bootstrap.ok) break;
				if (bootstrap.status === 303 || bootstrap.status === 302) {
					const setCookies = typeof bootstrap.headers.getSetCookie === "function" ? bootstrap.headers.getSetCookie() : [bootstrap.headers.get("set-cookie")].filter(Boolean);
					const pair = setCookies[0]?.split(";")[0] ?? "";
					if (pair.includes("=")) {
						const index = await fetch(new URL("/", url), { headers: { cookie: pair }, signal: AbortSignal.timeout(5_000) });
						if (index.ok) break;
					}
				}
			} catch {
				// 尚未就绪，继续轮询
			}
			if (Date.now() > deadline) throw new Error(`dsh web 就绪轮询超时：${url}`);
			await sleep(250);
		}
		mark("webReady");
	} catch (error) {
		await cleanup();
		throw error;
	}

	timings.total = Date.now() - t0;
	return { home, url, mock, timings, cleanup, webStderr };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const env = await bootE2e();
	console.log(JSON.stringify({ url: env.url, home: env.home, mockUrl: env.mock.url, timings: env.timings }, null, 2));
	const shutdown = async () => {
		await env.cleanup();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}
