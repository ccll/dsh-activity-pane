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

/** 镜像原生 toolRowModel 的 classifyTool（dsh-client-ui-tool）：摘要参数键按 variant 分派（C-011）。 */
const TOOL_VARIANTS = {
	bash: "bash",
	pwsh: "bash",
	read: "read",
	web_fetch: "read",
	web_search: "search",
	grep: "search",
	glob: "search",
	write: "write",
	edit: "edit",
	run_code: "code",
	cordis_package_inspect: "read",
	cordis_runtime_inspect: "read",
	cordis_run: "others",
	cordis_stop: "others",
	cordis_undefine: "others",
};
/** 镜像原生 SUMMARY_KEYS：各 variant 的参数键优先级，bash 含 command（可展示原始命令，C-011）。 */
const SUMMARY_KEYS = {
	bash: ["description", "command"],
	read: ["path", "file_path", "url"],
	search: ["query", "pattern", "url"],
	write: ["path", "file_path"],
	edit: ["path", "file_path"],
	code: ["description"],
	others: [],
};
/** 镜像原生「摘要不带 `工具名 · ` 前缀」的工具集：TOOL_TITLES 键集 + keyed 行（cordis_define 显示插件名，todo/ask 由专用摘要覆盖）。 */
const NATIVE_TOOL_TITLES = new Set(["cordis_package_inspect", "cordis_runtime_inspect", "cordis_run", "cordis_stop", "cordis_undefine", "cordis_define", "pwsh"]);
// 动作标题对齐主会话窗口文案：通用行镜像 dsh-client-ui-tool 的 VARIANT_TITLES/TOOL_TITLES/SEARCH_TITLES/WEB_TITLES
// figma literals，keyed 行（todo/ask/cordis_define）镜像其中文 locale；未知工具回退 "Tool call"（原生 others 标题）。
const TOOL_LABELS = {
	bash: "Bash",
	pwsh: "Pwsh",
	read: "Read",
	web_fetch: "Fetch",
	web_search: "Search",
	grep: "Grep",
	glob: "Glob",
	write: "Write",
	edit: "Edit",
	run_code: "Code",
	cordis_package_inspect: "Inspect",
	cordis_runtime_inspect: "Inspect",
	cordis_run: "Run Cordis Plugin",
	cordis_stop: "Stop Cordis Plugin",
	cordis_undefine: "Remove Cordis Plugin",
	cordis_define: "注册 Cordis 插件",
	todo_write: "更新任务清单",
	ask_user_question: "提问",
};
/** think 阶段进度起点（%）：progressOf 与渲染层兜底共用的同源常量，防两处"5"漂移。 */
export const PROGRESS_THINK_BASE = 5;

/** 桌面窗格拖拽调宽边界（R-01-015）：拖拽实时夹取与 localStorage 恢复共用的同源常量。 */
export const PANE_WIDTH_MIN = 200;
export const PANE_WIDTH_MAX = 480;
export const PANE_WIDTH_DEFAULT = 280;

/**
 * 把任意输入（拖拽像素值或 localStorage 字符串）归一为合法列宽：
 * 非有限数值（含空串）回退默认宽；有限数值取整后夹取进 [PANE_WIDTH_MIN, PANE_WIDTH_MAX]。
 */
export function clampPaneWidth(raw) {
	if (typeof raw === "string" && raw.trim() === "") return PANE_WIDTH_DEFAULT;
	const value = typeof raw === "string" ? Number(raw) : raw;
	if (typeof value !== "number" || !Number.isFinite(value)) return PANE_WIDTH_DEFAULT;
	return Math.min(PANE_WIDTH_MAX, Math.max(PANE_WIDTH_MIN, Math.round(value)));
}

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

/** 原生 firstLine 语义：首行截断，不折叠空白、不限长（行内由 CSS 省略）。 */
function firstLineOf(text) {
	const nl = text.indexOf("\n");
	return nl === -1 ? text : text.slice(0, nl);
}

