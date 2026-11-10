// 渲染进程燃烧 A/B 自动化测量（T-182）：
// 同一隔离环境（mock LLM + 临时 DSH_HOME + 独立 Chrome）与同一确定性负载，
// 唯一变量为插件 client bundle 版本：
//   变体 A = 修复前 bundle（--base 指定 git ref 的 .dsh-plugin/client.js；
//     缺省 = 最近一次触碰该 bundle 的提交的父提交，即当前实现的对照基线）
//   变体 B = 当前工作树 bundle（build-client 现建，产物只落变体镜像目录）
// 测量几何对齐生产烧核形态（T-181 调查口径）：后台会话流式、主视图停在别处——
//   1. 锚点会话（fast 回合）+ 窗口填充会话（--fill 轮 fast 回合把日志窗口垫到
//      生产量级，折叠单次成本与窗口大小成正比）；
//   2. 每次迭代向填充会话发 `e2e:longstream`（96 块 ≈ 14.4s）后立即导航回锚点，
//      流式全程落在后台——宿主会话视图不重渲染流块，插件折叠管线成为被测主体；
//   3. 隐藏期：同几何下第二标签页置前转 hidden（headless 不生效时回落
//      defineProperty 并打印实际模式行），流式全程隐藏。
// 指标：renderer 进程 /proc CPU 时间（utime+stime）增量 ÷ 墙钟（单核占比）。
// 用法：pnpm perf:ab [--base <ref>] [--iterations 3] [--fill 48] [--threshold 1.2] [--check]
// 断言指标：折叠绝对采样数比值（机制守恒口径，T-183 演进）——折叠工作量在
// 同采样间隔同窗长下应守恒（正交改动比值 ≈1.0），阈值 1.2 为守恒噪声余量，
// 捕捉「折叠工作量随 bundle 变更增长 >20%」的回归；T-181 式折叠减半会表现为
// 比值 ≈0.5 同样 PASS。占比比值随分母漂移（其他性能改动缩小非折叠盘），仅随
// 报告输出。总 CPU 比值亦为参考项：隔离环境里宿主自身流式期 UI 工作是两变体
// 同担的常量大头。生产验收（≤ 修复前 55%）以活实例 A/B 为准。
// 定位（东家批准口径）：回归防护与发布前自检——默认只报告，--check 才断言，
// 不进 pre-push 门禁（绝对 CPU 与采样数随机器/负载漂移）。

import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { activateCard, newSessionWithMessage, openApp, sessionComposer, until } from "../e2e/helpers.mjs";
import { bootE2e, settleCleanupSteps } from "../e2e/boot.mjs";
import { build } from "./build-client.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** CLK_TCK 常见口径 100（tick=10ms）；比值口径下取值误差不影响结论。 */
const TICK_MS = 10;
/** Enter → mock 长流式 96×150ms ≈ 14.4s + 回合落定余量。 */
const BACKGROUND_STREAM_MS = 16_000;
/** 流式发出到确已开跑的缓冲（导航转后台前留出首个流块落地）。 */
const STREAM_PRIME_MS = 600;
/** 窗口填充回合节奏：fast 剧本即时完成 + 宿主落定余量。 */
const FILL_PACE_MS = 1_700;
/** 锚点会话（导航目标）与填充会话的首条消息。卡片标题来自 mock 对标题生成请求
 *  的回复（非用户原文）：锚点用 slow 剧本（标题含「慢速输出片段 1/24」）、填充
 *  会话用 fast 剧本（标题「E2E 快速回合已完成」），两者可辨；测量发送用
 *  longstream（片段 /96），与锚点标题片段（/24）不混淆，激活定位互不误伤。 */
const ANCHOR_TEXT = "e2e:slow A/B 待机锚点";
const FILL_TEXT = "e2e:fast A/B 窗口填充";
const ANCHOR_CARD_TEXT = "慢速输出片段 1/24";
const FILL_CARD_TEXT = "E2E 快速回合已完成";
const CHROME_CANDIDATES = ["google-chrome", "google-chrome-stable", "chromium-browser"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
	const opts = { base: null, iterations: 3, threshold: 1.2, check: false, fill: 48 };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--base") opts.base = argv[(i += 1)];
		else if (arg === "--iterations") opts.iterations = Number(argv[(i += 1)]);
		else if (arg === "--fill") opts.fill = Number(argv[(i += 1)]);
		else if (arg === "--threshold") opts.threshold = Number(argv[(i += 1)]);
		else if (arg === "--check") opts.check = true;
		else throw new Error(`未知参数：${arg}`);
	}
	if (!Number.isInteger(opts.iterations) || opts.iterations < 1) throw new Error("--iterations 需为正整数");
	if (!Number.isInteger(opts.fill) || opts.fill < 1) throw new Error("--fill 需为正整数");
	if (!Number.isFinite(opts.threshold) || opts.threshold <= 0) throw new Error("--threshold 需为正数");
	return opts;
}

