/**
 * 为单张 card 绑定点击/键盘激活，并返回卸载函数。
 * 事件处理读取 card 当前的 data-session-id，兼容同一 DOM 在渲染中复用。
 */
export function bindCardActivation(card, open) {
	if (typeof card?.addEventListener !== "function" || typeof open !== "function")
		return () => {};
	const activate = (event) => {
		if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
		if (event.type !== "click" && event.type !== "keydown") return;
		const currentCard = event.currentTarget ?? card;
		const sessionId = currentCard?.dataset?.sessionId;
		if (typeof sessionId !== "string" || sessionId === "") return;
		event.preventDefault?.();
		event.stopPropagation?.();
		open(sessionId);
	};
	card.addEventListener("click", activate);
	card.addEventListener("keydown", activate);
	return () => {
		card.removeEventListener?.("click", activate);
		card.removeEventListener?.("keydown", activate);
	};
}

/**
 * 调用 DSH 原生会话导航；由调用方决定失败后的 refresh/retry 策略。
 * 不读取 sessions.list，避免用另一份可能已过期的快照拦截跳转。
 */
export function openSession(sessions, sessionId) {
	if (typeof sessions?.open !== "function") return false;
	try {
		sessions.open(sessionId);
		return true;
	} catch {
		return false;
	}
}

/** 原生会话输入框（dsh-client-ui-conversation composer 的 textarea）。 */
export const COMPOSER_SELECTOR = "textarea[data-phase]";

/**
 * 抑制切换会话后原生 composer 的自动聚焦（R-01-005/AC-01 移动端回归）。
 * dsh-client-ui-conversation 的 composer 在 sessionId 变化的 effect 里
 * focus 输入框（桌面便于立即输入）；移动视口下该聚焦会弹出软键盘遮挡会话。
 * open 成功后立即 blur 一次（覆盖 composer 已持焦的情形），并在短暂窗口内
 * 以捕获阶段 focusin 拦截随后的自动聚焦；窗口外用户主动聚焦不受影响。
 */
export function suppressComposerAutofocus(doc, scheduleTimeout = setTimeout, windowMs = 1200) {
	if (typeof doc?.addEventListener !== "function") return;
	const blurComposer = (el) => {
		if (typeof el?.matches === "function" && el.matches(COMPOSER_SELECTOR)) el.blur?.();
	};
	blurComposer(doc.activeElement);
	const onFocusIn = (event) => blurComposer(event?.target);
	doc.addEventListener("focusin", onFocusIn, true);
	scheduleTimeout(() => doc.removeEventListener?.("focusin", onFocusIn, true), windowMs);
}

/**
 * 为移动端抽屉的透明遮罩绑定点击收起，并返回卸载函数。
 * 抽屉与浮动开关位于遮罩之上，能到达遮罩的点击必然来自抽屉外部，
 * 无需 contains 判定。触摸轻点经浏览器 tap→click 合成事件覆盖
 * （与浮动开关、× 与卡片的既有交互一致，故仅绑 click），
 * 不额外绑 touch 事件以避免双触发与滑动误收起（R-01-008/AC-03）。
 */
export function bindBackdropDismiss(backdrop, dismiss) {
	if (typeof backdrop?.addEventListener !== "function" || typeof dismiss !== "function")
		return () => {};
	const onBackdropClick = (event) => {
		if (event.type !== "click") return;
		event.preventDefault?.();
		event.stopPropagation?.();
		dismiss();
	};
	backdrop.addEventListener("click", onBackdropClick);
	return () => {
		backdrop.removeEventListener?.("click", onBackdropClick);
	};
}