/** 原生 latestLine 语义：流式 Think 行显示尾部最新行（ReasoningRow running 分支）。 */
function latestLineOf(text) {
	const visible = text.trimEnd();
	const nl = visible.lastIndexOf("\n");
	return nl === -1 ? visible : visible.slice(nl + 1);
}

/** 镜像原生 relativizeToCwd：工作区内绝对路径显示为相对路径。 */
function relativizeToCwd(text, cwd) {
	if (typeof cwd !== "string" || cwd === "") return text;
	const root = cwd.replace(/[/\\]+$/, "");
	if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1);
	return text;
}

/** 镜像原生 deriveSummary：variant 参数键 → 首个字符串参数值 → argsRaw 首行。 */
function deriveToolSummary(name, argsRaw) {
	const variant = TOOL_VARIANTS[name] ?? "others";
	let parsed;
	try {
		parsed = JSON.parse(argsRaw);
	} catch {
		return firstLineOf(argsRaw);
	}
	if (typeof parsed !== "object" || parsed === null) return firstLineOf(argsRaw);
	for (const key of SUMMARY_KEYS[variant]) {
		const value = parsed[key];
		if (typeof value === "string" && value !== "") return firstLineOf(value);
	}
	for (const value of Object.values(parsed)) if (typeof value === "string" && value !== "") return firstLineOf(value);
	return firstLineOf(argsRaw);
}

/**
 * 工具参数摘要：镜像原生 `deriveSummary` + `relativizeToCwd` 语义（分工具类型参数键，
 * bash 含 command，无命中取首个字符串参数值，兜底 argsRaw 首行；C-011 起可展示原始命令）。
 * 参数非字符串或为空串时返回 null（原生该场景显示 callId，由 timelineToolItem 补）。
 */
export function summarizeToolArguments(name, raw, cwd = "") {
	if (typeof raw !== "string" || raw === "") return null;
	return relativizeToCwd(deriveToolSummary(name, raw), cwd);
}

/** 镜像原生 resultText：结果内容块拍平为文本（非文本块 JSON），空内容且带 error 时为 `name: code`。 */
function toolResultText(root) {
	const content = Array.isArray(root.content) ? root.content : [];
	const parts = [];
	for (const block of content) {
		if (isRecord(block) && block.type === "text" && typeof block.text === "string") parts.push(block.text);
		else parts.push(JSON.stringify(block, null, 2));
	}
	if (parts.length === 0 && isRecord(root.error)) parts.push(`${root.error.name}: ${root.error.code}`);
	return parts.join("\n");
}

