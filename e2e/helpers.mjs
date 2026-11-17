// spec 共享辅助：轮询、窗格区域读取、首跑弹窗、会话创建驱动。
// 断言辅助只读用户可观察呈现（可见文字、包围盒、页面 URL）。

export const POLL_INTERVAL_MS = 200;
// 启动期活性等待：高负载宿主下 goto(networkidle)+公告处理+首屏数据可能超 6s，
// 与「列表加载失败」的显式报错路径无关，超时加宽只吸收调度抖动、不弱化断言。
const PANE_READY_TIMEOUT_MS = 30_000;

/** 轮询直到 fn() 返回真值或超时；超时抛错并附最后一次观测值。E2E_TRACE=1 时打印各段耗时。 */
export async function until(label, fn, timeoutMs = 20_000) {
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

/** 读取窗格可见文字，按「最近历史」区段标题切成活动区/历史区两段。
 *  用 textContent 而非 innerText：移动端抽屉关闭时 pane 子树屏外休眠
 *  （content-visibility: hidden，T-127）无布局，innerText 返回空；休眠期数据
 *  仍在更新，textContent 不依赖布局，恰好锚定「隐藏不冻结数据」语义。 */
export async function paneRegions(page) {
	return page.evaluate(() => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const text = pane.textContent;
		const marker = text.indexOf("最近历史");
		return {
			active: marker === -1 ? text : text.slice(0, marker),
			recent: marker === -1 ? "" : text.slice(marker),
		};
	});
}

/** 读取宿主错误/完成登记全量快照，仅供跨边界失败诊断。 */
export async function activityAcks(page) {
	return page.evaluate(() => fetch("/dsh-activity-pane/api/acks").then((res) => res.json()));
}

/** 窗格根的包围盒（契约边界选择器仅此一个）。 */
export async function paneBox(page) {
	const box = await page.locator("[data-dsh-activity-pane]").boundingBox();
	return box;
}

/** 注入模拟 ⊡ 锚（T-167）：部署侧 hero 页由 dsh-web-mobile 挂侧栏展开按钮
 *  （语义属性 data-mobile-nav="fab"），本 e2e 壳层无该插件，注入同位同形的
 *  模拟锚承载开关 hero 贴靠落位。几何取壳层实现值（base.css.ts：left:10、
 *  top:12、38×38；T-166 真机实测同值）。幂等：已存在则不动；frame 未就绪时
 *  轮询重试，调用方无需处理时序。 */
export async function injectMobileFabAnchor(page) {
	await page.evaluate(() => {
		const ensure = () => {
			const frame = document.querySelector("[data-shell-overlay]")?.parentElement;
			if (!frame) return false;
			if (document.querySelector('button[data-mobile-nav="fab"]') !== null) return true;
			const fab = document.createElement("button");
			fab.dataset.mobileNav = "fab";
			fab.style.cssText = "position:absolute;left:10px;top:12px;width:38px;height:38px;";
			frame.appendChild(fab);
			return true;
		};
		if (ensure()) return;
		const timer = setInterval(() => {
			if (ensure()) clearInterval(timer);
		}, 100);
	});
}

/** 读写宿主 frame 抽屉状态属性：frame 为 [data-shell-overlay] 的 parentElement
 *  （与插件落位守卫同源）；collapsed=true 置属性（壳层收起态语义），false 移除
 *  （展开态语义）。overlay 或 frame 未就绪时静默跳过；连续异值调用保证至少一次
 *  属性突变，可用作帧观察器的唤醒手段（T-168）。 */
export async function setHostDrawerCollapsed(page, collapsed) {
	await page.evaluate((collapsed) => {
		const frame = document.querySelector("[data-shell-overlay]")?.parentElement ?? null;
		if (frame === null) return;
		if (collapsed) frame.setAttribute("data-sidebar-collapsed", "");
		else frame.removeAttribute("data-sidebar-collapsed");
	}, collapsed);
}

/** 将窗格切到完整呈现档：默认中间档的时间线只渲染最新一行（lastOnly），依赖用户指令
 *  锚行等完整时间线内容的断言需先切档（默认中间档见 R-01-021/AC-06）。 */
export async function ensureFullDensity(page) {
	await until("窗格切换至完整呈现", async () => {
		const density = await page.evaluate(() => document.querySelector("[data-dsh-activity-pane]")?.getAttribute("data-density"));
		if (density === "full") return true;
		await page.evaluate(() => document.querySelector("[data-dsh-activity-pane] .dap-density")?.click());
		return null;
	}, 10_000);
}