/** 变体 A 基线：最近一次触碰 client bundle 的提交的父提交（自维护对照口径）。 */
function resolveBaseCommit() {
	const last = execFileSync("git", ["log", "--format=%H", "-n", "1", "HEAD", "--", ".dsh-plugin/client.js"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
	if (!last) throw new Error("client bundle 无历史提交，无法解析变体 A 基线（可用 --base 显式指定）");
	return execFileSync("git", ["rev-parse", `${last}~`], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

/** 变体镜像目录：package.json + cordis.patch.yml + .dsh-plugin/（index.mjs）+ src 软链
 *  + node_modules 软链。host 入口（.dsh-plugin/index.mjs）转发到 ../src/host.mjs，
 *  缺 src 会让插件静默激活失败（web 仅记 stderr 警告）；host 侧两版零差异（改动
 *  全在 client bundle），src 软链两变体同源，不影响 A/B 隔离性。 */
async function materializeVariantShell(label) {
	const dir = await mkdtemp(join(tmpdir(), `dsh-perf-${label}-`));
	await mkdir(join(dir, ".dsh-plugin"), { recursive: true });
	await copyFile(join(REPO_ROOT, "package.json"), join(dir, "package.json"));
	await copyFile(join(REPO_ROOT, "cordis.patch.yml"), join(dir, "cordis.patch.yml"));
	await copyFile(join(REPO_ROOT, ".dsh-plugin", "index.mjs"), join(dir, ".dsh-plugin", "index.mjs"));
	await symlink(join(REPO_ROOT, "src"), join(dir, "src"));
	await symlink(join(REPO_ROOT, "node_modules"), join(dir, "node_modules"));
	return dir;
}

/** renderer 进程 CPU tick 总和：按唯一 user-data-dir 标记扫描 /proc，只计本测量
 *  浏览器的渲染进程（单页浏览器恰为被测页面）。进程瞬时消失按跳过处理。 */
function rendererCpuTicks(userDataDir) {
	let total = 0;
	for (const entry of readdirSync("/proc")) {
		if (!/^\d+$/.test(entry)) continue;
		try {
			const cmdline = readFileSync(join("/proc", entry, "cmdline"), "utf8");
			if (!cmdline.includes("--type=renderer") || !cmdline.includes(userDataDir)) continue;
			const stat = readFileSync(join("/proc", entry, "stat"), "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			total += Number(fields[11]) + Number(fields[12]); // utime + stime
		} catch {
			// /proc 条目瞬时消失：不计入（前后两次扫描同口径，差值仍守恒）
		}
	}
	return total;
}

function which(bin) {
	try {
		return execFileSync("which", [bin], { encoding: "utf8" }).trim();
	} catch {
		return null;
	}
}

function freePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

async function launchChrome(url) {
	const chromeBin = CHROME_CANDIDATES.map(which).find(Boolean);
	if (!chromeBin) throw new Error(`未找到 Chrome 可执行文件（候选：${CHROME_CANDIDATES.join(" / ")}）`);
	const port = await freePort();
	const userDataDir = await mkdtemp(join(tmpdir(), "dsh-perf-chrome-"));
	const child = spawn(chromeBin, [
		"--headless=new",
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${userDataDir}`,
		"--no-first-run",
		"--no-default-browser-check",
		url,
	], { stdio: ["ignore", "ignore", "pipe"] });
	const stderrTail = [];
	child.stderr.on("data", (data) => {
		stderrTail.push(String(data));
		if (stderrTail.length > 50) stderrTail.shift();
	});
	try {
		const deadline = Date.now() + 30_000;
		for (;;) {
			try {
				const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2_000) });
				if (res.ok) break;
			} catch {
				// 尚未就绪，继续轮询
			}
			if (child.exitCode !== null) throw new Error(`Chrome 提前退出（code=${child.exitCode}）：${stderrTail.slice(-5).join(" | ")}`);
			if (Date.now() > deadline) throw new Error("Chrome 调试端口就绪超时");
			await sleep(250);
		}
		const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
		const context = browser.contexts()[0];
		const page = context.pages()[0] ?? (await context.newPage());
		return { child, browser, page, userDataDir };
	} catch (error) {
		// 启动中途失败就地回收已启资源：外层 cleanup 登记时本函数尚未返回、读到
		// chrome===null 不会 kill——不就地回收会遗留带调试端口的活浏览器（T-182 审核）。
		child.kill("SIGKILL");
		await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
		throw error;
	}
}

/** 会话页内追加一轮消息：fill 后校验草稿再发送，被水合清空则由 until 整轮重试。 */
async function sendTurnInSession(page, text) {
	const composer = sessionComposer(page);
	await until("会话页 composer 草稿就位", async () => {
		try {
			await composer.fill(text, { timeout: 2_000 });
			return (await composer.textContent().catch(() => "")) === text ? true : null;
		} catch {
			return null;
		}
	}, 15_000);
	await page.keyboard.press("Enter");
}

/** 场景搭建：锚点会话（导航目标）+ 窗口填充会话（--fill 轮 fast 回合把日志窗口
 *  垫到生产量级——折叠单次成本与窗口大小成正比，短窗口下信号会被噪声淹没）。 */
async function setupScene(page, fillTurns) {
	await newSessionWithMessage(page, ANCHOR_TEXT);
	await newSessionWithMessage(page, FILL_TEXT);
	for (let i = 0; i < fillTurns; i += 1) {
		await sendTurnInSession(page, `e2e:fast A/B 填充 #${i + 1}`);
		await sleep(FILL_PACE_MS);
	}
}

/** 事件流入期测量窗（单迭代）：向填充会话发长流式后立即导航回锚点——流式全程
 *  落在后台（宿主会话视图不重渲染流块，插件折叠管线成为被测主体）；窗尾先采样
 *  再导航回填充会话（回导航与落定开销两变体同序同价，不进本窗）。 */
async function measureEventPeriod(page, userDataDir) {
	const cpuStart = rendererCpuTicks(userDataDir);
	const wallStart = Date.now();
	await sendTurnInSession(page, "e2e:longstream A/B 事件期探针");
	await sleep(500); // 流式确已开跑
	await activateCard(page, ANCHOR_CARD_TEXT);
	await sleep(BACKGROUND_STREAM_MS);
	const cpuEnd = rendererCpuTicks(userDataDir);
	const wallEnd = Date.now();
	await activateCard(page, FILL_CARD_TEXT);
	await sleep(1_200);
	return { cpuSeconds: ((cpuEnd - cpuStart) * TICK_MS) / 1000, wallSeconds: (wallEnd - wallStart) / 1000 };
}

/** 隐藏期测量窗：流式整体落在隐藏态（发送→转锚点→第二标签页置前）。真实隐藏
 *  优先（rAF 挂起 + 定时器豁免语义齐全）；headless 不生效时回落 defineProperty
 *  并打印实际模式（两模式都覆盖插件门控判定路径，回落模式对 B 的隐藏期成本
 *  估计偏保守）。窗尾恢复可见并等回前台补派生交付后再拆除。 */
async function measureHiddenPeriod(page, browser, userDataDir) {
	const page2 = await browser.contexts()[0].newPage();
	try {
		await sendTurnInSession(page, "e2e:longstream A/B 隐藏期探针");
		await sleep(500);
		await activateCard(page, ANCHOR_CARD_TEXT);
		await page2.goto("about:blank");
		await page2.bringToFront();
		let mode = "real-hidden";
		const visible = await page.evaluate(() => document.visibilityState).catch(() => "unknown");
		if (visible !== "hidden") {
			mode = "defineProperty-fallback";
			await page.evaluate(() => {
				Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
				document.dispatchEvent(new Event("visibilitychange"));
			});
		}
		const cpuStart = rendererCpuTicks(userDataDir);
		const wallStart = Date.now();
		await sleep(BACKGROUND_STREAM_MS);
		const cpuEnd = rendererCpuTicks(userDataDir);
		await page2.close().catch(() => {});
		await page.bringToFront().catch(() => {});
		const result = { cpuSeconds: ((cpuEnd - cpuStart) * TICK_MS) / 1000, wallSeconds: (Date.now() - wallStart) / 1000, mode };
		await sleep(2_000); // 回前台补派生（B 变体的延迟折叠）交付完再出窗
		return result;
	} finally {
		// try 体内采样后已先行关页（恢复可见触发回前台补派生），此处幂等兜底：
		// 若在 close 之前抛错，隐藏页仍需拆除（T-182 审核：有意幂等，非缺陷）。
		await page2.close().catch(() => {});
	}
}

/** 剖析版事件期测量：同一测量窗外挂 CDP 采样，产出折叠函数的自采样占比与
 *  绝对采样数。总 CPU 比值在隔离环境被宿主自身的流式期 UI 工作稀释（两变体
 *  同担的常量项），占比比值随分母漂移、仅作参考；机制断言（T-183 口径演进）
 *  挂折叠绝对采样数比值，对分母漂移免疫。占比口径与 T-181 调查基线（76%）
 *  同源可直接并排。 */
async function measureProfiledEventPeriod(page, userDataDir) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Profiler.enable");
	await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
	await cdp.send("Profiler.start");
	const period = await measureEventPeriod(page, userDataDir);
	const { profile } = await cdp.send("Profiler.stop");
	await cdp.detach().catch(() => {});
	let total = 0;
	let idle = 0;
	let fold = 0;
	// 采样名锚点：conversationTimelineFromHistory 定义于 src/core.mjs:1001（T-181
	// 修复的被测主体）；src 侧改名会让 foldSamples 静默归零——报告出现 0%/NaN 即此
	// 信号（下方有零采样告警），--check 方向安全（NaN 判 FAIL）。
	for (const node of profile.nodes) {
		const hits = node.hitCount ?? 0;
		total += hits;
		const name = node.callFrame.functionName || "(anon)";
		if (name === "(idle)") idle += hits;
		if (name === "conversationTimelineFromHistory") fold += hits;
	}
	const nonIdle = total - idle;
	return { ...period, foldShare: nonIdle > 0 ? fold / nonIdle : Number.NaN, foldSamples: fold, nonIdleSamples: nonIdle };
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 单变体测量：boot → Chrome → 场景搭建（锚点+窗口填充）→ 预热一轮（不计入）
 *  → K 次事件期 → 1 次隐藏期。 */
async function measureVariant(label, clientJsWriter, iterations, fillTurns) {
	const variantDir = await materializeVariantShell(label);
	await clientJsWriter(join(variantDir, ".dsh-plugin", "client.js"));
	const env = await bootE2e({ pluginRoot: variantDir });
	const cleanupSteps = [
		["variant-dir", () => rm(variantDir, { recursive: true, force: true })],
		["boot", env.cleanup],
	];
	let chrome = null;
	cleanupSteps.push([
		"chrome",
		async () => {
			chrome?.child?.kill("SIGKILL");
			await rm(chrome?.userDataDir ?? "", { recursive: true, force: true });
		},
	]);
	try {
		chrome = await launchChrome(env.url);
		await openApp(chrome.page, env.url);
		await setupScene(chrome.page, fillTurns);
		await measureEventPeriod(chrome.page, chrome.userDataDir); // 预热：JIT 与首流缓存，不计入
		const event = [];
		for (let i = 0; i < iterations; i += 1) event.push(await measureEventPeriod(chrome.page, chrome.userDataDir));
		const profiled = await measureProfiledEventPeriod(chrome.page, chrome.userDataDir);
		const hidden = await measureHiddenPeriod(chrome.page, chrome.browser, chrome.userDataDir);
		return { event, profiled, hidden };
	} finally {
		const errors = await settleCleanupSteps(cleanupSteps);
		if (errors.length > 0) console.error(`perf-ab: 清理告警：${errors.join("；")}`);
	}
}

const opts = parseArgs(process.argv.slice(2));
const baseCommit = opts.base ?? resolveBaseCommit();
const load1 = Number(readFileSync("/proc/loadavg", "utf8").split(" ")[0]);
const coreCount = Number(execFileSync("getconf", ["_NPROCESSORS_ONLN"], { encoding: "utf8" }).trim()) || 1;
if (load1 > coreCount * 0.5) console.log(`perf-ab: 负载告警：loadavg1=${load1}（核数 ${coreCount} 的 50%），比值噪声将增大`);

console.log(`perf-ab: 变体 A base=${baseCommit.slice(0, 8)}（该 bundle 即当前实现的对照基线）；变体 B=工作树现建；K=${opts.iterations}（另含 1 轮预热不计入）；窗口填充 ${opts.fill} 轮`);
const baseBundle = execFileSync("git", ["show", `${baseCommit}:.dsh-plugin/client.js`], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const variantA = await measureVariant("A", (outPath) => writeFile(outPath, baseBundle), opts.iterations, opts.fill);
const variantB = await measureVariant("B", (outPath) => build({ outPath }), opts.iterations, opts.fill);

const medAEvent = median(variantA.event.map((r) => r.cpuSeconds));
const medBEvent = median(variantB.event.map((r) => r.cpuSeconds));
const medAHidden = variantA.hidden.cpuSeconds;
const medBHidden = variantB.hidden.cpuSeconds;
const ratioEvent = medAEvent > 0 ? medBEvent / medAEvent : Number.NaN;
const ratioHidden = medAHidden > 0 ? medBHidden / medAHidden : Number.NaN;
const foldShareA = variantA.profiled.foldShare;
const foldShareB = variantB.profiled.foldShare;
const ratioFoldShare = foldShareA > 0 ? foldShareB / foldShareA : Number.NaN;
const ratioFoldSamples = variantA.profiled.foldSamples > 0 ? variantB.profiled.foldSamples / variantA.profiled.foldSamples : Number.NaN;

for (const [label, variant] of [["A", variantA], ["B", variantB]]) {
	const detail = variant.event.map((r) => r.cpuSeconds.toFixed(3)).join(" / ");
	console.log(`perf-ab: ${label} 事件期明细 ${detail} 核·s（窗 ${variant.event[0].wallSeconds.toFixed(1)}s/轮）；隐藏期 ${variant.hidden.cpuSeconds.toFixed(3)} 核·s（模式 ${variant.hidden.mode}）`);
	console.log(`perf-ab: ${label} 剖析：折叠函数占比 ${(variant.profiled.foldShare * 100).toFixed(1)}%（自采样 ${variant.profiled.foldSamples}/${variant.profiled.nonIdleSamples} 非空闲；单剖析迭代，非中位数）`);
	if (variant.profiled.foldSamples === 0) console.warn(`perf-ab: 告警：${label} 折叠函数零采样——src 侧改名（占比失真）或增量路径已完全接管全量折叠（T-185 后的预期形态），结合采样名锚点注释判读`);
}
console.log(`perf-ab: 事件期总 CPU 中位数 B/A = ${medBEvent.toFixed(3)} / ${medAEvent.toFixed(3)} = ${Number.isNaN(ratioEvent) ? "NaN" : ratioEvent.toFixed(3)}（折叠绝对采样 A=${variantA.profiled.foldSamples} / B=${variantB.profiled.foldSamples}；宿主常量负载稀释下总比值为参考项）`);
console.log(`perf-ab: 隐藏期总 CPU 中位数 B/A = ${medBHidden.toFixed(3)} / ${medAHidden.toFixed(3)} = ${Number.isNaN(ratioHidden) ? "N/A（A 低于 tick 分辨率）" : ratioHidden.toFixed(3)}（参考项）`);
console.log(`perf-ab: 折叠占比（单剖析迭代）B/A = ${(foldShareB * 100).toFixed(1)}% / ${(foldShareA * 100).toFixed(1)}% = ${Number.isNaN(ratioFoldShare) ? "NaN" : ratioFoldShare.toFixed(3)}（占比随分母漂移，仅参考）`);
if (opts.check) {
	// 机制断言按折叠绝对采样数比值（T-183 口径演进）：占比比值的分母随其他性能
	// 改动漂移（名册成本收敛会抬高折叠占比），绝对采样数在同采样间隔同窗长下
	// 可比、对分母漂移免疫；A 侧采样过少时断言不可靠，保守判 FAIL 并说明。
	const reliable = variantA.profiled.foldSamples >= 20;
	const pass = reliable && Number.isFinite(ratioFoldSamples) && ratioFoldSamples <= opts.threshold;
	console.log(`perf-ab: --check ${pass ? "PASS" : "FAIL"}（折叠绝对采样比值 ${Number.isFinite(ratioFoldSamples) ? ratioFoldSamples.toFixed(3) : "NaN"} ${pass ? "≤" : ">"} ${opts.threshold}${reliable ? "" : "；A 侧折叠采样过少（<20），断言不可靠"}）`);
	if (!pass) process.exitCode = 1;
}
