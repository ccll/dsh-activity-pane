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
