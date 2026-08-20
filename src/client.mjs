// dsh-activity-pane 浏览器运行时。
//
// 挂载策略：把窗格作为 AppFrame 中 `conversation` 槽座的前置兄弟列插入
// （`#root [data-slot="conversation"] || .parentElement` 即 flex 行），让外壳的
// 让步链挤压中间栏；窄屏（<=767px）转为固定抽屉 + 浮动开关按钮。
//
// 数据来源：DSH 原生 `sessions` / `workspaces` 客户端服务（推送式快照），
// 不依赖 dsh-answer-pet 的 /answer-pet/state 路由，因此无需轮询。

const name = "dsh-activity-pane";
const inject = [];

const CONVERSATION_SELECTOR = "#root [data-slot=\"conversation\"]";
const PANE_ATTR = "data-dsh-activity-pane";
const PANE_CLASS = "dap-pane";
const LIST_CLASS = "dap-list";
const CARD_CLASS = "dap-card";
const STYLE_ID = "dsh-activity-pane-style";
const DEFAULT_WIDTH = 280;
const INDENT_PX = 16;
const MOBILE_BREAKPOINT = "767px";

const CSS = `
[data-dsh-activity-pane] {
  --dap-width: ${DEFAULT_WIDTH}px;
  flex: 0 0 var(--dap-width);
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  border-right: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 3%, transparent);
  color: var(--dsw-alias-label-primary, #e8ebf2);
  user-select: none;
}
[data-dsh-activity-pane] .dap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
[data-dsh-activity-pane] .dap-count {
  flex: none;
  font-size: 10px;
  line-height: 16px;
  font-weight: 600;
  color: #221a10;
  background: linear-gradient(180deg, #ffd488, #e8a33d);
  border-radius: 999px;
  padding: 0 7px;
}
[data-dsh-activity-pane] .dap-count[data-awaiting] {
  background: linear-gradient(180deg, #ffb4b4, #f06a72);
  color: #2a1012;
  animation: dap-await-pulse 1.2s ease-in-out infinite;
}
@keyframes dap-await-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
[data-dsh-activity-pane] .dap-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px 10px;
}
/* 卡片视觉沿用 answer-pet 的多会话卡片设计（MIT 参考，见 README）。 */
[data-dsh-activity-pane] .dap-card {
  flex: none;
  min-width: 0;
  padding: 9px 11px;
  border-radius: 14px;
  background: rgba(29, 31, 37, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  display: grid;
  gap: 4px;
  cursor: pointer;
}
[data-dsh-activity-pane] .dap-card:hover {
  border-color: rgba(255, 255, 255, 0.28);
}
[data-dsh-activity-pane] .dap-card:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 70%, transparent);
  outline-offset: 2px;
}
[data-dsh-activity-pane] .dap-card[data-kind="subagent"] {
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(25, 27, 32, 0.95);
}
[data-dsh-activity-pane] .dap-card[data-current] {
  border-color: color-mix(in srgb, #65a0ff 75%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #65a0ff 45%, transparent), 0 0 12px color-mix(in srgb, #65a0ff 30%, transparent);
}
[data-dsh-activity-pane] .dap-card[data-awaiting] {
  border-color: color-mix(in srgb, #e8a33d 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #e8a33d 35%, transparent), 0 6px 16px rgba(0,0,0,.3);
  background: rgba(35, 31, 25, 0.97);
}
[data-dsh-activity-pane] .dap-card[data-opening] {
  opacity: 0.85;
  animation: dap-opening 0.9s ease-in-out infinite;
}
@keyframes dap-opening { 0%,100% { opacity: 0.95; } 50% { opacity: 0.5; } }
[data-dsh-activity-pane] .dap-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
[data-dsh-activity-pane] .dap-dot {
  width: 7px; height: 7px; flex: none; border-radius: 50%;
  background: #58c98f;
  box-shadow: 0 0 7px rgba(88,201,143,.8);
  animation: dap-pulse 1.2s ease-in-out infinite;
}
@keyframes dap-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
[data-dsh-activity-pane] .dap-card[data-awaiting] .dap-dot {
  background: #e8a33d;
  box-shadow: 0 0 8px rgba(232,163,61,.85);
}
[data-dsh-activity-pane] .dap-title {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 12px; line-height: 16px; font-weight: 700;
}
[data-dsh-activity-pane] .dap-badge {
  flex: none; font-size: 10px; line-height: 14px; font-weight: 600;
  color: #221a10; background: linear-gradient(180deg, #ffd488, #e8a33d);
  border-radius: 999px; padding: 0 7px;
}
[data-dsh-activity-pane] .dap-workspace {
  width: fit-content; max-width: 100%; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 9.5px; line-height: 14px;
  color: color-mix(in srgb, currentColor 90%, transparent);
  background: color-mix(in srgb, currentColor 11%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 999px; padding: 0 7px;
}
[data-dsh-activity-pane] .dap-workspace[hidden] { display: none; }
[data-dsh-activity-pane] .dap-note {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; line-height: 15px;
  color: color-mix(in srgb, currentColor 62%, transparent);
}
[data-dsh-activity-pane] .dap-empty {
  padding: 14px 12px; font-size: 12px; text-align: center;
  color: color-mix(in srgb, currentColor 45%, transparent);
}
[data-dsh-activity-pane] .dap-close {
  margin-left: auto; cursor: pointer; border: 0; border-radius: 999px;
  font-size: 14px; line-height: 20px; min-width: 20px; text-align: center;
  background: color-mix(in srgb, currentColor 14%, transparent);
  color: currentColor;
}
/* 移动端浮动开关按钮：仅在窄屏显示（桌面隐藏）。 */
.dap-toggle {
  position: fixed; top: 12px; right: 12px; z-index: 2147482991;
  display: none;
  align-items: center; gap: 6px;
  min-height: 30px; padding: 0 11px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  background: rgba(24, 28, 38, 0.94);
  color: currentColor;
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0,0,0,.34);
}
.dap-toggle .dap-toggle-count {
  min-width: 16px; text-align: center; border-radius: 999px;
  background: color-mix(in srgb, currentColor 16%, transparent);
  padding: 0 5px; font-size: 10px; font-weight: 700;
}
.dap-toggle[data-awaiting] .dap-toggle-count {
  background: linear-gradient(180deg, #ffb4b4, #f06a72);
  color: #2a1012;
  animation: dap-await-pulse 1.2s ease-in-out infinite;
}
/* 窄屏：窗格变为固定抽屉 + 浮动开关按钮；抽屉默认隐藏在屏幕外。 */
@media (max-width: ${MOBILE_BREAKPOINT}) {
  [data-dsh-activity-pane] {
    position: fixed; left: 0; top: 0; bottom: 0;
    width: min(84vw, 320px);
    margin: 0;
    border-right: 1px solid currentColor;
    box-shadow: 8px 0 28px rgba(0,0,0,.5);
    transform: translateX(-102%);
    transition: transform 180ms ease;
    z-index: 2147482990;
  }
  [data-dsh-activity-pane][data-open="true"] { transform: translateX(0); }
  .dap-toggle { display: flex; }
}
`;