/** 复刻原生 TodoRow 摘要：`done/total 已完成 · 首个进行中项`；todos 结构不符返回 null 走参数兜底（C-011）。 */
function todoProgressSummary(argsRaw) {
	let parsed;
	try {
		parsed = JSON.parse(argsRaw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;
	const todos = parsed.todos;
	if (!Array.isArray(todos) || !todos.every(isRecord)) return null;
	const active = todos.filter((todo) => todo.status === "in_progress");
	const first = active[0]?.content;
	const named = typeof first === "string" && first.trim() !== "";
	const head = `${todos.filter((todo) => todo.status === "completed").length}/${todos.length} 已完成`;
	return named ? `${head} · ${first}` : head;
}

/** 复刻原生 AskQuestionRow 摘要：已取消/已中断/等待回答/已答 x/y；数据不足返回 null 走参数兜底（C-011）。 */
function askStatusSummary(root, status) {
	const code = isRecord(root.error) ? root.error.code : undefined;
	if (code === "ASK_CANCELLED") return "已取消";
	if (code === "ASK_ABORTED") return "已中断";
	if (status === "running") return "等待回答";
	if (status === "done") {
		try {
			// 原生 answeredSummary 以 join("") 拼接文本块，不能用 contentText 的 \n 拼接（多行 JSON 会解析失败）。
			const answerText = (Array.isArray(root.content) ? root.content : [])
				.filter((block) => isRecord(block) && block.type === "text" && typeof block.text === "string")
				.map((block) => block.text)
				.join("");
			const parsed = JSON.parse(answerText);
			const answers = isRecord(parsed) ? parsed.answers : null;
			if (Array.isArray(answers) && answers.every(isRecord)) {
				const answered = answers.filter(
					(answer) => Array.isArray(answer.selected) && answer.selected.length > 0 || typeof answer.custom === "string" && answer.custom !== "",
				).length;
				return `${answered}/${answers.length} 已回答`;
			}
		} catch {
			/* 结果内容缺失或非 JSON 时走参数兜底 */
		}
	}
	return null;
}

function timelineToolItem(root, fallbackView = null, cwd = "") {
	if (!isRecord(root)) return null;
	const call = isRecord(root.call) ? root.call : root;
	const rawName = typeof call.name === "string" ? call.name : "";
	const name = rawName || "tool";
	const argsRaw = typeof call.argsRaw === "string" ? call.argsRaw : root.argsRaw;
	const view = root.callView ?? fallbackView;
	const resultView = root.resultView;
	const errorCode = isRecord(root.error) ? root.error.code : undefined;
	// 镜像原生状态派生：interrupted（与 ask 的 ASK_ABORTED）归 stopped，不归 error。
	const status =
		root.kind !== "tool-result"
			? "running"
			: errorCode === "interrupted" || (name === "ask_user_question" && errorCode === "ASK_ABORTED")
				? "stopped"
				: root.isError === true
					? "error"
					: "done";
	// 镜像原生 toolRowModel：`工具名 · ` 前缀只出现在 others variant 且无 TOOL_TITLES 条目时。
	const argsBase =
		summarizeToolArguments(name, argsRaw, cwd) ?? (typeof root.callId === "string" ? root.callId : "");
	const argsSummary =
		(TOOL_VARIANTS[name] ?? "others") === "others" && rawName !== "" && !NATIVE_TOOL_TITLES.has(rawName)
			? `${rawName} · ${argsBase}`
			: argsBase;
	// 错误首行优先取结果内容块（原生 resultText 语义）；history 事件不带 content，回退 resultView.output。
	const output = toolResultText(root) || (isRecord(resultView) && typeof resultView.output === "string" ? resultView.output : "");
	// 摘要优先级镜像原生行：错误首行 → terminal callView description → search 结果卡标题 → todo 进度 → 参数派生。
	const detail =
		name === "ask_user_question"
			? askStatusSummary(root, status) ?? argsSummary
			: (status === "error" && output !== "" ? firstLineOf(output) : null) ??
				(isRecord(view) && view.card === "terminal" && typeof view.description === "string" ? view.description : null) ??
				(isRecord(resultView) && resultView.card === "search" && typeof resultView.title === "string" ? resultView.title : null) ??
				(name === "todo_write" && typeof argsRaw === "string" ? todoProgressSummary(argsRaw) : null) ??
				argsSummary;
	return {
		id: typeof root.callId === "string" ? root.callId : `tool:${name}`,
		kind: "tool",
		icon: isRecord(view) && typeof view.kind === "string" ? view.kind : "tool",
		toolName: name,
		callId: typeof root.callId === "string" ? root.callId : "",
		label: TOOL_LABELS[name] ?? "Tool call",
		text: name,
		summary: detail,
		detail,
		status,
	};
}

function timelineItemFromChatNode(node, cwd = "") {
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
			summary: reasoning ? (data.status === "running" ? latestLineOf(reasoning) : firstLineOf(reasoning)) : text,
			detail: reasoning || null,
			status: data.status === "running" ? "running" : "done",
		};
	}
	if (node.kind === "tool-call") return timelineToolItem(data.root ?? data, null, cwd);
	if (node.kind === "context") {
		const text = contentText(data.content);
		// 镜像原生 ContextInjectionRow：标题按 provenance.role 取注入/召回文案，摘要为来源标识；
		// 原始内容只供原生行匹配（matchNativeContextRow），不得作为摘要上卡。
		const provenance = isRecord(data.provenance) ? data.provenance : null;
		return text
			? {
					id: String(node.key ?? `context:${text}`),
					kind: "context",
					icon: "context",
					label: provenance?.role === "recall" ? "跨会话召回" : "上下文注入",
					text,
					summary: typeof provenance?.label === "string" ? provenance.label : "",
					detail: null,
					status: "done",
				}
			: null;
	}
	return null;
}

