// spec 共享辅助：轮询、窗格区域读取、首跑弹窗、会话创建驱动。
// 断言辅助只读用户可观察呈现（可见文字、包围盒、页面 URL）。

export const POLL_INTERVAL_MS = 200;
const PANE_READY_TIMEOUT_MS = 6_000;

/** 轮询直到 fn() 返回真值或超时；超时抛错并附最后一次观测值。E2E_TRACE=1 时打印各段耗时。 */
export async function until(label, fn, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	const start = Date.now();
	let last;
	for (;;) {
		last = await fn();
		if (process.env.E2E_TRACE === "2") console.error(`[poll] ${label}: ${JSON.stringify(last)?.slice(0, 120)} @${Date.now() - start}ms`);
		if (last) {
			if (process.env.E2E_TRACE) console.error(`[trace] ${label}: ${Date.now() - start}ms`);
			return last;
		}
		if (Date.now() > deadline) throw new Error(`等待超时：${label}（最后观测：${JSON.stringify(last)}）`);
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
}

/** 读取窗格可见文字，按「最近历史」区段标题切成活动区/历史区两段。 */
export async function paneRegions(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const text = pane.innerText;
		const marker = text.indexOf("最近历史");
		return {
			active: marker === -1 ? text : text.slice(0, marker),
			recent: marker === -1 ? "" : text.slice(marker),
		};
	});
}

/** 窗格根的包围盒（契约边界选择器仅此一个）。 */
export async function paneBox(page) {
	const box = await page.locator("[data-dsh-activity-pane]").boundingBox();
	return box;
}

/** 首跑公告弹窗仅在首次出现，存在则关掉。 */
export async function dismissNotice(page) {
	const notice = page.getByRole("button", { name: "Continue" });
	if (await notice.isVisible().catch(() => false)) await notice.click();
}

/** 打开应用并等待窗格数据就绪。
 *  rc.7 browser runtime 首次 list pull 失败后不会自重试；顺序 suite 中最多建立五个
 *  6s 页面连接世代，让新 SessionManager 在浏览器连接稳定后重新拉取。 */
export async function openApp(page, url) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		await page.goto(url, { waitUntil: "networkidle" });
		await dismissNotice(page);
		const outcome = await until("窗格数据就绪", async () => {
			const regions = await paneRegions(page);
			if (!regions) return null;
			if (regions.active.includes("列表加载失败") || regions.recent.includes("列表加载失败")) return "error";
			return regions.active.includes("加载中") || regions.recent.includes("加载中") ? null : "ready";
		}, PANE_READY_TIMEOUT_MS).catch(() => "timeout");
		if (outcome === "ready") return;
	}
	const error = new Error("窗格数据停滞：五个 sessions 连接世代仍未就绪");
	error.code = ERR_PANE_STALL;
	throw error;
}

/** 主会话区（窗格右缘以右）是否可见地出现指定文字（叶子节点匹配，默认子串）。 */
export async function mainAreaHas(page, text, { exact = false } = {}) {
	const box = await paneBox(page);
	if (!box) return false;
	const paneRight = box.x + box.width;
	return page.evaluate(
		({ text, paneRight, exact }) =>
			[...document.querySelectorAll("body *")]
				.filter((el) => {
					if (el.children.length > 0) return false;
					const content = el.textContent.trim();
					return exact ? content === text : content.includes(text);
				})
				.some((el) => {
					const rect = el.getBoundingClientRect();
					return rect.width > 0 && rect.x > paneRight;
				}),
		{ text, paneRight, exact },
	);
}

/** 主会话区的可滚动区域包围盒（窗格右缘到视口右缘）。 */
export async function mainAreaBox(page) {
	const box = await paneBox(page);
	if (!box) return null;
	const viewport = page.viewportSize();
	return { x: box.x + box.width + 1, y: 0, width: viewport.width - box.x - box.width - 2, height: viewport.height };
}

/** 指定文字在窗格内可见（叶子节点精确匹配，包围盒落在窗格可视范围内）。 */
export async function cardVisibleInPane(page, text) {
	return page.evaluate((text) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return false;
		const paneRect = pane.getBoundingClientRect();
		return [...pane.querySelectorAll("*")]
			.filter((el) => el.children.length === 0 && el.textContent.trim() === text)
			.some((el) => {
				const rect = el.getBoundingClientRect();
				return rect.height > 0 && rect.top >= paneRect.top - 1 && rect.bottom <= paneRect.bottom + 1;
			});
	}, text);
}

