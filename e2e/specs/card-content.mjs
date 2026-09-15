// R-01-003/AC-03、R-01-003/AC-08～AC-12、R-01-012/AC-01、R-01-012/AC-05、
// R-01-013/AC-01、R-01-013/AC-02、R-01-013/AC-03、R-01-013/AC-04、R-01-013/AC-05、R-01-013/AC-07、R-01-013/AC-08、R-01-013/AC-10、R-01-013/AC-11
// 卡面内容：活动卡显示工作区归属、模型名称与用户角色标签；最近卡按五层信息
// 结构呈现（工作区+模型 / 标题 / 用户预览 / 助手预览 / 活动时间）。

import { resolveWorkspaceColors } from "../../src/core.mjs";
import {
MOCK_FAST_REPLY, MOCK_MODEL, clickCardButton, ensureFullDensity, openApp, paneRegions, sendHeroMessage, until
} from "../helpers.mjs";

const TITLE = "e2e:fast 卡面内容探针";
const CONTRAST_PROBE_VARIANTS = (() => {
	const keys = [
		"/home/cailei/ops",
		"/home/cailei/proj/dsh-activity-pane",
		"/home/cailei/proj/ai-stack",
		...Array.from({ length: 36 }, (_, index) => `/e2e/contrast/${index}`),
	];
	const variants = new Map();
	for (const [sourceKey, color] of resolveWorkspaceColors(keys)) {
		if (!variants.has(color.background.slot)) variants.set(color.background.slot, { sourceKey, ...color });
	}
	return [...variants.values()].sort((a, b) => a.background.slot - b.background.slot);
})();

