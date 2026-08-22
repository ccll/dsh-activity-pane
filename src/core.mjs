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
const TOOL_LABELS = {
	bash: "Bash",
	pwsh: "Pwsh",
	read: "Read",
	web_fetch: "Read",
	web_search: "Search",
	grep: "Grep",
	glob: "Search",
	write: "Write",
	edit: "Edit",
	run_code: "Code",
	cordis_package_inspect: "Inspect",
	cordis_runtime_inspect: "Inspect",
	cordis_run: "Run",
	cordis_stop: "Stop",
	cordis_undefine: "Remove",
};
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

/** 取原始文本的第一个非空物理行；不把换行折叠成同一行。 */
export function firstPhysicalLine(value, max = 120) {
	if (typeof value !== "string") return "";
	for (const line of value.split(/\r?\n/)) {
		const text = line.trim();
		if (!text) continue;
		return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
	}
	return "";
}

function contentText(content) {
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => isRecord(block) && block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

function assistantBlockText(blocks, kind = "text") {
	if (!Array.isArray(blocks)) return "";
	return blocks
		.filter((block) => isRecord(block) && block.kind === kind && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

function mapValue(source, key) {
	if (source instanceof Map) return source.get(key);
	return isRecord(source) ? source[key] : undefined;
}

function toolViewDetail(view) {
	if (!isRecord(view)) return null;
	if (typeof view.description === "string") return cleanPreview(view.description);
	if (typeof view.output === "string") return cleanPreview(view.output);
	if (typeof view.text === "string") return cleanPreview(view.text);
	return null;
}

function timelineToolItem(root, fallbackView = null) {
	if (!isRecord(root)) return null;
	const call = isRecord(root.call) ? root.call : root;
	const name = typeof call.name === "string" ? call.name : "tool";
	const argsRaw = typeof call.argsRaw === "string" ? call.argsRaw : root.argsRaw;
	const view = root.callView ?? fallbackView;
	const resultView = root.resultView;
	const label = TOOL_LABELS[name] ?? (name === "tool" ? "Tool Call" : name);
	const detail = toolViewDetail(view) ?? toolViewDetail(resultView) ?? summarizeToolArguments(argsRaw);
	return {
		id: typeof root.callId === "string" ? root.callId : `tool:${name}`,
		kind: "tool",
		icon: isRecord(view) && typeof view.kind === "string" ? view.kind : "tool",
		toolName: name,
		callId: typeof root.callId === "string" ? root.callId : "",
		label,
		text: name,
		summary: detail ?? "",
		detail,
		status: root.kind === "tool-result" ? (root.isError === true ? "error" : "done") : "running",
		durationMs:
			Number.isFinite(root.time) && Number.isFinite(root.callTime)
				? Math.max(0, root.time - root.callTime)
				: null,
	};
}

function timelineItemFromChatNode(node) {
	if (!isRecord(node)) return null;
	const data = isRecord(node.data) ? node.data : {};
	if (node.visibility === "hidden") return null;
	if (node.kind === "user" || node.kind === "steering") {
		const text = contentText(data.content);
		return {
			id: String(node.key ?? node.anchorSeq ?? `user:${text}`),
			kind: "user",
			icon: "user",
			text,
			detail: null,
			status: "done",
			durationMs: null,
		};
	}
	if (node.kind === "assistant-step" || node.kind === "assistant") {
		const text = assistantBlockText(data.blocks, "text");
		const reasoning = assistantBlockText(data.blocks, "reasoning");
		if (!text && !reasoning) return null;
		const label = reasoning ? "Think" : "Assistant";
		return {
			id: String(node.key ?? `assistant:${data.turn}:${data.step}`),
			kind: "assistant",
			icon: "assistant",
			label,
			turn: data.turn,
			step: data.step,
			text,
			summary: reasoning || text,
			detail: reasoning || null,
			status: data.status === "running" ? "running" : "done",
			durationMs: null,
		};
	}
	if (node.kind === "tool-call") return timelineToolItem(data.root ?? data);
	if (node.kind === "context") {
		const text = contentText(data.content);
		return text
			? {
					id: String(node.key ?? `context:${text}`),
					kind: "context",
					icon: "context",
					text,
					detail: null,
					status: "done",
					durationMs: null,
				}
			: null;
	}
	return null;
}

/** 从主会话 ChatSnapshot 的真实 order 提取最近工作项，保留当前 live 项。 */
export function conversationTimeline(snapshot, limit = 4) {
	const chat = snapshot?.chat;
	const order = Array.isArray(chat?.order) ? chat.order : [];
	const nodes = chat?.nodes;
	const max = Math.max(0, limit);
	if (max === 0) return [];
	// 尾部反向收集：工作项只取尾部 max 个，长会话不再全序扫描；
	// live 合并只作用于尾部子集（partial/runningCalls 的对应已定案项必在最近窗口内）。
	const items = [];
	for (let i = order.length - 1; i >= 0 && items.length < max; i -= 1) {
		let node;
		try {
			node = nodes?.get?.(order[i]) ?? nodes?.[order[i]];
		} catch {
			node = undefined;
		}
		const item = timelineItemFromChatNode(node);
		if (item) items.unshift(item);
	}
	const liveItems = [];
	const partialText = assistantBlockText(snapshot?.partial?.blocks, "text");
	const partialReasoning = assistantBlockText(snapshot?.partial?.blocks, "reasoning");
	if (partialText || partialReasoning) {
		// turn/step 定位缺省（非有限数）时不参与摘除匹配，避免误吞最后一个无定位 assistant 节点。
		const partialTurn = snapshot.partial.turn;
		const partialStep = snapshot.partial.step;
		const currentIndex =
			Number.isFinite(partialTurn) && Number.isFinite(partialStep)
				? items.findLastIndex((item) => item.kind === "assistant" && item.turn === partialTurn && item.step === partialStep)
				: -1;
		const current = currentIndex >= 0 ? items.splice(currentIndex, 1)[0] : null;
		liveItems.push({
			...(current ?? { id: `partial:${snapshot.partial.turn}:${snapshot.partial.step}`, kind: "assistant", icon: "assistant", durationMs: null }),
			text: partialText,
			detail: partialReasoning || null,
			status: "running",
		});
	}
	for (const call of Array.isArray(snapshot?.runningCalls) ? snapshot.runningCalls : []) {
		const item = timelineToolItem(call);
		if (!item) continue;
		const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
		if (existingIndex >= 0) liveItems.push({ ...items.splice(existingIndex, 1)[0], ...item });
		else liveItems.push(item);
	}
	return liveItems.length > 0
		? items.slice(-Math.max(0, max - liveItems.length)).concat(liveItems).slice(-max)
		: items;
}

function timelineItemFromEvent(entry) {
	const event = isRecord(entry?.event) ? entry.event : entry;
	const data = isRecord(event?.data) ? event.data : {};
	if (!event || typeof event.type !== "string") return null;
	if (event.type === "user/message" && data.source?.kind === "user") {
		return { id: `user:${event.seq}`, kind: "user", icon: "user", text: contentText(data.content), detail: null, status: "done", durationMs: null };
	}
	if (event.type === "assistant/message") {
		const text = contentText(data.message?.content);
		return text ? { id: `assistant:${event.seq}`, kind: "assistant", icon: "assistant", text, detail: null, status: "done", durationMs: null } : null;
	}
	if (event.type === "tool/call") {
		return timelineToolItem({ kind: "tool-call", callId: data.callId, name: data.name, argsRaw: data.arguments, callView: entry?.view?.for === "call" ? entry.view.view : null });
	}
	if (event.type === "tool/result") {
		return timelineToolItem({ kind: "tool-result", callId: data.callId, call: data.name ? { name: data.name, argsRaw: data.arguments ?? "" } : null, time: event.time, callTime: data.callTime, isError: data.isError, resultView: entry?.view?.for === "result" ? entry.view.view : null });
	}
	return null;
}

/** 判断 session window 是否尚未 hydrate，需用 native history 补齐。 */
export function needsHistorySnapshot(snapshot) {
	return !snapshot || !Array.isArray(snapshot.chat?.order) || snapshot.chat.order.length === 0;
}

/** 冷会话 history 有界深翻：自尾页起按 beforeSeq 向前翻页，直至最近用户/agent 消息
 *  预览齐全、翻尽（hasMore=false/无更多事件）或达到 maxPages。fetchPage(beforeSeq)
 *  注入实际读取（返回 `{events, hasMore}` 或 null），便于纯函数单测；中途异常保留
 *  已得事件并以 error 返回。返回 `{ events, error }`（events 按时间正序，新页在后）。 */
export async function pagedHistoryEvents({ fetchPage, maxPages = 3 }) {
	const allEvents = [];
	let beforeSeq;
	let hasMore = true;
	let error = null;
	for (let pages = 0; pages < maxPages && hasMore; pages += 1) {
		const previews = messagePreviews({ history: allEvents });
		if (previews.userPreview && previews.agentPreview) break;
		let events;
		try {
			const value = await fetchPage(beforeSeq);
			if (!value) break;
			events = Array.isArray(value.events) ? value.events : [];
			allEvents.unshift(...events);
			hasMore = value.hasMore === true && events.length > 0;
		} catch (caught) {
			error = caught;
			break;
		}
		const firstSeq = events[0]?.event?.seq;
		if (!Number.isFinite(firstSeq)) break;
		beforeSeq = firstSeq;
	}
	return { events: allEvents, error };
}

/** 冷会话 history 的同序降级，供没有 ChatSnapshot 的活动/历史会话使用。
 *  native `sessions.history` 响应只含 `{events, hasMore, projections?}`（in-flight
 *  partial 以 chunk 事件携带，不做逐 chunk 折叠），故只从事件流取尾部工作项。 */
export function conversationTimelineFromHistory(history, limit = 4) {
	const items = [];
	for (const entry of Array.isArray(history) ? history : []) {
		const item = timelineItemFromEvent(entry);
		if (item) items.push(item);
	}
	const max = Math.max(0, limit);
	return max === 0 ? [] : items.slice(-max);
}
/** 从 ChatSnapshot/history 取最近用户与 agent reply 的物理首行。
 *  尾部反向扫描：找到最近的用户项与 assistant 项即停，长会话不再全序物化时间线。 */
export function messagePreviews({ snapshot = null, history = [] } = {}) {
	let user = "";
	// live partial 位于会话尾部：存在即是最新的 agent 文本。
	let agent = firstPhysicalLine(assistantBlockText(snapshot?.partial?.blocks, "text"));
	const chat = snapshot?.chat;
	const order = Array.isArray(chat?.order) ? chat.order : [];
	const nodes = chat?.nodes;
	for (let i = order.length - 1; i >= 0 && (!user || !agent); i -= 1) {
		let node;
		try {
			node = nodes?.get?.(order[i]) ?? nodes?.[order[i]];
		} catch {
			node = undefined;
		}
		const item = timelineItemFromChatNode(node);
		if (!item) continue;
		if (item.kind === "user" && !user && item.text) user = firstPhysicalLine(item.text);
		if (item.kind === "assistant" && !agent && item.text) agent = firstPhysicalLine(item.text);
	}
	if (!user || !agent) {
		for (const entry of Array.isArray(history) ? history : []) {
			const event = entry?.event ?? entry;
			if (event?.type === "user/message" && event.data?.source?.kind === "user") user = firstPhysicalLine(contentText(event.data.content)) || user;
			if (event?.type === "assistant/message") agent = firstPhysicalLine(contentText(event.data?.message?.content)) || agent;
		}
	}
	return { userPreview: user, agentPreview: agent };
}
/** 归一化 native sessions.models 返回的当前模型与 reasoning level。 */
export function modelMetadata(models) {
	const current = isRecord(models?.current) ? models.current : null;
	if (!current) return { model: "", reasoning: "" };
	let selected = null;
	for (const group of Array.isArray(models?.groups) ? models.groups : []) {
		const found = Array.isArray(group?.models) ? group.models.find((model) => model?.id === current.model) : null;
		if (found) {
			selected = found;
			break;
		}
	}
	const reasoning = selected?.reasoning;
	const effortId = current.reasoningEffort ?? reasoning?.defaultEffort;
	const effort = Array.isArray(reasoning?.efforts) ? reasoning.efforts.find((item) => item?.id === effortId) : null;
	return {
		model: typeof selected?.name === "string" && selected.name ? selected.name : typeof current.model === "string" ? current.model : "",
		reasoning: typeof effort?.name === "string" && effort.name ? effort.name : typeof effortId === "string" ? effortId : "",
	};
}

/** 只提供卡片底部所需的原始统计字段，不拼接当前动作文案。 */
export function runtimeStats({ elapsedMs = null, outputTokens = null, rateTokS = null } = {}) {
	return {
		elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
		outputTokens: Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : null,
		rateTokS: Number.isFinite(rateTokS) && rateTokS > 0 ? rateTokS : null,
	};
}
/** 只有当前会话卡片允许读取主窗口 DOM；其它卡片必须使用自身快照，避免跨会话串线。 */
export function nativePresentationSessionId(entry) {
	return entry?.isCurrent === true && entry?.id !== undefined && entry?.id !== null ? String(entry.id) : null;
}

/** 需要用户行动的种类的展示文案。 */
export function pendingText(kind) {
	return PENDING_LABELS[kind] ?? "需要响应";
}

/** CSS 字符串字面量转义（用于属性选择器的加引号形式）：先反斜杠后引号，再处理 CSS 字符串
 *  不允许的换行/回车/换页（码位转义）与 NUL（替换字符），顺序不可颠倒。 */
export function escapeCssString(value) {
	return String(value)
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\a ")
		.replace(/\r/g, "\\d ")
		.replace(/\f/g, "\\c ")
		.replace(/\0/g, "�");
}

/** 冷会话补充数据读取决策（单次渲染内是否发起 models/history 读取）。
 *  失败路径会写入空 model/history 使决策转为「不读」（可见期内不热重试）；
 *  详情与记账随可见性清理（pruneInvisibleEntries）一起移除后，决策自然恢复为「读取」。 */
export function detailLoadPlan({
	detail = {},
	isSubagent = false,
	snapshotReady = false,
	historyNeeded = false,
	modelInflight = false,
	historyInflight = false,
} = {}) {
	return {
		subagent: isSubagent === true,
		model: !isSubagent && !detail.model && !modelInflight,
		history: !detail.history && !snapshotReady && historyNeeded && !historyInflight,
	};
}

/** 打开重试链是否应取消：目标已成为当前会话（已到达），或用户已激活其它卡片（被新意图取代）。 */
export function shouldCancelOpenRetry({ targetId, currentId = null, activatedId = null } = {}) {
	if (targetId === undefined || targetId === null) return true;
	if (currentId !== null && currentId !== undefined && String(currentId) === String(targetId)) return true;
	if (activatedId !== null && activatedId !== undefined && String(activatedId) !== String(targetId)) return true;
	return false;
}

/** 可见性清理：把不在 visibleIds 中的 id 从每张记账 Map 中删除（详情与 loads 记账同生命周期）。 */
export function pruneInvisibleEntries(maps, visibleIds) {
	const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds ?? []);
	for (const map of Array.isArray(maps) ? maps : []) {
		if (!(map instanceof Map)) continue;
		for (const id of map.keys())
			if (!visible.has(id)) map.delete(id);
	}
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
export function buildEntries(snapshot, workspaceItems, detailsById = {}) {
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
			const details = mapValue(detailsById, id) ?? {};
			const metadata = details.model ?? modelMetadata(details.models ?? m.row.models);
			// timeline/previews 不在此推导：渲染层按快照引用 memo 计算（冷会话由 history 一次性写入 detail），
			// 避免每次渲染对每个可见会话重复全序扫描。
			const timeline = details.timeline ?? [];
			const previews = details.previews ?? { userPreview: "", agentPreview: "" };
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
				model: metadata.model ?? "",
				reasoning: metadata.reasoning ?? "",
				timeline: timeline ?? [],
				userPreview: previews.userPreview ?? "",
				agentPreview: previews.agentPreview ?? "",
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
			entry.model ?? "",
			entry.reasoning ?? "",
			entry.timeline ?? null,
			entry.userPreview ?? "",
			entry.agentPreview ?? "",
			entry.isCurrent,
			entry.pendingText ?? null,
			entry.updatedAt ?? null,
			entry.progress ?? null,
			entry.streaming ?? null,
			entry.loadingModel ?? null,
			entry.loadingTimeline ?? null,
			entry.loadingPreviews ?? null,
			entry.tokenStats ?? [entry.outputTokens ?? null, entry.rateTokS ?? null, entry.elapsedMs ?? null],
		]),
	);
}