function getSnapshot(service, key) {
	try {
		return service?.[key]?.getSnapshot?.() ?? null;
	} catch {
		return null;
	}
}

function schedule(callback) {
	if (typeof window.requestAnimationFrame === "function") {
		window.requestAnimationFrame(callback);
	} else {
		queueMicrotask(callback);
	}
}

function apply(ctx) {
	let disposed = false;
	let sessions = null;
	let workspaces = null;
	let sessionUnsubscribe = null;
	let workspaceUnsubscribe = null;
	let serviceTimer = null;
	let syncScheduled = false;
	let lastSig = "";
	/** id → { el, kind } 复用表；kind 变化时重建卡片内部 DOM。 */
	const cardsById = new Map();

	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	document.head.appendChild(style);

	// 移动端浮动开关按钮（桌面隐藏见 CSS）。
	const toggle = document.createElement("button");
	toggle.className = "dap-toggle";
	toggle.type = "button";
	toggle.setAttribute(
		"aria-label",
		"切换活动会话窗格",
	);
	toggle.innerHTML =
		"<span>活动会话</span><span class=\"dap-toggle-count\"></span>";
	document.body.appendChild(toggle);

	function queueSync() {
		if (disposed || syncScheduled) return;
		syncScheduled = true;
		schedule(() => {
			syncScheduled = false;
			if (!disposed) render();
		});
	}

	function installServiceSubscriptions() {
		const nextSessions = ctx.get("sessions");
		const nextWorkspaces = ctx.get("workspaces");
		if (nextSessions === sessions && nextWorkspaces === workspaces) return;

		sessionUnsubscribe?.();
		workspaceUnsubscribe?.();
		sessions = nextSessions ?? null;
		workspaces = nextWorkspaces ?? null;
		sessionUnsubscribe = sessions?.list?.subscribe?.(queueSync) ?? null;
		workspaceUnsubscribe = workspaces?.list?.subscribe?.(queueSync) ?? null;

		if (sessions !== null && workspaces !== null && serviceTimer !== null) {
			clearInterval(serviceTimer);
			serviceTimer = null;
		}
		queueSync();
	}

	// ---- 窗格容器（conversation 槽座的前置兄弟列；外壳重挂载后重插） ----
	function ensurePane() {
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		if (seat === null || seat.parentElement === null) return null;
		let pane = seat.parentElement.querySelector(`[${PANE_ATTR}]`);
		if (pane === null) {
			pane = document.createElement("aside");
			pane.setAttribute(PANE_ATTR, "");
			pane.className = PANE_CLASS;
			seat.parentElement.insertBefore(pane, seat);
			pane.innerHTML = `
				<div class="dap-header">
					<span>活动会话</span>
					<span class="dap-count" role="status" aria-live="polite"></span>
					<button class="dap-close" type="button" aria-label="收起窗格">×</button>
				</div>
				<div class="dap-list" tabindex="-1"></div>
			`;
		}
		return pane;
	}

	function makeEl(tag, cls) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		return node;
	}

	/** 静态骨架卡片；动态文本一律走 textContent，规避 HTML 注入。 */
	function cardChildren(kind) {
		if (kind === "subagent") {
			const row = makeEl("div", "dap-row");
			row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
			return [row];
		}
		if (kind === "awaiting") {
			const row = makeEl("div", "dap-row");
			row.append(
				makeEl("span", "dap-dot"),
				makeEl("span", "dap-title"),
				makeEl("span", "dap-badge"),
			);
			return [makeEl("div", "dap-workspace"), row, makeEl("div", "dap-note")];
		}
		const row = makeEl("div", "dap-row");
		row.append(makeEl("span", "dap-dot"), makeEl("span", "dap-title"));
		return [makeEl("div", "dap-workspace"), row, makeEl("div", "dap-note")];
	}

	function renderCardInto(el, entry) {
		const workspaceLabel = el.querySelector(".dap-workspace");
		if (workspaceLabel !== null) {
			if (entry.workspaceTitle !== "") {
				workspaceLabel.textContent = entry.workspaceTitle;
				workspaceLabel.removeAttribute("hidden");
			} else {
				workspaceLabel.textContent = "";
				workspaceLabel.setAttribute("hidden", "");
			}
		}
		const title = el.querySelector(".dap-title");
		if (title !== null && title.textContent !== entry.title)
			title.textContent = entry.title;

		const badge = el.querySelector(".dap-badge");
		if (badge !== null && badge.textContent !== (entry.pendingText ?? ""))
			badge.textContent = entry.pendingText ?? "";

		const note = el.querySelector(".dap-note");
		if (note !== null) {
			const next =
				entry.kind === "awaiting"
					? entry.pendingText === "需要响应"
						? "本轮已完成，等待你处理"
						: `等待你的回应（${entry.pendingText}）`
					: "运行中…";
			if (note.textContent !== next) note.textContent = next;
		}
	}

	function render() {
		const pane = ensurePane();
		if (pane === null) return;
		const list = pane.querySelector(`.${LIST_CLASS}`);
		if (list === null) return;

		const entries = buildEntries(
			getSnapshot(sessions, "list"),
			getSnapshot(workspaces, "list")?.items ?? [],
		);

		const sig = cardSignature(entries);
		if (sig === lastSig) return;
		lastSig = sig;

		const alive = new Set();
		for (const entry of entries) {
			let rec = cardsById.get(entry.id);
			if (rec === undefined) {
				const el = document.createElement("div");
				el.className = CARD_CLASS;
				rec = { el, kind: null };
				cardsById.set(entry.id, rec);
			}
			if (rec.kind !== entry.kind) {
				rec.el.dataset.kind = entry.kind;
				rec.el.dataset.sessionId = entry.id;
				rec.el.dataset.depth = String(entry.depth);
				rec.el.setAttribute("role", "button");
				rec.el.tabIndex = 0;
				rec.el.replaceChildren(...cardChildren(entry.kind));
				rec.kind = entry.kind;
			}
			rec.el.style.marginLeft = `${entry.depth * INDENT_PX}px`;
			rec.el.toggleAttribute("data-current", entry.isCurrent);
			rec.el.toggleAttribute("data-awaiting", entry.kind === "awaiting");
			rec.el.setAttribute(
				"aria-label",
				`${entry.workspaceTitle ? entry.workspaceTitle + " - " : ""}${entry.title}${
					entry.pendingText ? "，" + entry.pendingText : ""
				}`,
			);
			renderCardInto(rec.el, entry);
			list.appendChild(rec.el);
			alive.add(entry.id);
		}
		for (const [id, rec] of cardsById) {
			if (alive.has(id)) continue;
			rec.el.remove();
			cardsById.delete(id);
		}

		const count = pane.querySelector(".dap-count");
		if (count !== null) {
			count.textContent = String(entries.length);
			count.toggleAttribute("data-awaiting", entries.some((e) => e.kind === "awaiting"));
		}
		const toggleCount = toggle.querySelector(".dap-toggle-count");
		if (toggleCount !== null) {
			toggleCount.textContent = String(entries.length);
			toggle.toggleAttribute(
				"data-awaiting",
				entries.some((e) => e.kind === "awaiting"),
			);
			toggle.setAttribute("data-count", String(entries.length));
		}
	}

	// ---- 打开会话（复用 companion 验证过的：list 未就绪时 refresh + 重试） ----
	const MAX_OPEN_ATTEMPTS = 60;
	function sessionsListHas(sessionId) {
		const snap = getSnapshot(sessions, "list");
		return (
			snap !== null &&
			Array.isArray(snap.ids) &&
			snap.ids.includes(String(sessionId))
		);
	}
	function cardElFor(sessionId) {
		return document.querySelector(
			`[${PANE_ATTR}] [data-session-id="${String(sessionId)
				.replace(/"/g, '\\"')
				.replace(/\\/g, "\\\\")}"]`,
		);
	}
	function attemptOpen(sessionId, attempt) {
		const el = cardElFor(sessionId);
		if (el !== null) el.setAttribute("data-opening", "");

		if (!sessionsListHas(sessionId)) {
			if (attempt < MAX_OPEN_ATTEMPTS) {
				try {
					sessions.refresh?.();
				} catch {}
				setTimeout(() => attemptOpen(sessionId, attempt + 1), 500);
				return;
			}
			el?.removeAttribute("data-opening");
			return;
		}
		try {
			sessions.open(sessionId);
			el?.removeAttribute("data-opening");
		} catch (error) {
			if (attempt < MAX_OPEN_ATTEMPTS) {
				try {
					sessions.refresh?.();
				} catch {}
				setTimeout(() => attemptOpen(sessionId, attempt + 1), 500);
			} else {
				el?.removeAttribute("data-opening");
			}
		}
	}
	/** 纯几何命中 + capture 阶段点击，规避覆盖层/stopPropagation。 */
	function sessionIdAtPoint(x, y) {
		if (typeof x !== "number" || typeof y !== "number") return undefined;
		const cards = Array.from(
			document.querySelectorAll(`[${PANE_ATTR}] [data-session-id]`),
		);
		for (const card of cards) {
			const r = card.getBoundingClientRect();
			if (r.left <= x && x <= r.right && r.top <= y && y <= r.bottom)
				return card.dataset.sessionId;
		}
		return undefined;
	}
	function openCard(event) {
		const sessionId =
			sessionIdAtPoint(event.clientX, event.clientY) ??
			event.target
				?.closest?.(`[${PANE_ATTR}] [data-session-id]`)
				?.dataset?.sessionId;
		if (sessionId === undefined) return;
		if (typeof sessions?.open !== "function") return;
		event.preventDefault();
		event.stopPropagation();
		attemptOpen(sessionId, 0);
	}
	function onKeyDown(event) {
		if (event.key !== "Enter" && event.key !== " ") return;
		const card = event.target?.closest?.(`[${PANE_ATTR}] [data-session-id]`);
		if (card?.dataset.sessionId === undefined) return;
		event.preventDefault();
		attemptOpen(card.dataset.sessionId, 0);
	}

	// ---- 观察者：找到 frame 后聚焦其子树；外壳重挂载时窗格被清即重插 ----
	const bodyObserver = new MutationObserver(queueSync);
	bodyObserver.observe(document.body, { childList: true, subtree: true });
	let frameObserver = null;
	let frameProbeTimer = null;
	function installFrameObserver() {
		if (frameObserver !== null) return;
		const seat = document.querySelector(CONVERSATION_SELECTOR);
		if (seat === null || seat.parentElement === null) return;
		bodyObserver.disconnect();
		frameObserver = new MutationObserver(queueSync);
		frameObserver.observe(seat.parentElement, {
			childList: true,
			subtree: true,
		});
		if (frameProbeTimer !== null) {
			clearInterval(frameProbeTimer);
			frameProbeTimer = null;
		}
	}
	installFrameObserver();
	if (frameObserver === null) frameProbeTimer = setInterval(installFrameObserver, 500);

	// ---- 移动端开关：浮动按钮打开抽屉，头部关闭按钮收起 ----
	function togglePane(open) {
		const pane = document.querySelector(`[${PANE_ATTR}]`);
		if (pane === null) return;
		pane.setAttribute("data-open", open ? "true" : "false");
	}
	function onToggleClick() {
		const pane = document.querySelector(`[${PANE_ATTR}]`);
		const open = pane?.getAttribute("data-open") !== "true";
		togglePane(open);
	}
	function onPaneClick(event) {
		const inPane = event.target?.closest?.(`[${PANE_ATTR}]`) !== null;
		if (inPane && event.target?.closest?.(".dap-close") !== null) {
			togglePane(false);
		}
	}
	toggle.addEventListener("click", onToggleClick);
	document.addEventListener("click", onPaneClick);

	installServiceSubscriptions();
	if (sessions === null || workspaces === null) {
		serviceTimer = setInterval(installServiceSubscriptions, 250);
	}
	document.addEventListener("click", openCard, true); // capture
	document.addEventListener("keydown", onKeyDown);
	queueSync();

	return () => {
		disposed = true;
		sessionUnsubscribe?.();
		workspaceUnsubscribe?.();
		if (serviceTimer !== null) clearInterval(serviceTimer);
		bodyObserver.disconnect();
		frameObserver?.disconnect();
		if (frameProbeTimer !== null) clearInterval(frameProbeTimer);
		toggle.removeEventListener("click", onToggleClick);
		document.removeEventListener("click", onPaneClick);
		document.removeEventListener("click", openCard, true);
		document.removeEventListener("keydown", onKeyDown);
		toggle.remove();
		style.remove();
	};
}

module.exports = { name, inject, apply };
