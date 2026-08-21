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