/** 首跑公告弹窗仅在首次出现，存在则关掉。 */
export async function dismissNotice(page) {
	// 公告按钮会先以 disabled 挂载再启用，也可能在水合时被替换；在一次 DOM 执行内查找并激活，避免 locator 自动等待竞态。
	// dsh 0.2.0（T-159）：公告模态挂载晚于 networkidle 且可晚于首轮 dismiss——
	// 循环清除直到遮罩消失（上限 10 轮），消除「dismiss 后遮罩才挂载」的竞态。
	for (let round = 0; round < 10; round += 1) {
		const state = await page.evaluate(() => {
			const mask = [...document.querySelectorAll("div")].some((candidate) => String(candidate.className).includes("_mask_"));
			const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === "Continue" && !candidate.disabled && candidate.getBoundingClientRect().height > 0);
			if (button) button.click();
			return { mask, clicked: button !== undefined };
		});
		if (!state.mask && !state.clicked) return;
		await page.waitForTimeout(400);
	}
}

/** 打开应用并等待窗格数据就绪；列表状态转换由产品渲染签名保证即时落到 DOM，
 *  测试只建立一个页面连接世代，超时或明确失败均直接暴露为回归。 */
export async function openApp(page, url) {
	await page.goto(url, { waitUntil: "networkidle" });
	await dismissNotice(page);
	await until("窗格数据就绪", async () => {
		const regions = await paneRegions(page);
		if (!regions) return null;
		if (regions.active.includes("列表加载失败") || regions.recent.includes("列表加载失败")) {
			throw new Error("窗格列表加载失败");
		}
		return regions.active.includes("加载中") || regions.recent.includes("加载中") ? null : regions;
	}, PANE_READY_TIMEOUT_MS);
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

/** hero composer 占位前缀（宿主 0.1.5 起文案追加「/ commands, @ files...」后缀，按前缀匹配）。 */
const HERO_PLACEHOLDER = "Describe what you want to build";
/** 会话页 composer 占位前缀（宿主 0.1.5 起文案为「Message or run a task, / commands...」）。 */
const COMPOSER_PLACEHOLDER = "Message or run a task";

/** 会话页 composer 定位器：宿主 0.1.5 起为 Lexical contenteditable（非 textarea），
 *  placeholder 经 `data-placeholder` 属性暴露，按前缀匹配文案前缀差异。 */
export function sessionComposer(page) {
	return page.locator(`[data-placeholder^="${COMPOSER_PLACEHOLDER}"]`);
}

/** mock LLM 固定输出（与 e2e/mock-llm.mjs 剧本一致），spec 断言复用避免多处硬编码。 */
export const MOCK_FAST_REPLY = "E2E 快速回合已完成。";
export const MOCK_ERROR_MESSAGE = "E2E 模型故障探针";
/** 隔离环境卡面显示的模型名（boot.mjs 种子 deepseek-flash，显示名经宿主模型目录映射；
 *  DeepSeek-V41-Flash 为 0.1.5/0.2.0 宿主目录共有条目，T-159）。 */
export const MOCK_MODEL = "DeepSeek-V41-Flash";
/** 等待卡状态年龄的相对时间分级文案（R-01-002/AC-14）：与历史卡 fmtRelativeAge 分级一致。 */
export const RELATIVE_AGE_PATTERN = /^(?:刚刚|\d+分钟前|\d+小时前|\d+天前|\d+周前|\d+个月前|\d+年前)$/;

/** 在 hero 首页 composer 填入消息并发送；
 *  宿主偶发在启动时直接恢复进会话视图（无 hero）——先点 New session 回 hero。
 *  二次水合可能清空输入，填入后校验、被清空则重填。发送成功的判据是「hero 编辑器不在场
 *  且会话页 composer 在场」，再等 800ms 落地稳定窗才返回：紧随其后的「New session」点击若
 *  落在过渡期会被宿主忽略（T-196）。 */
export async function sendHeroMessage(page, text) {
	const hero = page.locator(`[data-placeholder^="${HERO_PLACEHOLDER}"]`);
	await dismissNotice(page);
	for (let attempt = 0; ; attempt += 1) {
		const visible = await hero.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
		if (visible) break;
		if (attempt >= 1) throw new Error("hero composer 未出现（New session 后仍无）");
		await page.getByRole("button", { name: "New session" }).first().click();
	}
	// 落地判据：hero 编辑器不在场且会话页 composer 在场。只看 hero 短暂缺席会把水合期的
	// 重挂载误判成「已发送」——发送轮询会空转返回真、会话根本没创建（T-196）。
	// 命中后等 800ms 稳定窗：hero 消失与会话页可交互之间还有过渡，紧接着点「New session」
	// 会落在过渡期的按钮上被宿主忽略（T-196 本地复现）。
	const landed = async (timeout) => {
		const deadline = Date.now() + timeout;
		for (;;) {
			if ((await hero.count()) === 0 && (await sessionComposer(page).count()) > 0) {
				await page.waitForTimeout(800);
				return true;
			}
			if (Date.now() > deadline) return false;
			await page.waitForTimeout(POLL_INTERVAL_MS);
		}
	};
	// 发送按钮：空草稿时宿主置 disabled，草稿被注册后启用——比键盘焦点可靠的「可发送」信号。
	const sendButton = page.getByRole("button", { name: "Send message" }).first();
	const waitSendReady = async (timeout) => {
		const deadline = Date.now() + timeout;
		for (;;) {
			if (await sendButton.isEnabled().catch(() => false)) return true;
			if (Date.now() > deadline) return false;
			await page.waitForTimeout(POLL_INTERVAL_MS);
		}
	};
	// 单轮发送尝试：返回是否已发送；未受理时附本轮观测，超时报错带上它，CI 复红可直接
	// 区分「草稿未注册 / 按钮未启用 / 点击被丢弃 / 已受理但切页慢」（T-196）。
	const attemptOnce = async () => {
		// 首跑公告可能在 goto/networkidle 之后延迟挂载；每轮先处理，避免遮罩吞掉 composer 键盘事件。
		await dismissNotice(page);
		// 短超时：切页过程中 hero 节点可能已卸载，避免 fill 落在被移除节点上空等默认 30s。
		await hero.fill(text, { timeout: 5_000 }).catch(() => {});
		await page.waitForTimeout(400);
		// contenteditable 无 inputValue，经 textContent 校验草稿（被水合清空则下轮重填）。
		const draft = await hero.textContent().catch(() => "");
		if (draft !== text) return { sent: false, note: `草稿未就绪（${JSON.stringify(draft.slice(0, 24))}）` };
		// 等发送按钮启用再点：按钮仍 disabled 说明草稿未被宿主注册（水合期常见），本轮重填。
		if (!(await waitSendReady(3_000))) return { sent: false, note: "发送按钮未启用" };
		// 点发送按钮而非仅按 Enter（T-196）：Enter 依赖键盘焦点，宿主替换编辑器节点后发送会被
		// 静默丢弃（hosted runner 上表现为长时间不离开 hero）；按钮是用户可见的同一动作。
		await sendButton.click({ timeout: 2_000 }).catch(() => {});
		if (await landed(5_000)) return { sent: true };
		// 按钮回到 disabled = 草稿已被消费（受理中，切页慢）：只等落地，不再重发。
		// 仅凭「草稿为空」不作数——水合清空同样是空草稿，重填才是正确恢复。
		if (await sendButton.isDisabled().catch(() => false)) {
			return { sent: false, accepted: true, note: "已受理（按钮 disabled），等待切页" };
		}
		return { sent: false, note: "发送未受理（按钮仍可用）" };
	};
	// 本轮发送是否已被宿主受理：受理后草稿被消费、切页可能晚于 5s 窗口——置位后只等落地，
	// 不再重填重发（否则会在已受理的发送上叠出第二条消息）。
	let accepted = false;
	let note = "尚未尝试";
	await until(`发送消息「${text}」`, async () => {
		if (accepted) {
			if (await landed(5_000)) return true;
			note = "已受理，等待切页";
			return null;
		}
		const result = await attemptOnce();
		if (result.sent) return true;
		if (result.accepted) accepted = true;
		note = result.note;
		return null;
	}, 45_000).catch(async (error) => {
		throw new Error(`${error.message}｜${note}；hero=${await hero.count()} 会话 composer=${await sessionComposer(page).count()}`);
	});
}

/** 从会话页新建会话：点 sidebar New session 并等 hero 在场，再发送。 */
export async function newSessionWithMessage(page, text) {
	// 首跑公告可能晚于 openApp 的 dismiss 窗口挂载（T-159），裸点击会被遮罩拦截
	// （今日全量 verify 两轮各命中 recent-infinite-scroll/repo-entry 同签名）：
	// 先清公告再点击，点击被拦截则整轮重试，与 sendHeroMessage 同型循环。
	await until("New session 点击落地", async () => {
		await dismissNotice(page);
		const clicked = await page
			.getByRole("button", { name: "New session" })
			.first()
			.click({ timeout: 2_000 })
			.then(() => true)
			.catch(() => false);
		return clicked ? true : null;
	}, 30_000);
	await until("hero composer 出现", async () => {
		const hero = page.locator(`[data-placeholder^="${HERO_PLACEHOLDER}"]`);
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

/** 壳层连接自愈自愈标记（T-191/T-192 共享）：重建发起时 console.info 的标识串。 */
export const CONNECTION_HEAL_MARKER = "回前台重建壳层连接";

/** 合成一次「stub visibilityState 的 hidden→visible 对」：stub 窗口承载真实隐藏时长。 */
export function syntheticHideRestore(page, hiddenMs) {
	return page.evaluate(
		(duration) =>
			new Promise((resolve) => {
				Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
				document.dispatchEvent(new Event("visibilitychange"));
				setTimeout(() => {
					Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
					document.dispatchEvent(new Event("visibilitychange"));
					resolve();
				}, duration);
			}),
		hiddenMs,
	);
}

/** 合成 bfcache 还原：pageshow 且 persisted=true（Event 构造器不支持 init persisted）。 */
export function syntheticBfcacheRestore(page) {
	return page.evaluate(() => {
		const event = new Event("pageshow");
		Object.defineProperty(event, "persisted", { value: true });
		window.dispatchEvent(event);
	});
}
