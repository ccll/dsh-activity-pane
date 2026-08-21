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

/** 工具参数白名单：只在其中提取摘要，绝不展示完整命令或原始 JSON（沿用 answer-pet trace 摘要，MIT 参考）。 */
const TRACE_DETAIL_KEYS = ["description", "query", "pattern", "file_path", "path", "url"];
/** 运行卡最多展示的流程节点数（已定案工具调用 + 当前阶段）。 */
export const TRACE_MAX_ITEMS = 4;
/** think 阶段进度起点（%）：progressOf 与渲染层兜底共用的同源常量，防两处"5"漂移。 */
export const PROGRESS_THINK_BASE = 5;

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
	return typeof value === "string" ? value.trim() : "";
}

/** 展示摘要文本：折叠空白并截断到 max 字符（用于工具参数摘要等长文本）；非字符串返回 null。 */
export function cleanPreview(value, max = 88) {
	if (typeof value !== "string") return null;
	const text = value.replace(/\s+/g, " ").trim();
	if (text.length === 0) return null;
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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

	// 第一遍：层级关系 + 显示判定（show 同 isActiveRow，单点实现避免漂移）。
	const rootIds = [];
	const childIds = new Map();
	const meta = new Map();
	for (const id of ids) {
		const row = byId[id];
		if (!isRecord(row)) continue;
		const hasParent = isSubagentRow(row, byId);
		if (hasParent) {
			const list = childIds.get(String(row.parentId)) ?? [];
			list.push(id);
			childIds.set(String(row.parentId), list);
		} else {
			rootIds.push(id);
		}
		const running = row.running === true;
		const pending = row.pendingInteraction !== undefined;
		const isSub = hasParent;
		// 子代理完成后即消失；主会话完成后保留为"等待打开"。
		const show = isActiveRow(row, byId);
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
			entry.status ?? null,
			entry.updatedAt ?? null,
			entry.progress ?? null,
			entry.trace ?? null,
			entry.streaming ?? null,
		]),
	);
}

// ---- 最近历史区（R-01-010）与轮内状态文案（R-01-009） ----

/** 历史窗口：会话最后一次活动距现在不超过该毫秒数则视为"最近使用过"。 */
export const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 历史区最多展示的最近会话条数。 */
export const HISTORY_MAX = 20;

/** 会话行是否为某主会话的直属子代理。 */
export function isSubagentRow(row, byId = {}) {
	const id = row?.parentId;
	return id !== undefined && id !== null && isRecord(byId[id]);
}

/**
 * 会话行是否满足"活动区显示"判定（buildEntries 的 show 与此共用，单点实现）。
 * 主会话：running || pendingInteraction || completed；
 * 子代理：仅 running || pendingInteraction（结束后消失）。
 */
export function isActiveRow(row, byId = {}) {
	const running = row.running === true;
	const pending = row.pendingInteraction !== undefined;
	if (isSubagentRow(row, byId)) return running || pending;
	return running || pending || row.completed === true;
}

/**
 * 构建最近历史区条目：当前非活动、且在历史窗口内最后一次活动过的**主会话**
 * （子代理是临时工作单元，不入最近历史；故需同时排除表白会话与已结束子代理），
 * 按最后活动时间从新到旧，最多 HISTORY_MAX 条。blank 会话不出现（从未用过）。
 */
export function buildRecent(snapshot, workspaceItems, now, windowMs = HISTORY_WINDOW_MS) {
	const byId = isRecord(snapshot) && isRecord(snapshot.byId) ? snapshot.byId : {};
	const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : [];
	const current = snapshot?.current ?? null;
	const items = Array.isArray(workspaceItems) ? workspaceItems : [];
	const entries = [];

	for (const id of ids) {
		const row = byId[id];
		if (!isRecord(row)) continue;
		if (row.blank === true) continue;
		if (isSubagentRow(row, byId)) continue; // 子代理（含已结束）不入最近历史
		if (isActiveRow(row, byId)) continue;
		const updatedAt = Number(row.updatedAt);
		if (!Number.isFinite(updatedAt)) continue;
		if (updatedAt > now || now - updatedAt > windowMs) continue;
		entries.push({
			id,
			kind: "recent",
			depth: 0,
			title: mainTitle(byId, id),
			workspaceTitle: workspaceTitleForSession(id, items, byId),
			isCurrent: current !== null && String(current) === String(id),
			updatedAt,
		});
	}

	entries.sort((a, b) => b.updatedAt - a.updatedAt);
	return entries.slice(0, HISTORY_MAX);
}