const HERO_PLACEHOLDER = "Describe what you want to build";

/** mock LLM 固定输出（与 e2e/mock-llm.mjs 剧本一致），spec 断言复用避免多处硬编码。 */
export const MOCK_FAST_REPLY = "E2E 快速回合已完成。";
/** 隔离环境卡面显示的模型名（boot.mjs 种子为小写 id，显示名经宿主模型目录映射）。 */
export const MOCK_MODEL = "DeepSeek-V4-Flash";

/** 窗格数据停滞错误签名：run.mjs 据此换环境重试，不靠文案子串耦合。 */
export const ERR_PANE_STALL = "E2E_PANE_STALL";

/** 在 hero 首页 composer 填入消息并发送；
 *  宿主偶发在启动时直接恢复进会话视图（无 hero）——先点 New session 回 hero。
 *  二次水合可能清空输入，填入后校验、被清空则重填；发送成功以 hero 消失为准。 */
export async function sendHeroMessage(page, text) {
	const hero = page.locator(`textarea[placeholder="${HERO_PLACEHOLDER}"]`);
	for (let attempt = 0; ; attempt += 1) {
		const visible = await hero.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
		if (visible) break;
		if (attempt >= 1) throw new Error("hero composer 未出现（New session 后仍无）");
		await page.getByRole("button", { name: "New session" }).first().click();
	}
	await until(`发送消息「${text}」`, async () => {
		await hero.fill(text).catch(() => {});
		await page.waitForTimeout(400);
		if ((await hero.inputValue().catch(() => "")) !== text) return null; // 被水合清空，下轮重填
		await page.keyboard.press("Enter");
		await page.waitForTimeout(1000);
		return (await hero.count()) === 0 ? true : null; // 已进入会话页
	}, 20_000);
}

/** 从会话页新建会话：点 sidebar New session 并等 hero 在场，再发送。 */
export async function newSessionWithMessage(page, text) {
	await page.getByRole("button", { name: "New session" }).first().click();
	await until("hero composer 出现", async () => {
		const hero = page.locator(`textarea[placeholder="${HERO_PLACEHOLDER}"]`);
		return (await hero.count()) > 0 ? true : null;
	});
	await sendHeroMessage(page, text);
}

/** 在指定包围盒中心滚动滚轮。 */
export async function wheelOver(page, box, deltaY, times) {
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (let i = 0; i < times; i += 1) {
		await page.mouse.wheel(0, deltaY);
		await page.waitForTimeout(60);
	}
}

/** 激活包含指定可见文本的会话卡片，只依赖卡片的 button 语义与用户可见内容。 */
export async function activateCard(page, cardText) {
	const clicked = await page.evaluate((text) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const card = [...(pane?.querySelectorAll('[role="button"]') ?? [])].find((candidate) => candidate.innerText.includes(text));
		card?.click();
		return card !== undefined;
	}, cardText);
	if (!clicked) throw new Error(`找不到包含「${cardText}」的会话卡片`);
}

/** 点击窗格内指定卡片上的按钮：以标题叶子与按钮包围盒的纵向邻近度定位同一张卡
 *  （避免依赖卡片内部结构类名）。 */
export async function clickCardButton(page, cardTitle, buttonName) {
	const buttons = page.getByRole("button", { name: buttonName, exact: true });
	const titleBox = await page
		.locator("[data-dsh-activity-pane]")
		.getByText(cardTitle, { exact: false })
		.first()
		.boundingBox();
	if (!titleBox) throw new Error(`找不到卡片标题「${cardTitle}」`);
	const count = await buttons.count();
	for (let i = 0; i < count; i += 1) {
		const box = await buttons.nth(i).boundingBox();
		// 同一卡片内：按钮在标题下方且纵向距离在一个卡高以内。
		if (box && box.y >= titleBox.y && box.y - titleBox.y < 200) {
			await buttons.nth(i).click();
			return;
		}
	}
	throw new Error(`卡片「${cardTitle}」上找不到按钮「${buttonName}」`);
}
