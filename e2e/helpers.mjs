// spec 共享辅助：轮询、窗格区域读取、首跑弹窗、会话创建驱动。
// 断言辅助只读用户可观察呈现（可见文字、包围盒、页面 URL）。

export const POLL_INTERVAL_MS = 200;

/** 轮询直到 fn() 返回真值或超时；超时抛错并附最后一次观测值。 */
export async function until(label, fn, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	let last;
	for (;;) {
		last = await fn();
		if (last) return last;
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
 *  宿主 sessions 服务偶发首推挂起（窗格滞留「加载中…」，见 TODO 缺陷线索）：
 *  停滞超过 12s 则重载一次——重载触发新连接世代重新拉取（实测即时恢复）；
 *  重载后仍停滞则抛错（真失败，不作无限掩盖）。 */
export async function openApp(page, url) {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await page.goto(url, { waitUntil: "networkidle" });
		await dismissNotice(page);
		const ready = await until("窗格数据就绪", async () => {
			const regions = await paneRegions(page);
			if (!regions) return null;
			return regions.active.includes("加载中") || regions.recent.includes("加载中") ? null : true;
		}, 12_000).catch(() => false);
		if (ready) return;
	}
	throw new Error("窗格数据停滞：重载后仍滞留「加载中…」（宿主 sessions 首推挂起未自愈）");
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

/** 在 hero 首页 composer 填入消息并发送（调用前 hero 必须已在场）；
 *  二次水合可能清空输入，填入后校验、被清空则重填；发送成功以 hero 消失为准。 */
export async function sendHeroMessage(page, text) {
	const hero = page.locator(`textarea[placeholder="${HERO_PLACEHOLDER}"]`);
	await hero.waitFor();
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