// ---- 列表加载态（R-01-014）、最近历史区（R-01-010）与运行统计（R-01-009） ----

/** 会话列表加载态：快照缺失或 `phase === "pending"` → "loading"（列表在途，禁止空态冒充）；
 *  `state === "error"` 或携带 `error` → "error"（前向兼容带错误轴的快照形态）；
 *  否则 → "ready"（宿主契约：empty-with-ready 才是真的无会话）。 */
export function listLoadState(snapshot) {
	if (!snapshot || snapshot.phase === "pending") return "loading";
	if (snapshot.state === "error" || snapshot.error != null) return "error";
	return "ready";
}

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
export function buildRecent(snapshot, workspaceItems, now, windowMs = HISTORY_WINDOW_MS, detailsById = {}) {
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
		const details = mapValue(detailsById, id) ?? {};
		const metadata = details.model ?? modelMetadata(details.models ?? row.models);
		// previews 不在此推导：渲染层按需 memo 计算（冷会话由 history 一次性写入 detail.previews）。
		const previews = details.previews ?? { userPreview: "", agentPreview: "" };
		entries.push({
			id,
			kind: "recent",
			depth: 0,
			title: mainTitle(byId, id),
			workspaceTitle: workspaceTitleForSession(id, items, byId),
			model: metadata.model ?? "",
			reasoning: metadata.reasoning ?? "",
			userPreview: previews.userPreview ?? "",
			agentPreview: previews.agentPreview ?? "",
			isCurrent: current !== null && String(current) === String(id),
			updatedAt,
		});
	}

	entries.sort((a, b) => b.updatedAt - a.updatedAt);
	return entries.slice(0, HISTORY_MAX);
}

/** 毫秒时长的人性化短格式，例如 "47s"、"3m12s"。 */
export function fmtElapsedMs(ms) {
	if (!Number.isFinite(ms) || ms < 0) return "";
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