/** 毫秒时长的人性化短格式，例如 "47s"、"3m12s"。 */
export function fmtElapsedMs(ms) {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${s % 60}s`;
}

/** token 计数的人性化短格式，例如 "847"、"1.2k"；非有限非负时返回 null。 */
export function fmtTokens(n) {
	if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/**
 * 从工具参数中提取安全短摘要：只从白名单字段取，绝不展示完整命令或原始 JSON。
 * 参数为字符串时先尝试 JSON 解析；解析失败或非对象一律返回 null（R-01-009/AC-04）。
 */
export function summarizeToolArguments(raw) {
	let args = raw;
	if (typeof raw === "string") {
		try {
			args = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (args === null || typeof args !== "object" || Array.isArray(args)) return null;
	for (const key of TRACE_DETAIL_KEYS) {
		const text = cleanPreview(args[key]);
		if (text !== null) return text;
	}
	return null;
}

/**
 * 轮内进度估计（0–100）：阶段权重 + 输出 token 累计填充（无 maxTokens 时用饱和
 * 曲线）。纯函数给出阶段式估计；tool 阶段冻结返回 null（由渲染层保持上一进度）；
 * 渲染层再按回合叠加单调下限，保证同回合不倒退（R-01-009/AC-06）。
 */
export function progressOf({ phase = "think", outputTokens = 0, elapsedMs = 0 } = {}) {
	const out = Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : 0;
	const sec =
		Math.max(
			0,
			(Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0) / 1000,
		);
	if (phase === "tool") return null;
	if (phase === "stream") {
		const fill = Math.min(1, 1 - Math.exp(-out / 600));
		return Math.round((10 + 80 * fill) * 10) / 10;
	}
	return Math.round(Math.min(10, PROGRESS_THINK_BASE + sec * 0.5) * 10) / 10;
}

/** 已定案工具调用节点：`legacy.nodes` 中的工具结果（含 call 信息）。 */
function isTraceToolNode(node) {
	return isRecord(node) && isRecord(node.call) && typeof node.call.name === "string";
}

/** 节点是否带 (time, callTime) 双时间戳，可用其近似耗时。 */
function hasTraceTimes(node) {
	return Number.isFinite(node.time) && Number.isFinite(node.callTime);
}

/**
 * 构建运行卡「最近流程节点」轨迹：已定案工具调用（来自 legacy.nodes，含
 * label/detail/status/durationMs）+ 当前阶段节点（运行中），最多 TRACE_MAX_ITEMS。
 * durationMs 为近似值：工具节点用 time-callTime，当前阶段用回合已运行时长。
 * 节点文案只经白名单摘要，不泄露敏感参数（R-01-009/AC-07）。
 */
export function buildTrace({
	nodes = [],
	runningTool = null,
	runningArgs = null,
	streaming = false,
	reasoning = false,
	turnStartTime = null,
	now = Date.now(),
} = {}) {
	const items = [];
	for (const node of nodes) {
		if (!isTraceToolNode(node)) continue;
		items.push({
			id: typeof node.callId === "string" ? node.callId : `tool:${items.length}`,
			kind: "tool",
			label: `调用 ${node.call.name}`,
			detail: summarizeToolArguments(node.call.argsRaw),
			status: node.isError === true ? "error" : "done",
			durationMs: hasTraceTimes(node) ? Math.max(0, node.time - node.callTime) : null,
		});
	}
	const elapsedMs =
		Number.isFinite(turnStartTime) ? Math.max(0, now - turnStartTime) : null;
	let current;
	if (runningTool) {
		current = {
			id: `run:${runningTool}`,
			kind: "tool",
			label: `调用 ${runningTool}`,
			detail: summarizeToolArguments(runningArgs),
			status: "running",
			durationMs: elapsedMs,
		};
	} else if (streaming) {
		current = {
			id: "run:stream",
			kind: "phase",
			label: "组织回答",
			detail: null,
			status: "running",
			durationMs: elapsedMs,
		};
	} else if (reasoning) {
		current = {
			id: "run:reason",
			kind: "phase",
			label: "推理与规划",
			detail: null,
			status: "running",
			durationMs: elapsedMs,
		};
	} else {
		current = {
			id: "run:think",
			kind: "phase",
			label: "分析任务",
			detail: null,
			status: "running",
			durationMs: elapsedMs,
		};
	}
	items.push(current);
	return items.slice(-TRACE_MAX_ITEMS);
}

/**
 * 轮内状态文案：由渲染器把运行中会话的原生订阅快照归一为
 * `{ runningTool, streaming, elapsedMs, outputTokens, rateTokS }` 后调用。
 * 头文案对齐 answer-pet 的 PHASE_LABELS：tool→使用工具、stream→回答中、其余→思考中；
 * 工具名按 answer-pet 惯例拼在状态行末尾（R-01-009/AC-02）；token/速率/时长按字段存在拼接。
 * 无任何宿主依赖。
 */
export function statusLine({
	runningTool = null,
	streaming = false,
	elapsedMs = null,
	outputTokens = null,
	rateTokS = null,
} = {}) {
	const parts = [
		runningTool ? "使用工具" : streaming ? "回答中" : "思考中",
	];
	if (Number.isFinite(outputTokens) && outputTokens > 0) {
		const tokens = fmtTokens(outputTokens);
		if (tokens !== null) parts.push(`${tokens} tok`);
	}
	if (Number.isFinite(rateTokS) && rateTokS > 0)
		parts.push(`≈${Math.round(rateTokS)} tok/s`);
	if (Number.isFinite(elapsedMs) && elapsedMs >= 0)
		parts.push(fmtElapsedMs(elapsedMs));
	if (runningTool) parts.push(runningTool);
	return parts.join(" · ");
}