/** 从主会话 ChatSnapshot 的真实 order 提取最近工作项，保留当前 live 项。 */
export function conversationTimeline(snapshot, limit = 4, cwd = "") {
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
		const item = timelineItemFromChatNode(node, cwd);
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
			...(current ?? { id: `partial:${snapshot.partial.turn}:${snapshot.partial.step}`, kind: "assistant", icon: "assistant" }),
			text: partialText,
			detail: partialReasoning || null,
			// 镜像原生 ReasoningRow：流式 Think 显示尾部最新行，避免与已定案首行摘要漂移。
			summary: partialReasoning ? latestLineOf(partialReasoning) : partialText,
			status: "running",
		});
	}
	for (const call of Array.isArray(snapshot?.runningCalls) ? snapshot.runningCalls : []) {
		const item = timelineToolItem(call, null, cwd);
		if (!item) continue;
		const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
		if (existingIndex >= 0) liveItems.push({ ...items.splice(existingIndex, 1)[0], ...item });
		else liveItems.push(item);
	}
	const timeline = liveItems.length > 0
		? items.slice(-Math.max(0, max - liveItems.length)).concat(liveItems).slice(-max)
		: items;
	// R-01-009/AC-10：会话运行中（无 pending）、无 live 项且时间线不存在其他执行中项时，
	// 尾部已定案非用户项克隆提升为 running，作为 agent 工作中的持续标志；
	// error/stopped 与用户输入项不提升。
	if (
		liveItems.length === 0 &&
		snapshot?.running === true &&
		!(Array.isArray(snapshot?.pending) && snapshot.pending.length > 0) &&
		!timeline.some((item) => item.status === "running")
	) {
		const tail = timeline[timeline.length - 1];
		if (tail?.status === "done" && tail.kind !== "user") {
			return timeline.slice(0, -1).concat({ ...tail, status: "running" });
		}
	}
	return timeline;
}

/** 工作项行状态合并：核心派生的 running 优先于原生行 data-state（提升尾项与 live 项
 *  在选中会话原生行已显示 ok，不允许覆盖回 done，R-01-009/AC-10）；coreStatus 非 running
 *  时保持旧语义——原生 ok 归 done、其余原生值优先、双缺省兜底 running。 */
export function mergeTraceStatus(coreStatus, nativeState) {
	if (coreStatus === "running") return "running";
	return (nativeState === "ok" ? "done" : nativeState) || (typeof coreStatus === "string" ? coreStatus : "running");
}