export default async function cardContent({ page, url, assert }) {
	await openApp(page, url);
	await ensureFullDensity(page);
	await sendHeroMessage(page, TITLE);

	// R-01-003/AC-03、R-01-012/AC-01、AC-05：活动卡承载归属、模型上下文与用户标签。
	// 助手回复可能被最多四行的折叠窗口裁掉，不把非契约窗口内容当作就绪条件。
	const active = await until("活动卡呈现", async () => {
		const regions = await paneRegions(page);
		return regions && regions.active.includes(TITLE) && regions.active.includes(MOCK_MODEL) && regions.active.includes("用户") ? regions.active : null;
	}, 20_000);
	assert.ok(active.includes("e2e"), "卡片显示工作区名称（R-01-003/AC-03）");
	assert.ok(active.includes(MOCK_MODEL) && active.includes("High"), "卡片显示模型名称与 reasoning level（R-01-012/AC-01）");
	assert.ok(active.includes("用户"), "时间线用户行带「用户」标签（R-01-012/AC-05）");
	// R-01-012/AC-01（右上角）：模型上下文与工作区徽标同行且在其右侧。
	const headerPos = await page.evaluate((model) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const leaves = [...pane.querySelectorAll("*")].filter((el) => el.children.length === 0);
		const badge = leaves.find((el) => el.textContent.trim() === "e2e");
		const modelEl = leaves.find((el) => el.textContent.trim().includes(model));
		if (!badge || !modelEl) return null;
		const b = badge.getBoundingClientRect();
		const m = modelEl.getBoundingClientRect();
		return { dx: m.x - b.x, dy: Math.abs(m.y - b.y) };
	}, MOCK_MODEL);
	assert.ok(headerPos && headerPos.dx > 0 && headerPos.dy < 24, "模型上下文在工作区徽标右侧同一行（卡面右上角，R-01-012/AC-01）");

	// R-01-003/AC-08～AC-12：浏览器实际应用工作区稳定颜色槽位与深浅主题 OKLCH 层次。
	// R-01-003/AC-10、R-01-003/AC-11：分别验证深浅主题变量、前景/底色/描边层次。
	const workspaceStyles = await page.evaluate(() => {
		const badge = document.querySelector("[data-dsh-activity-pane] .dap-workspace:not([hidden])");
		if (!badge) return null;
		const read = () => {
			const style = getComputedStyle(badge);
			return {
				hue: badge.style.getPropertyValue("--dap-workspace-hue"),
				backgroundDarkL: badge.style.getPropertyValue("--dap-workspace-bg-dark-l"),
				backgroundLightL: badge.style.getPropertyValue("--dap-workspace-bg-light-l"),
				backgroundDarkMix: badge.style.getPropertyValue("--dap-workspace-bg-dark-mix"),
				backgroundLightMix: badge.style.getPropertyValue("--dap-workspace-bg-light-mix"),
				color: style.color,
				background: style.backgroundColor,
				border: style.borderTopColor,
			};
		};
		document.body.setAttribute("data-ds-dark-theme", "");
		const dark = read();
		document.body.removeAttribute("data-ds-dark-theme");
		const light = read();
		document.body.setAttribute("data-ds-dark-theme", "");
		return { dark, light };
	});
	assert.ok(workspaceStyles && [55, 77, 100, 122, 145, 167, 190, 235, 257, 280, 302, 325].includes(Number(workspaceStyles.dark.hue)), "工作区徽标实际写入十二槽 OKLCH 颜色调色板（R-01-003/AC-08、AC-12）");
	assert.notEqual(workspaceStyles.dark.color, workspaceStyles.light.color, "工作区徽标文字色按深浅主题分别校准（R-01-003/AC-10、AC-11）");
	assert.ok(workspaceStyles.dark.backgroundDarkL !== "" && workspaceStyles.light.backgroundLightL !== "", "浏览器实际写入独立背景变体的主题明度（R-01-003/AC-10、AC-11）");
	assert.ok(workspaceStyles.dark.backgroundDarkMix !== "" && workspaceStyles.light.backgroundLightMix !== "", "浏览器实际写入独立背景变体的混合强度（R-01-003/AC-10、AC-11）");
	assert.ok(workspaceStyles.dark.background !== "rgba(0, 0, 0, 0)" && workspaceStyles.light.background !== "rgba(0, 0, 0, 0)", "工作区徽标深浅主题均有同色相族底色（R-01-003/AC-10、AC-11）");
	assert.ok(workspaceStyles.dark.border !== "rgba(0, 0, 0, 0)" && workspaceStyles.light.border !== "rgba(0, 0, 0, 0)", "工作区徽标深浅主题均有可见描边（R-01-003/AC-10、AC-11）");
	const backgroundVariants = await page.evaluate((resolvedVariants) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		if (!pane) return null;
		const card = document.createElement("div");
		card.className = "dap-card";
		card.style.position = "fixed";
		card.style.left = "-1000px";
		card.style.top = "0";
		const probe = document.createElement("div");
		probe.className = "dap-workspace";
		probe.textContent = "variant";
		card.append(probe);
		pane.append(card);
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext("2d");
		const composite = (foreground, backdrop) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = backdrop;
			context.fillRect(0, 0, 1, 1);
			context.fillStyle = foreground;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
		};
		const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
		const luminance = ([r, g, b]) => {
			const linear = [r, g, b].map((value) => {
				const channel = value / 255;
				return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
		};
		const contrast = (a, b) => {
			const light = Math.max(luminance(a), luminance(b));
			const dark = Math.min(luminance(a), luminance(b));
			return (light + 0.05) / (dark + 0.05);
		};
		const read = (theme, variant) => {
			const foreground = variant.foreground;
			const background = variant.background[theme];
			probe.style.setProperty("--dap-workspace-hue", String(foreground.hue));
			probe.style.setProperty(`--dap-workspace-${theme}-l`, String(theme === "dark" ? foreground.darkL : foreground.lightL));
			probe.style.setProperty(`--dap-workspace-${theme}-c`, String(theme === "dark" ? foreground.darkC : foreground.lightC));
			probe.style.setProperty(`--dap-workspace-bg-${theme}-l`, String(background.l));
			probe.style.setProperty(`--dap-workspace-bg-${theme}-c`, String(background.c));
			probe.style.setProperty(`--dap-workspace-bg-${theme}-mix`, background.mix);
			probe.style.setProperty(`--dap-workspace-bg-${theme}-border-mix`, background.borderMix);
			if (theme === "dark") document.body.setAttribute("data-ds-dark-theme", "");
			else document.body.removeAttribute("data-ds-dark-theme");
			const style = getComputedStyle(probe);
			const paneBackdrop = theme === "dark" ? "rgb(18, 21, 27)" : "rgb(255, 255, 255)";
			const cardPixel = composite(getComputedStyle(card).backgroundColor, paneBackdrop);
			const backgroundPixel = composite(style.backgroundColor, `rgb(${cardPixel.join(", ")})`);
			const borderPixel = composite(style.borderTopColor, `rgb(${cardPixel.join(", ")})`);
			return {
				sourceKey: variant.sourceKey,
				slot: variant.background.slot,
				background: style.backgroundColor,
				border: style.borderTopColor,
				backgroundDistance: distance(backgroundPixel, cardPixel),
				borderContrast: contrast(borderPixel, cardPixel),
			};
		};
		const result = {
			dark: resolvedVariants.map((variant) => read("dark", variant)),
			light: resolvedVariants.map((variant) => read("light", variant)),
		};
		card.remove();
		document.body.setAttribute("data-ds-dark-theme", "");
		return result;
	}, CONTRAST_PROBE_VARIANTS);
	assert.ok(backgroundVariants && new Set(backgroundVariants.dark.map((variant) => variant.slot)).size === 3, "浏览器实际呈现生产分配的三档深色背景变体（R-01-003/AC-10、AC-11）");
	assert.ok(backgroundVariants && new Set(backgroundVariants.light.map((variant) => variant.slot)).size === 3, "浏览器实际呈现生产分配的三档浅色背景变体（R-01-003/AC-10、AC-11）");
	assert.ok(backgroundVariants && backgroundVariants.dark.every((variant) => variant.backgroundDistance >= 4 && variant.borderContrast >= 1.5) && backgroundVariants.light.every((variant) => variant.backgroundDistance >= 4 && variant.borderContrast >= 1.5), "浏览器实际背景与描边相对卡片达到可辨对比（R-01-003/AC-10、AC-11）");

	// 完成提醒稳定后只激活一次；若重渲染吞 click，应由本 spec 直接报回归。
	await until("移入历史按钮就绪", async () => {
		const button = page.getByRole("button", { name: "移入历史", exact: true });
		return (await button.isVisible().catch(() => false)) ? true : null;
	}, 20_000);
	await clickCardButton(page, TITLE, "移入历史");
	await until("确认移入历史", async () => {
		const regions = await paneRegions(page);
		return regions?.recent.includes(TITLE) ? true : null;
	}, 20_000);
	// 以 DOM 叶子顺序核验五层（innerText 折行随渲染宽度变化，不能按行索引断言）：
	// 徽标 → 模型/reasoning → 会话标题 → 「用户」标签 → 用户消息首行 → 「助手」标签 → 回复首行 → 时间。
	const matched = await until("最近卡五层就绪", async () => {
		const result = await page.evaluate(({ title, model, reply }) => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (!pane) return null;
			if (pane.innerText.includes("移入历史")) return null; // 迁移动画未收尾
			const marker = [...pane.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.includes("最近历史"));
			if (!marker) return null;
			const markerY = marker.getBoundingClientRect().top;
			const leaves = [...pane.querySelectorAll("*")]
				.filter((el) => el.children.length === 0 && el.getBoundingClientRect().top > markerY)
				.map((el) => el.textContent.trim())
				.filter((text) => text !== "" && text !== "·");
			const expected = [
				(text) => text.includes("e2e"),
				(text) => text.includes(model) && text.includes("High"),
				(text) => text === title,
				(text) => text === "用户",
				(text) => text.includes("卡面内容探针"),
				(text) => text === "助手",
				(text) => text.includes(reply),
				(text) => text.includes("最近") || /\d{1,2}:\d{2}/.test(text),
			];
			let cursor = 0;
			for (const text of leaves) {
				if (cursor < expected.length && expected[cursor](text)) cursor += 1;
			}
			return cursor === expected.length ? leaves : null;
		}, { title: MOCK_FAST_REPLY, model: MOCK_MODEL, reply: MOCK_FAST_REPLY });
		return result;
	}, 20_000);
	// R-01-013/AC-01..05、AC-07、AC-08：五层结构按序命中即证（工作区+模型 / 标题 / 用户标签+首行 / 助手标签+首行 / 时间）。
	assert.ok(matched.length >= 8, `最近卡五层结构按序呈现（命中叶子 ${matched.length} 个）`);

	// R-01-013/AC-10、AC-11：在真实浏览器中验证最近卡弱化且深浅主题轮廓可辨。
	const recentStyles = await page.evaluate((title) => {
		const pane = document.querySelector("[data-dsh-activity-pane]");
		const card = [...(pane?.querySelectorAll('[role="button"]') ?? [])].find((candidate) => candidate.innerText.includes(title));
		if (!card) return null;
		const read = () => {
			const style = getComputedStyle(card);
			return { opacity: style.opacity, background: style.backgroundColor, border: style.borderTopColor };
		};
		document.body.setAttribute("data-ds-dark-theme", "");
		const dark = read();
		document.body.removeAttribute("data-ds-dark-theme");
		const light = read();
		document.body.setAttribute("data-ds-dark-theme", "");
		return { dark, light };
	}, TITLE);
	assert.equal(recentStyles?.dark.opacity, "0.8", "最近卡保持低于活动卡的不透明度（R-01-013/AC-10）");
	assert.equal(recentStyles?.dark.background, "rgba(26, 28, 34, 0.92)", "深色最近卡使用可辨中间档底色（R-01-013/AC-11）");
	assert.notEqual(recentStyles?.dark.border, "rgba(0, 0, 0, 0)", "深色最近卡具有可见描边（当前卡可由选中描边增强，R-01-013/AC-11）");
	assert.equal(recentStyles?.light.background, "rgb(243, 244, 246)", "浅色最近卡暗于活动卡纯白且与窗格可分辨（R-01-013/AC-11）");
	assert.notEqual(recentStyles?.light.border, "rgba(0, 0, 0, 0)", "浅色最近卡具有可见弱描边（R-01-013/AC-11）");

}
