// dsh-activity-pane 核心纯函数：把 DSH 原生 sessions/workspaces 客户端服务
// 快照映射成窗格里的"活动会话条目"。这一层不触碰 DOM，可单测。
//
// 数据源约定（来自 @deepseek-ai/dsh-client-runtime 的 sessions.list 快照）：
//   ids: SessionId[]                     —— 宿主列表顺序（祖先在前的 lineage 顺序）
//   byId[id]: { id, displayTitle, title?, cwd?, parentId?, running, completed?,
//              pendingInteraction?: 'approval'|'plan-review'|'question', blank, ... }
//   current: SessionId | undefined
//   subagentsByParent: { [parentId]: { entries: [{ id, label, ... }] } }
//   jobsBySession: { [sessionId]: JobView[] }
// 以及 workspaces.list 的 items: [{ title, path, sessionIds }]。
//
// 展示规则：
//   主会话（无有效 parentId）：running || completed || pendingInteraction 都显示；
//   子代理：仅 running || pendingInteraction 时显示（结束后即消失）；
//   pendingInteraction 总是优先视为"等待用户行动"（即使在 running 中）。

const PENDING_LABELS = {
	approval: "待确认",
	"plan-review": "待审查",
	question: "待回复",
};

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
	return typeof value === "string" ? value.trim() : "";
}

/** 需要用户行动的种类的展示文案。 */
export function pendingText(kind) {
	return PENDING_LABELS[kind] ?? "需要响应";
}

/** 会话 cwd 是否被某个 workspace 记录（含 title/path 两种命中）。 */
export function workspaceTitleForSession(sessionId, workspaceItems, byId = {}) {
	const id = String(sessionId);
	const items = Array.isArray(workspaceItems) ? workspaceItems : [];

	for (const workspace of items) {
		if (!isRecord(workspace)) continue;
		const title = cleanText(workspace.title);
		if (!title || !Array.isArray(workspace.sessionIds)) continue;
		if (workspace.sessionIds.some((candidate) => String(candidate) === id))
			return title;
	}

	const cwd = cleanText(byId[id]?.cwd);
	if (!cwd) return "";
	const workspace = items.find(
		(candidate) => isRecord(candidate) && cleanText(candidate.path) === cwd,
	);
	return cleanText(workspace?.title);
}

/** 主会话按左侧工作区顺序排序的权重；不在任何 workspace 的排在最后保持 lineage 顺序。 */
function workspaceRank(workspaceItems) {
	const wsIndex = new Map();
	const posIndex = new Map();
	for (const workspace of workspaceItems ?? []) {
		if (!isRecord(workspace)) continue;
		const sessionIds = Array.isArray(workspace.sessionIds)
			? workspace.sessionIds
			: [];
		sessionIds.forEach((sid, p) => {
			const key = String(sid);
			if (!wsIndex.has(key)) {
				wsIndex.set(key, wsIndex.size);
				posIndex.set(key, p);
			}
		});
	}
	return (id) => {
		const key = String(id);
		return {
			ws: wsIndex.get(key) ?? Number.MAX_SAFE_INTEGER,
			pos: posIndex.get(key) ?? Number.MAX_SAFE_INTEGER,
		};
	};
}

/** 子代理的展示标题：优先目录 label，其次 displayTitle，兜底 "子任务"。 */
export function subagentTitle(parentId, id, byId, subagentsByParent = {}) {
	const entries = subagentsByParent[parentId]?.entries;
	const entry = Array.isArray(entries)
		? entries.find((candidate) => String(candidate?.id) === String(id))
		: undefined;
	const label = cleanText(entry?.label);
	if (label) return label;
	const display = cleanText(byId[id]?.displayTitle);
	if (display) return display;
	return "子任务";
}

/** 主会话的展示标题：优先 displayTitle，兜底 "当前会话"。 */
export function mainTitle(byId, id) {
	const display = cleanText(byId[id]?.displayTitle);
	return display || String(id) || "当前会话";
}