function timelineItemFromEvent(entry, cwd = "") {
	const event = isRecord(entry?.event) ? entry.event : entry;
	const data = isRecord(event?.data) ? event.data : {};
	if (!event || typeof event.type !== "string") return null;
	if (event.type === "user/message" && data.source?.kind === "user") {
		return { id: `user:${event.seq}`, kind: "user", icon: "user", text: contentText(data.content), detail: null, status: "done" };
	}
	if (event.type === "assistant/message") {
		const text = contentText(data.message?.content);
		return text ? { id: `assistant:${event.seq}`, kind: "assistant", icon: "assistant", text, detail: null, status: "done" } : null;
	}
	if (event.type === "tool/call") {
		return timelineToolItem({ kind: "tool-call", callId: data.callId, name: data.name, argsRaw: data.arguments, callView: entry?.view?.for === "call" ? entry.view.view : null }, null, cwd);
	}
	if (event.type === "tool/result") {
		return timelineToolItem({ kind: "tool-result", callId: data.callId, call: data.name ? { name: data.name, argsRaw: data.arguments ?? "" } : null, isError: data.isError, resultView: entry?.view?.for === "result" ? entry.view.view : null }, null, cwd);
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
export function conversationTimelineFromHistory(history, limit = 4, cwd = "") {
	const items = [];
	for (const entry of Array.isArray(history) ? history : []) {
		const item = timelineItemFromEvent(entry, cwd);
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
 *   { id, parentId?, depth, kind: 'running'|'awaiting'|'subagent'|'parent', title, workspaceTitle,
 *     isCurrent, pendingText? }
 * kind 规则：
 *   - 主会话 running（且无 pending）→ 'running'
 *   - 主会话 pendingInteraction / completed → 'awaiting'（等待用户行动）
 *   - 自身不活动但存在活动后代的任意母会话 → 'parent'（活动层级上下文）
 *   - 子代理 running / pending → 'subagent'，自身与后代均不活动则不显示
 * heldIds（响应保持，R-01-002/AC-05、R-01-010/AC-06）：集合内主会话按 awaiting
 * 「需要响应」保留在活动区。
 */
export function buildEntries(snapshot, workspaceItems, detailsById = {}, heldIds = null) {
	const byId = isRecord(snapshot) && isRecord(snapshot.byId) ? snapshot.byId : {};
	const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : [];
	const current = snapshot?.current ?? null;
	const subagentsByParent = isRecord(snapshot?.subagentsByParent)
		? snapshot.subagentsByParent
		: {};
	const rank = workspaceRank(workspaceItems ?? []);
	const activeIds = activeSessionIds(byId);
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
		// 响应保持（R-01-002/AC-05、R-01-010/AC-06）：保持中主会话按自身活动计入。
		const held = !isSub && heldIds instanceof Set && heldIds.has(String(id));
		// 子代理完成且没有活动后代时消失；主会话完成后保留为"等待打开"，活动祖先显示为 parent 上下文。
		const ownActive = isActiveRow(row, byId) || held;
		const show = isActiveRow(row, byId, activeIds) || held;
		meta.set(id, { row, running, pending, isSub, ownActive, show, held, depth: 0 });
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
				parentId: m.isSub ? String(parentId) : null,
				depth,
				kind: m.ownActive
					? m.isSub ? "subagent" : m.pending ? "awaiting" : m.running ? "running" : "awaiting"
					: "parent",
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
					: (m.row.completed === true || m.held) && !m.running
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
 * 把活动条目压成母会话轨道运行（R-01-003/AC-04）：每个拥有可见直属子代理的
 * 母会话一条，记录全部可见直属子代理 id（有序，末位即末级）与子级深度，供
 * 渲染层测量后绘制整条连续轨道与接入横线。条目按 preorder 排列，同一直属
 * 子代理组天然连续。直属性按「条目深度 = 母会话条目深度 + 1」判定（与条目
 * 顺序无关）；无 id、无母会话条目或非直属的条目一律跳过。
 */
export function trackRuns(entries) {
	const list = Array.isArray(entries) ? entries : [];
	const depthById = new Map();
	for (const entry of list) {
		if (entry?.id != null) depthById.set(String(entry.id), entry.depth ?? 0);
	}
	const runs = new Map();
	for (const entry of list) {
		if (entry?.id == null || entry?.parentId == null || (entry.depth ?? 0) < 1) continue;
		if (entry.kind !== "subagent" && entry.kind !== "parent") continue;
		const pid = String(entry.parentId);
		const parentDepth = depthById.get(pid);
		if (parentDepth === undefined || entry.depth !== parentDepth + 1) continue;
		const run = runs.get(pid);
		if (run === undefined) runs.set(pid, { parentId: pid, depth: entry.depth, childIds: [entry.id] });
		else run.childIds.push(entry.id);
	}
	return [...runs.values()];
}

/**
 * 由测量矩形求一条轨道的全部绘制盒：竖轨（母会话卡片底缘 → 末级子卡中心，
 * 含收口行）+ 每个子卡一条接入横线（竖轨右缘 → 子卡左缘）。所有坐标取整到
 * CSS 像素：卡片高度是流式小数，任何一条按小数坐标定位的 1px 线段都会被
 * 抗锯齿随机摊薄（粗细不一、端点方头错位）；统一取整后全部线段同相位，
 * 粗细一致且端点天然相接（T-033 东家验收发现）。rectOf(id) 返回浮点
 * { top, height, left } 或 null；读数缺失或高度非正（折叠/隐藏态）返回 null。
 */
export function trackBoxes(run, rectOf, indentPx) {
	const parent = rectOf(run?.parentId);
	if (parent == null) return null;
	const childIds = Array.isArray(run?.childIds) ? run.childIds : [];
	if (childIds.length === 0) return null;
	const childRects = [];
	for (const id of childIds) {
		const rect = rectOf(id);
		if (rect == null) return null;
		childRects.push(rect);
	}
	const top = Math.round(parent.top + parent.height);
	const left = Math.round(parent.left + indentPx / 2 + 1);
	const lastRect = childRects[childRects.length - 1];
	const bottom = Math.round(lastRect.top + lastRect.height / 2);
	if (!(bottom > top)) return null;
	// 竖轨延伸进收口横线所在行（+1），拐角像素由竖轨绘制，横线从其右缘起笔，互不重叠。
	const track = { top, left, height: bottom - top + 1 };
	const stubs = childRects.map((rect) => ({
		top: Math.round(rect.top + rect.height / 2),
		left: left + 1,
		width: Math.round(rect.left) - (left + 1),
	}));
	return { track, stubs };
}
/**
 * 渲染去重签名：两份条目序列若产出字节一致的可见状态则签名相等，
 * 因此渲染可跳过全部 DOM 写入，打破 渲染→写 DOM→再次触发渲染 的循环。
 */
export function cardSignature(entries) {
	return JSON.stringify(
		entries.map((entry) => [
			entry.id,
			entry.parentId ?? null,
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

/** 会话行是否满足自身状态的活动判定，不含后代活动继承。 */
function isOwnActiveRow(row, byId = {}) {
	if (!isRecord(row)) return false;
	const running = row.running === true;
	const pending = row.pendingInteraction !== undefined;
	if (isSubagentRow(row, byId)) return running || pending;
	return running || pending || row.completed === true;
}

/** 沿活动会话的有效 parentId 链补齐活动祖先，供活动区与历史区共用。 */
export function activeSessionIds(byId = {}) {
	const activeIds = new Set();
	for (const [id, row] of Object.entries(byId)) {
		if (!isOwnActiveRow(row, byId)) continue;
		let currentId = String(id);
		const seen = new Set();
		while (currentId !== "" && !seen.has(currentId)) {
			seen.add(currentId);
			activeIds.add(currentId);
			const parentId = byId[currentId]?.parentId;
			if (parentId === undefined || parentId === null || !isRecord(byId[parentId])) break;
			currentId = String(parentId);
		}
	}
	return activeIds;
}

/** 判断活动条目是否需要建立轮内状态订阅；parent 上下文明确排除。 */
export function shouldSubscribeToSession(entry, byId = {}) {
	if (entry?.kind === "running") return true;
	return entry?.kind === "subagent" && byId?.[entry.id]?.running === true;
}

/** 会话行是否满足活动区显示判定（自身活动或存在活动后代）。 */
export function isActiveRow(row, byId = {}, activeIds = null) {
	if (isOwnActiveRow(row, byId)) return true;
	return activeIds instanceof Set && row?.id != null && activeIds.has(String(row.id));
}

/**
 * 响应保持记账（R-01-002/AC-05、R-01-010/AC-06）：主会话结束一轮后仍为当前会话期间，
 * 由本记账让会话以 awaiting 留在活动区。登记（单点）：上一帧自身活动（running/awaiting）
 * 的主会话在当前焦点下变为非活动——覆盖完成提醒卡被激活（宿主同帧切换 current 并清除
 * completed 的原子时序）与当前焦点下运行结束（宿主不置 completed）两条路径；同帧
 * `completed && current` 兜底（宿主先切 current 后清 completed 的时序）。
 * 解除：当前会话非空且切走、或会话行消失。仅主会话参与；返回新集合，不改入参。
 */
export function updateCompletedHolds(heldIds, snapshot, prevActiveIds = []) {
	const next = new Set(heldIds instanceof Set ? heldIds : []);
	// 列表快照在途（缺失/无 byId）时原样保留保持记账：瞬时 loading 不得误解除。
	if (!isRecord(snapshot) || !isRecord(snapshot.byId)) return next;
	const byId = snapshot.byId;
	const current = snapshot?.current ?? null;
	const isCurrent = (id) => current !== null && String(current) === id;
	for (const id of Array.isArray(prevActiveIds) ? prevActiveIds : []) {
		const key = String(id);
		if (!isCurrent(key)) continue;
		const row = byId[key];
		if (isRecord(row) && !isSubagentRow(row, byId) && !isOwnActiveRow(row, byId)) next.add(key);
	}
	for (const [id, row] of Object.entries(byId)) {
		if (row?.completed === true && isCurrent(String(id)) && !isSubagentRow(row, byId)) next.add(String(id));
	}
	for (const id of next) {
		if (!isRecord(byId[id])) next.delete(id);
		else if (current !== null && String(current) !== id) next.delete(id);
	}
	return next;
}

/**
 * 活动区→历史区迁移检测（R-01-010/AC-07）：上一帧活动区 id 在本帧离开活动区且出现于
 * 历史区即判定为一次迁移；彻底消失（归档、滑出历史窗口）不判定。prevActiveIds 为上一帧
 * 已渲染的活动区 id 集合，active/recent 为本帧派生条目。
 */
export function movedToRecentIds(prevActiveIds, active, recent) {
	if (!(prevActiveIds instanceof Set)) return [];
	const activeIds = new Set((Array.isArray(active) ? active : []).map((entry) => String(entry?.id)));
	const recentIds = new Set((Array.isArray(recent) ? recent : []).map((entry) => String(entry?.id)));
	const moved = [];
	for (const id of prevActiveIds) {
		if (!activeIds.has(id) && recentIds.has(id)) moved.push(id);
	}
	return moved;
}

/**
 * 构建最近历史区条目：当前非活动、且在历史窗口内最后一次活动过的**主会话**
 * （子代理是临时工作单元，不入最近历史；故需同时排除表白会话与已结束子代理），
 * 按最后活动时间从新到旧，最多 HISTORY_MAX 条。blank 会话不出现（从未用过）；
 * 归档会话不出现——原生 runtime 会立即清空对归档会话的选中，列出它只会得到
 * 一张点了回落到新会话界面的死卡。响应保持中的会话留在活动区，不入历史区。
 */
export function buildRecent(snapshot, workspaceItems, now, windowMs = HISTORY_WINDOW_MS, detailsById = {}, archivedIds = [], heldIds = null) {
	const byId = isRecord(snapshot) && isRecord(snapshot.byId) ? snapshot.byId : {};
	const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : [];
	const current = snapshot?.current ?? null;
	const items = Array.isArray(workspaceItems) ? workspaceItems : [];
	const activeIds = activeSessionIds(byId);
	const archived = archivedIds instanceof Set ? archivedIds : new Set(archivedIds ?? []);
	const entries = [];

	for (const id of ids) {
		const row = byId[id];
		if (!isRecord(row)) continue;
		if (row.blank === true) continue;
		if (archived.has(id)) continue; // 归档会话不可选中，不入最近历史
		if (heldIds instanceof Set && heldIds.has(String(id))) continue; // 响应保持中，留在活动区
		if (isSubagentRow(row, byId)) continue; // 子代理（含已结束）不入最近历史
		if (isActiveRow(row, byId, activeIds)) continue;
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