/**
 * 把 sessions/workspaces 快照构建成窗格条目列表（有序、已含层级与显示过滤）。
 * 返回数组的每一项：
 *   { id, depth, kind: 'running'|'awaiting'|'subagent', title, workspaceTitle,
 *     isCurrent, pendingText? }
 * kind 规则：
 *   - 主会话 running（且无 pending）→ 'running'
 *   - 主会话 pendingInteraction / completed → 'awaiting'（等待用户行动）
 *   - 子代理 running / pending → 'subagent'，否则不显示
 */
export function buildEntries(snapshot, workspaceItems) {
	const byId = isRecord(snapshot) && isRecord(snapshot.byId) ? snapshot.byId : {};
	const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : [];
	const current = snapshot?.current ?? null;
	const subagentsByParent = isRecord(snapshot?.subagentsByParent)
		? snapshot.subagentsByParent
		: {};
	const rank = workspaceRank(workspaceItems ?? []);

	// 第一遍：层级关系 + 显示判定。
	const rootIds = [];
	const childIds = new Map();
	const meta = new Map();
	for (const id of ids) {
		const row = byId[id];
		if (!isRecord(row)) continue;
		const parentId = row.parentId;
		const hasParent =
			parentId !== undefined && parentId !== null && isRecord(byId[parentId]);
		if (hasParent) {
			const list = childIds.get(String(parentId)) ?? [];
			list.push(id);
			childIds.set(String(parentId), list);
		} else {
			rootIds.push(id);
		}
		const running = row.running === true;
		const pending = row.pendingInteraction !== undefined;
		const isSub = hasParent;
		// 子代理完成后即消失；主会话完成后保留为"等待打开"。
		const show = isSub
			? running || pending
			: running || pending || row.completed === true;
		meta.set(id, { row, running, pending, isSub, show, depth: 0 });
	}

	// 主会话按 workspace 顺序排序；未归入任何工作区的主会话保持在 lineage 中靠后。
	rootIds.sort((a, b) => {
		const ra = rank(a);
		const rb = rank(b);
		if (ra.ws !== rb.ws) return ra.ws - rb.ws;
		if (ra.pos !== rb.pos) return ra.pos - rb.pos;
		return ids.indexOf(a) - ids.indexOf(b);
	});

	const entries = [];
	const visited = new Set();
	const visit = (id, depth) => {
		if (visited.has(id)) return;
		visited.add(id);
		const m = meta.get(id);
		if (m === undefined) return;
		m.depth = depth;
		if (m.show) {
			const parentId = m.row.parentId;
			entries.push({
				id,
				depth,
				kind: m.isSub ? "subagent" : m.pending ? "awaiting" : m.running ? "running" : "awaiting",
				title: m.isSub
					? subagentTitle(parentId, id, byId, subagentsByParent)
					: mainTitle(byId, id),
				workspaceTitle: m.isSub
					? ""
					: workspaceTitleForSession(id, workspaceItems ?? [], byId),
				isCurrent: current !== null && String(current) === String(id),
				pendingText: m.pending
					? pendingText(m.row.pendingInteraction)
					: m.row.completed === true && !m.running
						? "需要响应"
						: undefined,
			});
		}
		for (const child of childIds.get(id) ?? []) visit(child, depth + 1);
	};
	for (const root of rootIds) visit(root, 0);
	for (const id of ids) visit(id, 0);

	return entries;
}

/**
 * 渲染去重签名：两份条目序列若产出字节一致的可见状态则签名相等，
 * 因此渲染可跳过全部 DOM 写入，打破 渲染→写 DOM→再次触发渲染 的循环。
 */
export function cardSignature(entries) {
	return JSON.stringify(
		entries.map((entry) => [
			entry.id,
			entry.depth,
			entry.kind,
			entry.title,
			entry.workspaceTitle,
			entry.isCurrent,
			entry.pendingText ?? null,
		]),
	);
}
