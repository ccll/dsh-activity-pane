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
	question: "提问",
};

/** 阻塞等待备注行动作说明（R-01-002/AC-09）：说明等待的具体动作与「不答就无法继续」的后果。 */
const PENDING_NOTES = {
	approval: "等待你确认授权后继续",
	"plan-review": "等待你审查计划后继续",
	question: "等待你回答问题后继续",
};

/** 未知阻塞种类的中性兜底（评审修正，C-028）： pendingInteraction 是宿主封闭集合，
 *  未知值按阻塞对待（不答就无法继续），但文案/图标不冒充任何已知类型。 */
const PENDING_UNKNOWN_LABEL = "待处理";
const PENDING_UNKNOWN_NOTE = "等待你处理后继续";

/** 完成提醒正文行（R-01-002/AC-09，C-040、C-043）：引导继续对话或移入历史——「已完成」
 *  语义已由首行胶囊承载，正文不再重复；文案长度受末行宽度约束——须与「移入历史」
 *  按钮同排在默认窗格宽度下单行完整可见。 */
export const ROUND_DONE_NOTE = "继续对话，或移入历史";

/** 错误提醒信息截断上限（宿主登记 lastTurnEndError 与客户端渲染共用，C-043）：
 *  错误信息只为提示用户会话出错了，超长正文无展示价值；与提问列表单项上界同量级。 */
export const ERROR_NOTE_MAX = 120;

/** 错误提醒正文回落文案（R-01-002/AC-13，C-043）：error 回合无可用错误信息时使用。 */
export const ERROR_NOTE_FALLBACK = "回合以错误结束，请检查会话";

/** 错误信息截断（R-01-002/AC-13，C-043）：按 Unicode 码点截断至 ERROR_NOTE_MAX（省略号
 *  不计入上限、属展示截断信号）；非字符串返回空串（宿主侧仅字符串入参，防御性边界）。
 *  截断在宿主登记时执行一次、渲染侧直接消费已截断的 lastTurnEndError；共享核心承载便于
 *  单一事实源与可执行验证（Spec 轴审核：截断须有测试锚点）。 */
export function truncateErrorNote(text) {
	if (typeof text !== "string") return "";
	const chars = [...text];
	return chars.length <= ERROR_NOTE_MAX ? text : `${chars.slice(0, ERROR_NOTE_MAX).join("")}…`;
}

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

/** 原生 latestLine 语义：流式思考行显示尾部最新行（ReasoningRow running 分支）。 */
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

/** 取 ask_user_question 参数中的结构化问题预览（R-01-002/AC-09，C-064）：逐条取
 *  问题正文物理首行（正文缺失时回落 header，仍不可得则跳过该条），剥除行尾多余
 *  冒号，并保留原始 1 基序号；最多返回 3 条，仍有可展示问题时 omitted=true。
 *  结构不符或全部问题均不可得返回 null，由调用方回落动作说明。 */
export function askQuestionsPreview(argsRaw, max = 60) {
	if (typeof argsRaw !== "string" || argsRaw === "") return null;
	let parsed;
	try {
		parsed = JSON.parse(argsRaw);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return null;
	const items = [];
	for (let i = 0; i < parsed.questions.length; i += 1) {
		const item = parsed.questions[i];
		if (!isRecord(item)) continue;
		const text = firstPhysicalLine(item.question, max) || firstPhysicalLine(item.header, max);
		const stripped = text.replace(/[：:]+\s*$/, "");
		if (stripped === "") continue;
		items.push({ index: i + 1, text: stripped });
	}
	if (items.length === 0) return null;
	return { items: items.slice(0, 3), omitted: items.length > 3 };
}

function isQuestionPreview(value) {
	return isRecord(value) && Array.isArray(value.items) && value.items.length > 0;
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
		// 结构化提问预览随工作项携带（R-01-002/AC-09，C-064），供待回复卡渲染原生列表。
		question: name === "ask_user_question" ? askQuestionsPreview(argsRaw) : null,
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
			label: "用户",
			text,
			detail: null,
			status: "done",
		};
	}
	if (node.kind === "assistant-step" || node.kind === "assistant") {
		const text = assistantBlockText(data.blocks, "text");
		const reasoning = assistantBlockText(data.blocks, "reasoning");
		if (!text && !reasoning) return null;
		const label = reasoning ? "思考" : "助手";
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

/** 用户节点廉价判定（指令锚行前走用）：与 timelineItemFromChatNode 的 user/steering
 *  转换入口同口径（非 hidden 的 user/steering），并按锚行语义额外要求非空文本——
 *  空白指令不值得钉住；只读 kind/visibility 与文本块类型，不解析正文全文。 */
function isUserChatNode(node) {
	if (!isRecord(node) || node.visibility === "hidden") return false;
	if (node.kind !== "user" && node.kind !== "steering") return false;
	const data = isRecord(node.data) ? node.data : {};
	return Array.isArray(data.content) && data.content.some((block) => isRecord(block) && block.type === "text" && typeof block.text === "string" && block.text.trim() !== "");
}

function chatNodeAt(nodes, key) {
	try {
		return nodes?.get?.(key) ?? nodes?.[key];
	} catch {
		return undefined;
	}
}

/** 尾部反向收集原始工作项（不含 live 合并），取够 want 个可转换项或耗尽 order 即停。
 *  continueToUser：取够后以廉价结构检查（isUserChatNode：非 hidden 的 user/steering 且含非空文本块）继续前走至最近一个未收集的用户节点（含
 *  steering），命中才转换并入队首——供指令锚行派生（R-01-012/AC-12），不为找锚做全序转换。 */
function rawTailItems(snapshot, want, cwd = "", continueToUser = false) {
	const chat = snapshot?.chat;
	const order = Array.isArray(chat?.order) ? chat.order : [];
	const nodes = chat?.nodes;
	const max = Math.max(0, want);
	if (max === 0) return [];
	const items = [];
	let i = order.length - 1;
	for (; i >= 0 && items.length < max; i -= 1) {
		const item = timelineItemFromChatNode(chatNodeAt(nodes, order[i]), cwd);
		if (item) items.unshift(item);
	}
	if (continueToUser) {
		for (; i >= 0; i -= 1) {
			const node = chatNodeAt(nodes, order[i]);
			if (!isUserChatNode(node)) continue;
			const item = timelineItemFromChatNode(node, cwd);
			// 判定与转换口径分叉时继续前走，不提前终止（漏掉更早的用户节点）。
			if (!item) continue;
			items.unshift(item);
			break;
		}
	}
	return items;
}

/** live 合并：partial 流式项与 runningCalls 摘除匹配项后并入尾部窗口；
 *  max 仅约束返回长度（折叠路径传大值以保留全部分组成员）。 */
function mergeLiveItems(items, snapshot, max, cwd = "") {
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
			// 镜像原生 ReasoningRow：流式思考显示尾部最新行，避免与已定案首行摘要漂移。
			summary: partialReasoning ? latestLineOf(partialReasoning) : partialText,
			status: "running",
			live: true,
		});
	}
	for (const call of Array.isArray(snapshot?.runningCalls) ? snapshot.runningCalls : []) {
		const item = timelineToolItem(call, null, cwd);
		if (!item) continue;
		const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
		if (existingIndex >= 0) liveItems.push({ ...items.splice(existingIndex, 1)[0], ...item, live: true });
		else liveItems.push({ ...item, live: true });
	}
	return liveItems.length > 0
		? items.slice(-Math.max(0, max - liveItems.length)).concat(liveItems).slice(-max)
		: items;
}

/** R-01-009/AC-10：会话运行中（无 pending）、无执行中项且尾部为已定案非用户项时，
 *  克隆提升为 running 作为 agent 工作中的持续标志；error/stopped 与用户输入项不提升。
 *  descendantActive：存在活动后代（委托周期呈现）视同运行中。 */
function promoteRunningTail(timeline, snapshot, descendantActive = false) {
	if (
		(snapshot?.running === true || descendantActive === true) &&
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

/** 非执行呈现（快照 pending，或渲染层判定等待/暂停且快照为冻结值）下无任何在飞项：
 *  派生行中残留的 running 一律落定为 done——等待卡时间线不再闪烁（执行中呈现只保留真实在飞项）。 */
function settleWhenIdle(rows, idle) {
	if (idle !== true) return rows;
	return rows.map((row) => (row?.status === "running" ? { ...row, status: "done" } : row));
}

/** 快照级 idle 判定：pending 非空即回合冻结。 */
function snapshotIdle(snapshot) {
	return Array.isArray(snapshot?.pending) && snapshot.pending.length > 0;
}

/** 从主会话 ChatSnapshot 的真实 order 收集尾部扁平工作项（含 live 合并与尾部提升），
 *  作为折叠分组（foldedConversationTimeline/foldWorkGroups）的输入内核与分组成员级观察接缝。 */
export function conversationWorkItems(snapshot, limit = 4, cwd = "") {
	const max = Math.max(0, limit);
	if (max === 0) return [];
	// 尾部反向收集：工作项只取尾部 max 个，长会话不再全序扫描；
	// live 合并只作用于尾部子集（partial/runningCalls 的对应已定案项必在最近窗口内）。
	const full = mergeLiveItems(rawTailItems(snapshot, max, cwd), snapshot, max, cwd);
	return settleWhenIdle(promoteRunningTail(full.slice(-max), snapshot), snapshotIdle(snapshot));
}

/** 折叠分组硬边界：用户输入项与含正文输出的 assistant 项（R-01-017/AC-02）。 */
function isFoldBoundary(item) {
	if (item.kind === "user") return true;
	return item.kind === "assistant" && typeof item.text === "string" && item.text.trim() !== "";
}

/** 分组成员归一：tool/context 直接映射，assistant 取其 reasoning（detail）为思考成员。 */
function foldMemberOf(item) {
	if (item.kind === "context") {
		return { cat: "context", label: "上下文注入", summary: "", text: "", icon: "context", status: item.status, live: item.live === true };
	}
	if (item.kind === "tool") {
		return {
			cat: "tool",
			label: TOOL_LABELS[item.toolName] ?? item.label ?? "Tool",
			summary: typeof item.summary === "string" ? item.summary : "",
			text: "",
			icon: typeof item.icon === "string" ? item.icon : undefined,
			// 结构化提问预览穿透折叠层（R-01-002/AC-09，C-064），供待回复卡渲染列表。
			question: isQuestionPreview(item.question) ? item.question : null,
			status: item.status,
			live: item.live === true,
		};
	}
	return {
		cat: "think",
		label: "思考",
		summary: typeof item.summary === "string" ? item.summary : "",
		text: typeof item.detail === "string" ? item.detail : "",
		icon: "assistant",
		status: item.status,
		live: item.live === true,
	};
}

/** 组行派生：镜像 dsh-auto-collapse updateChip 标题/状态优先级（vendor 移植，C-016）——
 *  running tool > running think > 运行了命令/编辑了文件 > 已思考，context 连续段独立成组；
 *  含思考的完成组组摘要携带推理文本内容（R-01-017/AC-03、AC-04），纯工具完成组回退末位工具摘要；
 *  tool 组行图标统一命令图标 IconApiOutline14（与 auto-collapse 工具 chip 同源，C-016）。 */
function buildFoldRow(run) {
	const members = run.members;
	const runningTool = run.cat === "work" ? members.find((m) => m.cat === "tool" && m.status === "running") ?? null : null;
	const runningThink = run.cat === "work" ? members.find((m) => m.cat === "think" && m.status === "running") ?? null : null;
	const toolMembers = run.cat === "work" ? members.filter((m) => m.cat === "tool") : [];
	const thinkMembers = run.cat === "work" ? members.filter((m) => m.cat === "think") : [];
	const tools = [...new Set(toolMembers.map((m) => m.label))];
	const hasError = members.some((m) => m.status === "error");
	const hasStopped = members.some((m) => m.status === "stopped");
	const status =
		runningTool !== null || runningThink !== null ? "running" : hasError ? "error" : hasStopped ? "stopped" : "done";
	let label;
	let kind;
	let icon;
	if (run.cat === "context") {
		label = "上下文注入";
		kind = "context";
		icon = "context";
	} else if (runningTool !== null) {
label = "正在运行";
		kind = "tool";
icon = "bash";
	} else if (runningThink !== null) {
		label = "正在思考";
		kind = "assistant";
		icon = "assistant";
	} else if (tools.length > 0) {
		label = tools.some((t) => t === "Edit" || t === "Write") ? "编辑了文件" : "运行了命令";
		kind = "tool";
		icon = "bash";
	} else {
		label = "已思考";
		kind = "assistant";
		icon = "assistant";
	}
	let summary = runningTool?.summary ?? runningThink?.summary ?? "";
	if (status !== "running" && run.cat === "work") {
		if (summary === "") {
			// AC-04：含思考分组从最后一条思考向前取首个非空推理文本摘录。
			for (let i = thinkMembers.length - 1; i >= 0 && summary === ""; i -= 1) {
				summary = cleanPreview(thinkMembers[i].text, 88) ?? "";
			}
		}
		if (summary === "" && toolMembers.length > 0) summary = toolMembers[toolMembers.length - 1].summary;
	}
	return {
		// 组 id 只含首成员键：流式期间成员并入不改变 id，渲染层 DOM 复用与脉冲动画保持连续（评审修正）。
		id: `fold:${run.cat}:${run.keys[0] ?? ""}`,
		kind,
		fold: true,
		label,
		text: "",
		summary,
		detail: null,
		// 组内末条提问正文上浮组行（R-01-002/AC-09）；无提问成员时为 null。
		question: toolMembers.map((m) => m.question).filter(Boolean).pop() ?? null,
		status,
		live: members.some((member) => member.live === true),
		icon,
	};
}

/** 把扁平工作项序列折叠成分组行（R-01-017）：硬边界为用户输入与含正文 assistant 项，
 *  含正文 assistant 的 reasoning 先并入当前分组再闭组（splitThinkByBody 前置语义）；
 *  连续 context 独立成组；其余未知项原样透传。最多返回最近 limit 个显示行。 */
export function foldWorkGroups(items, limit = 4) {
	const max = Math.max(0, limit);
	if (max === 0) return [];
	const rows = [];
	let run = null;
	const flush = () => {
		if (run !== null && run.members.length > 0) rows.push(buildFoldRow(run));
		run = null;
	};
	for (const item of Array.isArray(items) ? items : []) {
		if (!item || typeof item !== "object") continue;
		if (isFoldBoundary(item)) {
		if (item.kind === "assistant" && typeof item.detail === "string" && item.detail.trim() !== "") {
			if (run === null || run.cat !== "work") {
				flush();
				run = { cat: "work", members: [], keys: [] };
			}
			// 正文已流出 ⇒ 本步推理必然结束：拆入组的思考成员落定，不与正文行一起闪烁
			// （真实在飞的 partial/runningCalls 行不受影响，多子代理并发同闪语义保留）。
			const thinkMember = foldMemberOf(item);
			run.members.push(thinkMember.status === "running" ? { ...thinkMember, status: "done" } : thinkMember);
			run.keys.push(String(item.id ?? ""));
			// 推理文本已并入当前组（组摘要承载，AC-04）；正文行剥离推理展示并跳过原生行匹配，
			// 避免同一推理文本在组行与下一行重复呈现（R-01-017/AC-02 验收修正）。
			const body = { ...item, label: "助手", summary: item.text, detail: null, stripNative: true };
			flush();
			rows.push(body);
			continue;
		}
		flush();
		rows.push({ ...item });
		continue;
		}
		const cat = item.kind === "context" ? "context" : item.kind === "tool" || item.kind === "assistant" ? "work" : null;
		if (cat === null) {
			flush();
			rows.push({ ...item });
			continue;
		}
		if (run === null || run.cat !== cat) {
			flush();
			run = { cat, members: [], keys: [] };
		}
		run.members.push(foldMemberOf(item));
		run.keys.push(String(item.id ?? ""));
	}
	flush();
	return rows.slice(-max);
}

/** history 事件条目解包：兼容 `{ event }` 包装与裸事件两种形态（尾扫类派生共用）。 */
function eventOf(entry) {
	return isRecord(entry?.event) ? entry.event : entry;
}

/** 可锚用户行判定：非空文本的用户输入行（R-01-012/AC-12 口径，快照与 history 路径共用）。 */
export function isAnchorableUserRow(row) {
	return row?.kind === "user" && typeof row.text === "string" && row.text.trim() !== "";
}

/** 当前活动行：优先取最新真实 live running，缺失 live 身份时回退最新 running。 */
function currentActivityIndex(rows) {
	let runningIndex = -1;
	for (let i = rows.length - 1; i >= 0; i -= 1) {
		const row = rows[i];
		if (row?.status !== "running" || row.kind === "user") continue;
		if (runningIndex < 0) runningIndex = i;
		if (row.live === true) return i;
	}
	return runningIndex;
}

/** 指令锚行与工作行统一选择（R-01-009/AC-11、R-01-012/AC-12～AC-15、C-039）：
 *  可锚用户行作为普通显示行参与尾部窗口滚动，滚动至显示第一行时停留为指令锚行
 *  （满窗几何为其后显示行数 ≥ max-1；时间线不足一窗时自然窗口首行的可锚用户行直接停留）。
 *  已存在停留锚行（窗口内停留锚行或 fallbackAnchor 充当窗口外停留锚行）时，滚动至显示
 *  第二行的可锚用户行取代旧锚升上首行，其后各行上移、暂减一行，不从窗口之外回填旧行。
 *  fallbackAnchor 与窗口内任一可锚用户行同文本时判为同一消息，不充当停留锚行。
 *  工作行选取保留最新真实当前活动行于末行，其余名额按最新顺序填满。 */
function selectTimelineRows(full, max, fallbackAnchor = null) {
	const list = Array.isArray(full) ? full : [];
	if (max <= 0) return [];
	const workRows = (rows, budget) => {
		if (budget <= 0) return [];
		const activityIndex = currentActivityIndex(rows);
		const activity = activityIndex >= 0 ? rows[activityIndex] : null;
		const history = activityIndex < 0 ? rows : rows.filter((_, index) => index !== activityIndex);
		const picked = history.slice(-Math.max(0, budget - (activity === null ? 0 : 1)));
		if (activity !== null) picked.push(activity);
		return picked;
	};
	const pin = (row) => ({ ...row, anchor: true });
	const after = (index) => list.length - index - 1;
	const userIndex = list.findLastIndex(isAnchorableUserRow);
	if (userIndex < 0) {
		// 窗口内无可锚用户行：history 提取的最近用户消息充当停留锚行（快照窗口外兜底）。
		return isAnchorableUserRow(fallbackAnchor) ? [pin(fallbackAnchor), ...workRows(list, max - 1)] : workRows(list, max);
	}
	// fallbackAnchor 与窗口内可锚用户行同文本时判为同一消息，不充当停留锚行（避免同一指令双行）。
	const fallback = isAnchorableUserRow(fallbackAnchor) && !list.some((row) => isAnchorableUserRow(row) && row.text === fallbackAnchor.text) ? fallbackAnchor : null;
	// 链起点：fallback 充当的窗口外停留锚行；否则最早滚动触顶（after ≥ max-1）的用户行；
	// 均无且时间线不足一窗时，自然窗口首行的可锚用户行直接停留（空时间线首条指令占据第一行）。
	let anchorIndex = -1;
	if (fallback === null) {
		for (let i = 0; i <= userIndex; i += 1) {
			if (isAnchorableUserRow(list[i]) && after(i) >= max - 1) {
				anchorIndex = i;
				break;
			}
		}
		if (anchorIndex < 0 && list.length <= max) {
			const head = workRows(list, max)[0] ?? null;
			anchorIndex = head !== null && isAnchorableUserRow(head) ? list.indexOf(head) : -1;
		}
		if (anchorIndex < 0) return workRows(list, max);
	}
	// 逐次顶替：滚动至显示第二行（停留锚行之后窗口的首行）的可锚用户行取代旧锚成为新停留锚行。
	while (true) {
		const source = anchorIndex >= 0 ? list.slice(anchorIndex + 1) : list;
		if (source.length >= max - 1) {
			// 满窗：到达过第二行（after ≥ max-2）的最近可锚用户行为停留锚行。
			let next = -1;
			for (let i = list.length - 1; i > anchorIndex; i -= 1) {
				if (isAnchorableUserRow(list[i]) && after(i) >= max - 2) {
					next = i;
					break;
				}
			}
			if (next < 0) break;
			anchorIndex = next;
		} else {
			// 短窗：第二行为停留锚行之后的首个历史行；为可锚用户行即顶替。
			const second = workRows(source, max - 1)[0] ?? null;
			if (!isAnchorableUserRow(second)) break;
			const next = list.indexOf(second);
			if (next < 0) break;
			anchorIndex = next;
		}
	}
	return anchorIndex >= 0
		? [pin(list[anchorIndex]), ...workRows(list.slice(anchorIndex + 1), max - 1)]
		: [pin(fallback), ...workRows(list, max - 1)];
}

/** 折叠分组时间线（R-01-017）：渲染层时间线的唯一来源——无条件折叠分组，不做任何探测切换。
 *  指数扩窗收集尾部原始项（分组数不足 limit 时 ×3 → ×8 → 全序）+ live 合并 + 分组 +
 *  尾部提升，长会话典型情况不触碰全序扫描。
 *  idle：渲染层判定的非执行呈现（等待响应/暂停，快照为冻结值、pending 不可得）——为 true 时残留 running 全部落定。 */
export function foldedConversationTimeline(snapshot, limit = 4, cwd = "", descendantActive = false, idle = false, fallbackAnchor = null) {
	const max = Math.max(0, limit);
	if (max === 0) return [];
	// 非执行呈现（渲染层 idle 判定或快照 pending）且非委托周期：落定在分组之前——
	// 组标题/状态由已定案成员派生（避免 done 圆点配「正在思考」标题），尾部提升同时跳过。
	const settle = (idle === true || snapshotIdle(snapshot)) && descendantActive !== true;
	for (const want of [max * 3, max * 8, Number.MAX_SAFE_INTEGER]) {
		const items = rawTailItems(snapshot, want, cwd, true);
		const merged = mergeLiveItems(items, snapshot, Number.MAX_SAFE_INTEGER, cwd);
		const full = foldWorkGroups(settle ? settleWhenIdle(merged, true) : merged, Number.MAX_SAFE_INTEGER);
		if (full.length >= max || want === Number.MAX_SAFE_INTEGER) {
			// 指令锚行窗口选择与冷 history 路径共用（selectTimelineRows，R-01-012/AC-12～AC-15）；
			// settle/尾部提升出口归一为 finish。
			const finish = (rows) => (settle ? rows : promoteRunningTail(rows, snapshot, descendantActive));
			return finish(selectTimelineRows(full, max, fallbackAnchor));
		}
	}
	return [];
}

function timelineItemFromEvent(entry, cwd = "") {
	const event = isRecord(entry?.event) ? entry.event : entry;
	const data = isRecord(event?.data) ? event.data : {};
	if (!event || typeof event.type !== "string") return null;
	if (event.type === "user/message" && data.source?.kind === "user") {
		return { id: `user:${event.seq}`, kind: "user", icon: "user", label: "用户", text: contentText(data.content), detail: null, status: "done" };
	}
	if (event.type === "assistant/message") {
		const text = contentText(data.message?.content);
		return text ? { id: `assistant:${event.seq}`, kind: "assistant", icon: "assistant", text, detail: null, status: "done" } : null;
	}
	if (event.type === "tool/call") {
		return timelineToolItem({ kind: "tool-call", callId: data.callId, name: data.name, argsRaw: data.arguments, callView: entry?.view?.for === "call" ? entry.view.view : null }, null, cwd);
	}
	if (event.type === "tool/result") {
		return timelineToolItem(historyToolResultRoot(data, entry?.view?.for === "result" ? entry.view.view : null), null, cwd);
	}
	return null;
}

/** tool/result 事件的结果内容块（canonical message.content 中 type === 'tool-result' 者）。 */
function toolResultBlockOf(data) {
	const content = isRecord(data?.message) && Array.isArray(data.message.content) ? data.message.content : [];
	return content.find((block) => isRecord(block) && block.type === "tool-result") ?? null;
}

/** tool/result 事件的 callId：canonical 契约保证 message.source.callId 存在（dsh-tool-cordis ToolMessageSource）。 */
function toolResultCallId(data) {
	const callId = isRecord(data?.message) && isRecord(data.message.source) ? data.message.source.callId : null;
	return typeof callId === "string" && callId !== "" ? callId : undefined;
}

/** tool/result 事件 → timelineToolItem root（canonical 形状单点读取：data = { turn, step, message, error? }）；
 *  result 事件不携带 name/arguments，配对路径经 callInfo 由 call 事件补齐身份与 callView。 */
function historyToolResultRoot(data, resultView, callInfo = null) {
	const block = toolResultBlockOf(data);
	return {
		kind: "tool-result",
		callId: toolResultCallId(data),
		...(callInfo === null ? {} : { call: callInfo.call, callView: callInfo.callView ?? undefined }),
		resultView,
		isError: block?.isError === true,
		error: data.error,
		content: block?.content,
	};
}

/** 判断 session window 是否尚未 hydrate，需用 native history 补齐。 */
export function needsHistorySnapshot(snapshot) {
	return !snapshot || !Array.isArray(snapshot.chat?.order) || snapshot.chat.order.length === 0;
}

/** 冷会话 history 回溯深翻：自尾页起按 beforeSeq 向前翻页，直至命中最近一条用户消息
 *  （messagePreviews 的 userPreview 非空，R-01-013/AC-03）、或翻尽
 *  （hasMore=false/无更多事件/业务错误 null）；requireOpenTurnStart 为 true 时
 *  （运行会话开放回合起点兜底，R-01-009/AC-06）命中用户消息后开放回合起点未命中
 *  仍继续深翻直至起点命中或翻尽。maxPages 仅作显式护栏（默认 Infinity 即不设页数
 *  上限——用户消息必然存在于会话最早段，翻尽必终止，无需预置页数界）。fetchPage
 *  (beforeSeq) 注入实际读取（返回 `{events, hasMore}` 或 null），便于纯函数单测；
 *  中途异常保留已得事件并以 error 返回。返回 `{ events, error }`（events 按时间
 *  正序，新页在后）。 */
export async function pagedHistoryEvents({ fetchPage, maxPages = Infinity, requireOpenTurnStart = false }) {
	const allEvents = [];
	let beforeSeq;
	let hasMore = true;
	let error = null;
	for (let pages = 0; pages < maxPages && hasMore; pages += 1) {
		const previews = messagePreviews({ history: allEvents });
		if (previews.userPreview) {
			if (!requireOpenTurnStart || openTurnStartFromEvents(allEvents) !== null) break;
		}
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

/** 冷会话 history 的扁平工作项映射：供没有 ChatSnapshot 的活动/历史会话折叠分组使用。
 *  native `sessions.history` 响应只含 `{events, hasMore, projections?}`（in-flight
 *  partial 以 chunk 事件携带，不做逐 chunk 折叠），故只从事件流取尾部工作项。
 *  tool/result 落定同 callId 的 call 项（原位替换，name/arguments/callView 由 call 事件补齐）：
 *  history 是冻结过去，call 事件单独留存会成为永久 running 幽灵行（R-01-016/AC-01）。 */
export function conversationTimelineFromHistory(history, limit = 4, cwd = "") {
	const items = [];
	const inflightCalls = new Map(); // callId → { index, data, callView }：等待结果落定的 tool/call 事件
	for (const entry of Array.isArray(history) ? history : []) {
		const event = eventOf(entry);
		const data = isRecord(event?.data) ? event.data : {};
		if (event?.type === "tool/result") {
			const callId = toolResultCallId(data);
			const pending = callId !== undefined ? inflightCalls.get(callId) : undefined;
			if (pending !== undefined) {
				inflightCalls.delete(callId);
				items[pending.index] = timelineToolItem(
					historyToolResultRoot(data, entry?.view?.for === "result" ? entry.view.view : null, {
						call: { name: typeof pending.data.name === "string" ? pending.data.name : "", argsRaw: typeof pending.data.arguments === "string" ? pending.data.arguments : "" },
						callView: pending.callView,
					}),
					null,
					cwd,
				);
				continue;
			}
		}
		const item = timelineItemFromEvent(entry, cwd);
		if (!item) continue;
		if (event?.type === "tool/call" && item.callId !== "") {
			inflightCalls.set(item.callId, { index: items.length, data, callView: entry?.view?.for === "call" ? entry.view.view : null });
		}
		items.push(item);
	}
	const max = Math.max(0, limit);
	return max === 0 ? [] : items.slice(-max);
}

/** 冷 history 折叠分组时间线（R-01-017、R-01-012/AC-12～AC-15）：页内全部事件映射折叠后
 *  套用与快照路径同一窗口/锚行选择（selectTimelineRows），最近用户消息滚动触顶后停留为
 *  首行锚行。 */
export function foldedHistoryTimeline(history, limit = 4, cwd = "") {
	const max = Math.max(0, limit);
	if (max === 0) return [];
	const items = conversationTimelineFromHistory(history, Number.MAX_SAFE_INTEGER, cwd);
	return selectTimelineRows(foldWorkGroups(items, Number.MAX_SAFE_INTEGER), max);
}

/** history 指令锚行提取（R-01-012/AC-12 快照窗口外兜底）：尾部反向取最近一条非空文本的
 *  真实用户消息（source.kind === "user"），归一为带 anchor 标记的用户行；无则返回 null。 */
export function historyInstructionAnchor(history) {
	const list = Array.isArray(history) ? history : [];
	for (let i = list.length - 1; i >= 0; i -= 1) {
		const event = eventOf(list[i]);
		if (event?.type !== "user/message" || event.data?.source?.kind !== "user") continue;
		const text = contentText(event.data.content);
		if (text.trim() === "") continue;
		return { id: `user:${event.seq}`, kind: "user", icon: "user", label: "用户", text, detail: null, status: "done", anchor: true };
	}
	return null;
}


/** 开放回合起点缺口判定（R-01-009/AC-06 冷窗口兜底触发口径）：快照就绪、宿主判定运行中、
 *  轮内订阅已建立，但快照 turnTimings 无开放回合起点（liveStartTime 为 null）——超长回合
 *  的 turn/start 在尾页窗口之外。等待/空闲会话（非运行或无 liveness 记录）不算缺口，
 *  不触发 history 补读。 */
export function openTurnStartMissing({ snapshotReady = false, running = false, hasLiveness = false, liveStartTime = null } = {}) {
	return snapshotReady === true && running === true && hasLiveness === true && liveStartTime == null;
}

/** 开放回合起点兜底提取（R-01-009/AC-06）：history 事件尾部反向扫描，最近一条边界事件
 *  为 turn/start 即存在开放回合、返回其时刻；为 turn/end 则无开放回合返回 null。
 *  minTurn：快照已知的最晚回合号——history 开放回合落后于此（拉取后已切换新回合）时
 *  判为陈旧返回 null。turn/start 时刻非法或输入非数组归一 null。 */
export function openTurnStartFromEvents(events, minTurn = -Infinity) {
	const list = Array.isArray(events) ? events : [];
	for (let i = list.length - 1; i >= 0; i -= 1) {
		const event = eventOf(list[i]);
		if (event?.type === "turn/end") return null;
		if (event?.type !== "turn/start") continue;
		const turn = Number(event.data?.turn);
		if (Number.isFinite(turn) && turn < minTurn) return null;
		const time = Number(event.time);
		return Number.isFinite(time) ? time : null;
	}
	return null;
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
		// history 事件按时间正序（旧→新）：尾部反向扫描取最近命中，首个非空即最近
		// （R-01-013/AC-03、AC-04；深翻多页场景下必须取最近而非最早）。
		for (let i = (Array.isArray(history) ? history : []).length - 1; i >= 0 && (!user || !agent); i -= 1) {
			const entry = history[i];
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

/** 计费输入与缓存命中率：口径对齐原生统计行——计费输入=未缓存输入+缓存读+缓存写，
 *  命中率=缓存读÷计费输入（百分比四舍五入）；全空归 null，有输入无读桶时命中率未知。 */
export function usageSummary({ uncachedInputTokens = null, cacheReadTokens = null, cacheWriteTokens = null } = {}) {
	const bucket = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
	const uncached = bucket(uncachedInputTokens);
	const read = bucket(cacheReadTokens);
	const write = bucket(cacheWriteTokens);
	if (uncached === null && read === null && write === null) return { inputTokens: null, cacheHitPct: null };
	const inputTokens = (uncached ?? 0) + (read ?? 0) + (write ?? 0);
	const cacheHitPct = read !== null && inputTokens > 0 ? Math.round((read / inputTokens) * 100) : null;
	return { inputTokens, cacheHitPct };
}

/** 需要用户行动的种类的展示文案。 */
export function pendingText(kind) {
	return PENDING_LABELS[kind] ?? PENDING_UNKNOWN_LABEL;
}

/** 等待卡普通末行提示（R-01-002/AC-09，C-040、C-064）：待确认/待审查说明动作
 *  与后果；待回复在结构化问题不可得时回落动作说明；完成提醒固定引导新指令或移入历史。 */
export function awaitNoteText(waitClass, pendingKind) {
	if (waitClass === "done") return ROUND_DONE_NOTE;
	return PENDING_NOTES[pendingKind] ?? PENDING_UNKNOWN_NOTE;
}

/** 计数徽标底色跟随等待构成（R-01-002/AC-06，C-040、C-043）：按 错误 > 阻塞 > 完成
 *  的优先级取色——存在任一错误提醒主会话即取 `'error'`（红=最紧迫），否则存在阻塞
 *  等待主会话取 `'blocked'`（金催促），等待全部为完成提醒时取 `'done'`（绿=已完成
 *  不急）；无等待行动或仅运行卡时返回 null。子代理不计入。 */
export function awaitBadgeTone(entries) {
	let tone = null;
	for (const entry of Array.isArray(entries) ? entries : []) {
		if (entry?.kind !== "awaiting") continue;
		if (entry.waitClass === "error") return "error";
		if (entry.waitClass === "blocked") tone = "blocked";
		else if (entry.waitClass === "done" && tone === null) tone = "done";
	}
	return tone;
}

/** 时间线末条 ask_user_question 工作项携带的结构化提问预览；折叠组行同样上浮该字段。
 *  不存在时返回 null（R-01-002/AC-09，C-064）。 */
export function timelineQuestionPreview(timeline) {
	const rows = Array.isArray(timeline) ? timeline : [];
	for (let i = rows.length - 1; i >= 0; i -= 1) {
		const question = rows[i]?.question;
		if (isQuestionPreview(question)) return question;
	}
	return null;
}

/** 数量徽标统计：只统计主会话——分子为等待行动（awaiting，含完成提醒）的主会话数，
 *  分母为其加运行中（running，含委托周期保持运行呈现）主会话之和；子代理不计入
 *  （R-01-001/AC-05）。blocked 为其中阻塞等待（待确认/待审查/待回复）的主会话数，
 *  仅用于徽标 aria 文案的计数说明；脉冲门控已由 waiting 单参数承载（R-01-002/AC-06，C-037）。
 *  空列表返回 { waiting: 0, blocked: 0, total: 0 }。 */
export function awaitBadgeStats(entries) {
	let waiting = 0;
	let blocked = 0;
	let total = 0;
	for (const entry of Array.isArray(entries) ? entries : []) {
		if (entry?.kind !== "running" && entry?.kind !== "awaiting") continue;
		total += 1;
		if (entry.kind === "awaiting") {
			waiting += 1;
			if (entry.waitClass === "blocked") blocked += 1;
		}
	}
	return { waiting, blocked, total };
}

/** 数量标识呈现态（R-01-014/AC-06）：列表在途（loading）时不冒充计数——归一为
 *  loading 呈现（加载指示 + 加载中 aria 文案，不等待、不脉冲）；否则归一为 count
 *  呈现（n/m 文本 + 计数 aria 文案）。awaiting 表达「存在等待行动」——底色经
 *  awaitBadgeTone（错误 > 阻塞 > 完成，红/金/绿）与脉冲门控同一信号：任一等待行动
 *  （阻塞等待、完成提醒或错误提醒）即脉冲（R-01-002/AC-06，C-037、C-043）。
 *  blocked 入参只用于 aria 文案的计数说明，不再驱动门控。错误轴不算在途，维持计数呈现。 */
export function countBadgeState(listState, waiting, total, blocked = 0) {
	if (listState === "loading") return { mode: "loading", text: "", ariaText: "活动会话计数加载中", awaiting: false };
	const awaiting = waiting > 0;
	const hasBlocked = blocked > 0;
	const doneCount = waiting - (hasBlocked ? blocked : 0);
	return {
		mode: "count",
		text: `${waiting}/${total}`,
		ariaText: hasBlocked
			? doneCount > 0
				? `${total} 个活动会话，${blocked} 个等待你答复，${doneCount} 个已完成`
				: `${total} 个活动会话，${blocked} 个等待你答复`
			: awaiting
				? `${total} 个活动会话，${waiting} 个已完成`
				: `${total} 个活动会话`,
		awaiting,
	};
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
 *  详情与记账随可见性清理（pruneInvisibleEntries）一起移除后，决策自然恢复为「读取」。
 *  windowComplete（R-01-009/AC-06、R-01-012/AC-12 冷窗口兜底）：快照已就绪但窗口缺
 *  锚点数据（开放回合起点或可锚用户行在窗口外）时为 false——此时仍发起一次 history
 *  补读，供进度锚点与指令锚行兜底。previewFallbackNeeded 表示最近卡的快照预览
 *  不完整，同样补读一次 history（R-01-013/AC-03、AC-04）。 */
export function detailLoadPlan({
	detail = {},
	isSubagent = false,
	snapshotReady = false,
	historyNeeded = false,
	previewFallbackNeeded = false,
	windowComplete = true,
	modelInflight = false,
	historyInflight = false,
} = {}) {
	return {
		subagent: isSubagent === true,
		model: !isSubagent && !detail.model && !modelInflight,
		history:
			!historyInflight &&
			((previewFallbackNeeded && detail.previewFallbackLoaded !== true) ||
				(!detail.history && ((!snapshotReady && historyNeeded) || (snapshotReady === true && windowComplete === false)))),
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

/** 订阅清理（R-01-012/AC-16）：不可见 id 的订阅先 unsubscribe 再除名——监听器不得残留；
 *  单个 unsubscribe 抛错吞掉，不阻断其余订阅的清理。 */
export function pruneSubscriptions(subscriptions, visibleIds) {
	if (!(subscriptions instanceof Map)) return;
	const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds ?? []);
	for (const [id, unsubscribe] of subscriptions) {
		if (visible.has(id)) continue;
		try {
			unsubscribe?.();
		} catch {}
		subscriptions.delete(id);
	}
}

/**
 * 会话的工作区归属归一（R-01-003/AC-08）：在 title 归属判定的同一路径上同时
 * 返回工作区身份 key（路径优先、名称兜底），供徽标色相派生；无归属时两者皆空。
 */
export function workspaceInfoForSession(sessionId, workspaceItems, byId = {}) {
	const id = String(sessionId);
	const items = Array.isArray(workspaceItems) ? workspaceItems : [];

	for (const workspace of items) {
		if (!isRecord(workspace)) continue;
		const title = cleanText(workspace.title);
		if (!title || !Array.isArray(workspace.sessionIds)) continue;
		if (workspace.sessionIds.some((candidate) => String(candidate) === id))
			return { title, key: cleanText(workspace.path) || title };
	}

	const cwd = cleanText(byId[id]?.cwd);
	if (!cwd) return { title: "", key: "" };
	const workspace = items.find(
		(candidate) => isRecord(candidate) && cleanText(candidate.path) === cwd,
	);
	const title = cleanText(workspace?.title);
	return { title, key: title ? cleanText(workspace?.path) || title : "" };
}

/**
 * 工作区徽标色相（R-01-003/AC-08、AC-09）：以工作区身份为唯一输入的纯函数——
 * djb2 哈希经雪崩终混（异或右移 + 乘法，把高位熵折入低位，消除 djb2 低位分布
 * 聚集；每步 >>> 0 保持无符号，异或结果可能带符号位）后在避开红色警戒区的
 * 色相弧 [30°,320°] 上均匀取色（30 + hash % 291），输出 [30,320] 整数。
 * 同一身份恒得同一色相，与工作区列表顺序、会话状态及持久化存储无关，页面
 * 刷新后不变；空身份返回 null。
 */
export function workspaceHue(key) {
	const text = cleanText(key);
	if (!text) return null;
	let hash = 5381;
	for (let i = 0; i < text.length; i += 1)
		hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
	hash = (hash ^ (hash >>> 16)) >>> 0;
	// 0x45d9f3b：公开流传的 32-bit 整数雪崩终混常数（见 C-029 决策记录），
	// 乘法扩散后再次异或右移，使低位获得充分混合；必须用 Math.imul——普通
	// 乘法的乘积（最大约 5×10^18）超出 double 精确整数上限 2^53，低 32 位
	// 会丢失精度。
	hash = Math.imul(hash, 0x45d9f3b) >>> 0;
	hash = (hash ^ (hash >>> 16)) >>> 0;
	return 30 + (hash % 291);
}

const WORKSPACE_HUE_ANCHORS = [55, 100, 145, 190, 235, 280, 325];

/**
 * 同屏工作区色相消解（R-01-003/AC-08、AC-12）：身份去重排序后，以稳定基色
 * 确定七个 OKLCH 感知锚点的起始槽；撞槽时按步进 3 跨色区探测。超过七个
 * 工作区后选择当前使用次数最少的槽，使复用均衡且确定。
 */
export function resolveWorkspaceHues(keys) {
	const identities = [...new Set((Array.isArray(keys) ? keys : []).map(cleanText).filter(Boolean))].sort();
	const uses = WORKSPACE_HUE_ANCHORS.map(() => 0);
	const resolved = new Map();
	for (const identity of identities) {
		const start = (workspaceHue(identity) - 30) % WORKSPACE_HUE_ANCHORS.length;
		let chosen = start;
		for (let offset = 0; offset < WORKSPACE_HUE_ANCHORS.length; offset += 1) {
			const candidate = (start + offset * 3) % WORKSPACE_HUE_ANCHORS.length;
			if (uses[candidate] < uses[chosen]) chosen = candidate;
			if (uses[candidate] === 0) {
				chosen = candidate;
				break;
			}
		}
		uses[chosen] += 1;
		resolved.set(identity, WORKSPACE_HUE_ANCHORS[chosen]);
	}
	return resolved;
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
 *   { id, parentId?, depth, kind: 'running'|'awaiting'|'subagent', title, workspaceTitle, workspaceKey,
 *     isCurrent, pendingText?, descendantActive? }
 * kind 规则：
 *   - 主会话 running（且无 pending）或处于委托周期（含后代耗尽空窗）→ 'running'
 *   - 主会话 pendingInteraction / completed / errorReminder → 'awaiting'（等待用户行动）
 *   - 子代理 running / pending 或存在活动后代 → 'subagent'，自身与后代均不活动则不显示
 * completions（完成确认与错误提醒，R-01-002/AC-05、AC-13、R-01-010/AC-06）：Map id →
 * { lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }，由渲染层从宿主侧 ack 状态
 * 通道注入；其中完成提醒成立（completionReminder）或错误提醒成立（errorReminder）的
 * 主会话按 awaiting 保留在活动区。delegatingIds（委托周期集合，渲染层由 progressAnchor
 * 记账派生）：集合内会话视同处于委托周期——后代耗尽至 settle 处理回合启动的
 * 空窗内仍保持运行呈现、完成/错误提醒不生效；条目的 descendantActive 字段
 * 始终为当帧原始后代活性（供进度锚点记账判定耗尽），不受 delegatingIds 影响。
 */
export function buildEntries(snapshot, workspaceItems, detailsById = {}, completions = null, delegatingIds = null) {
	const byId = isRecord(snapshot) && isRecord(snapshot.byId) ? snapshot.byId : {};
	const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : [];
	const current = snapshot?.current ?? null;
	const subagentsByParent = isRecord(snapshot?.subagentsByParent)
		? snapshot.subagentsByParent
		: {};
	const rank = workspaceRank(workspaceItems ?? []);
	const descendantIds = descendantActiveIds(byId);
	// 第一遍：层级关系 + 显示判定（show = 自身活动 || 委托周期 || 完成提醒，单点实现避免漂移）。
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
		// 完成确认（R-01-002/AC-03、AC-05、R-01-010/AC-06）：未确认的完成提醒按自身活动计入。
		const done = completionReminder(row, completionFor(id, completions), isSub);
		// 错误提醒（R-01-002/AC-13，C-043）：最近回合以错误结束的按自身活动计入。
		const err = errorReminder(row, completionFor(id, completions), isSub);
		// 子代理完成且没有活动后代时消失；主会话完成后保留为"等待打开"；母会话在委托周期保持运行呈现（R-01-003/AC-05）。
		const selfActive = isOwnActiveRow(row, byId);
		const descendantActive = descendantIds.has(String(id));
		const delegating = descendantActive || (delegatingIds instanceof Set && delegatingIds.has(String(id)));
		const show = selfActive || delegating || done || err;
		meta.set(id, { row, running, pending, isSub, show, done, err, descendantActive, delegating, depth: 0 });
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
			const workspace = m.isSub
				? { title: "", key: "" }
				: workspaceInfoForSession(id, workspaceItems ?? [], byId);
			// 完成确认判定单点（R-01-002，C-040、C-064）：pendingText/waitClass/noteText/questionPreview 共用；
			// 错误提醒（C-043）优先于完成提醒（同一回合登记只能有一个 lastTurnEndKind）。
			const doneWait = !m.pending && m.done && !m.running && !m.delegating;
			const errWait = !m.pending && m.err && !m.running && !m.delegating;
			const errorNote = entryErrorNote(completionFor(id, completions));
			const questionPreview =
				m.pending && m.row.pendingInteraction === "question" ? timelineQuestionPreview(timeline) : undefined;
			entries.push({
				id,
				parentId: m.isSub ? String(parentId) : null,
				depth,
				kind: m.isSub
					? "subagent"
					: m.pending
						? "awaiting"
						: m.running || m.delegating
							? "running"
							: "awaiting",
				descendantActive: m.descendantActive,
				title: m.isSub
					? subagentTitle(parentId, id, byId, subagentsByParent)
					: mainTitle(byId, id),
				workspaceTitle: workspace.title,
				workspaceKey: workspace.key,
				model: metadata.model ?? "",
				reasoning: metadata.reasoning ?? "",
				timeline: timeline ?? [],
				userPreview: previews.userPreview ?? "",
				agentPreview: previews.agentPreview ?? "",
				isCurrent: current !== null && String(current) === String(id),
				// 完成提醒卡不显示类型徽标（C-040）：pendingText 仅为阻塞等待承载。
				pendingText: m.pending ? pendingText(m.row.pendingInteraction) : undefined,
				// 等待三类（R-01-002，C-043）：blocked=阻塞等待（金色）、error=错误提醒（红色）、
				// done=完成提醒（绿色）；错误提醒优先于完成提醒（同一登记只有一个结束原因）。
				waitClass: m.pending
					? "blocked"
					: errWait
						? "error"
						: doneWait
							? "done"
							: undefined,
				pendingKind: m.pending ? m.row.pendingInteraction : undefined,
				noteText: m.pending
					? awaitNoteText("blocked", m.row.pendingInteraction)
					: errWait
						? errorNote
						: doneWait
							? ROUND_DONE_NOTE
							: undefined,
				questionPreview: m.pending && m.row.pendingInteraction === "question" ? (questionPreview ?? null) : undefined,
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
		if (entry.kind !== "subagent") continue;
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
			entry.workspaceKey ?? "",
			entry.model ?? "",
			entry.reasoning ?? "",
			entry.timeline ?? null,
			entry.userPreview ?? "",
			entry.agentPreview ?? "",
			entry.isCurrent,
			entry.pendingText ?? null,
			entry.waitClass ?? null,
			entry.noteText ?? null,
			entry.questionPreview ?? null,
			entry.activityAt ?? null,
			entry.progress ?? null,
			entry.loadingModel ?? null,
			entry.loadingTimeline ?? null,
			entry.loadingPreviews ?? null,
			entry.tokenStats ?? [entry.outputTokens ?? null, entry.inputTokens ?? null, entry.cacheHitPct ?? null, entry.rateTokS ?? null, entry.elapsedMs ?? null],
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

/** 会话行是否满足自身状态的活动判定，不含后代活动继承。
 *  完成提醒（未确认完成）的显示与否不在此判定：由 buildEntries 经 completionReminder
 *  单点派生（C-030 唯一口径，不消费宿主 completed 边沿标志）。 */
function isOwnActiveRow(row, byId = {}) {
	if (!isRecord(row)) return false;
	const running = row.running === true;
	const pending = row.pendingInteraction !== undefined;
	if (isSubagentRow(row, byId)) return running || pending;
	return running || pending;
}

/** 沿自身活动会话的有效 parentId 链上溯收集会话 id：includeSelf 含活动会话自身，
 *  否则只收祖先（存在活动后代的母会话）。活动区与历史区显示判定的单点实现。 */
function lineageActiveIds(byId, includeSelf) {
	const ids = new Set();
	for (const [id, row] of Object.entries(byId)) {
		if (!isOwnActiveRow(row, byId)) continue;
		const seen = new Set();
		let currentId = includeSelf ? id : row?.parentId;
		while (currentId !== undefined && currentId !== null && isRecord(byId[currentId]) && !seen.has(String(currentId))) {
			seen.add(String(currentId));
			ids.add(String(currentId));
			currentId = byId[currentId]?.parentId;
		}
	}
	return ids;
}

/** 沿活动会话的有效 parentId 链补齐活动祖先（含活动会话自身），供历史区显示判定。 */
export function activeSessionIds(byId = {}) {
	return lineageActiveIds(byId, true);
}

/** 「存在活动后代」的母会话集合（不含活动会话自身），供 buildEntries 判定委托周期（R-01-003/AC-05）。 */
function descendantActiveIds(byId = {}) {
	return lineageActiveIds(byId, false);
}

/** 判断活动条目是否需要建立轮内状态订阅：以宿主 running 为准、与呈现 kind 解耦——
 *  委托周期中保持运行呈现的母会话不建立订阅（R-02-004/AC-01）。 */
export function shouldSubscribeToSession(entry, byId = {}) {
	return entry?.id != null && byId?.[entry.id]?.running === true;
}

/** 会话行是否满足活动区显示判定（自身活动或存在活动后代）。 */
export function isActiveRow(row, byId = {}, activeIds = null) {
	if (isOwnActiveRow(row, byId)) return true;
	return activeIds instanceof Set && row?.id != null && activeIds.has(String(row.id));
}

/** 取某会话的完成确认记账（R-01-002/AC-03）：completions 为 Map id → { lastTurnEnd, ackedAt }，
 *  恒为普通对象或 null；不抛错、不信任入参形状。 */
function completionFor(id, completions) {
	if (!(completions instanceof Map)) return null;
	return isRecord(completions.get(String(id))) ? completions.get(String(id)) : null;
}

/**
 * 完成确认判定（R-01-002/AC-03、AC-05、R-01-010/AC-06）：会话存在 `lastTurnEnd > ackedAt`
 * 的未确认完成时成立——解除仅经显式确认（ackedAt 前移）或新回合完成（lastTurnEnd 前移，
 * 旧提醒被新回合更替）；打开会话、切换当前会话与页面刷新均不解除。仅主会话参与；
 * 成立与否只依赖宿主持久状态，不依赖客户端在线观测。running/阻塞等待/委托周期的
 * 呈现抑制由调用方（buildEntries 的 doneWait）处理。
 */
export function completionReminder(row, completion, isSub = false) {
	if (isSub || !isRecord(row)) return false;
	const record = isRecord(completion) ? completion : null;
	const lastTurnEnd = record === null ? null : Number(record.lastTurnEnd);
	const ackedAt = record === null ? null : Number(record.ackedAt);
	if (!Number.isFinite(lastTurnEnd)) return false; // 无 turn/end 登记即无提醒（升级不回溯补发）
	if (!Number.isFinite(ackedAt)) return true;
	return lastTurnEnd > ackedAt;
}

/**
 * 错误提醒判定（R-01-002/AC-13，C-043）：主会话最近一个回合以不可恢复错误结束
 * （宿主登记的 `lastTurnEndKind === 'error'`）时成立——随新回合结束（kind 被新 reason
 * 覆盖）解除；不消费 ack 游标、无确认按钮；成立与否只依赖宿主持久状态，刷新/重连恢复。
 * running/阻塞等待/委托周期的呈现抑制由调用方（buildEntries 的 waitClass 判定）处理。
 */
export function errorReminder(row, completion, isSub = false) {
	if (isSub || !isRecord(row)) return false;
	const record = isRecord(completion) ? completion : null;
	return record !== null && record.lastTurnEndKind === "error";
}

/** 错误提醒正文（R-01-002/AC-09、AC-13，C-043）：宿主登记的 lastTurnEndError（截断后
 *  的错误信息）或回落固定文案；不冒充具体错误。调用方（buildEntries 的 errWait 判定）
 *  已保证错误提醒成立，本函数只做文本取舍。 */
function entryErrorNote(completion) {
	const record = isRecord(completion) ? completion : null;
	const message = record?.lastTurnEndError;
	return typeof message === "string" && message !== "" ? message : ERROR_NOTE_FALLBACK;
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
 * 历史区→活动区迁移检测（R-01-010/AC-07）：上一帧历史区 id 在本帧离开历史区且出现于
 * 活动区即判定为一次反向迁移；彻底消失（归档、滑出历史窗口）不判定。prevRecentIds 为上一帧
 * 已渲染的历史区 id 集合，active/recent 为本帧派生条目。与 movedToRecentIds 镜像对称。
 */
export function movedToActiveIds(prevRecentIds, active, recent) {
	if (!(prevRecentIds instanceof Set)) return [];
	const activeIds = new Set((Array.isArray(active) ? active : []).map((entry) => String(entry?.id)));
	const recentIds = new Set((Array.isArray(recent) ? recent : []).map((entry) => String(entry?.id)));
	const moved = [];
	for (const id of prevRecentIds) {
		if (!recentIds.has(id) && activeIds.has(id)) moved.push(id);
	}
	return moved;
}

/** 从 history 事件提取最后回合结束时刻（最后一条 `turn/end` 的有效 time）：
 *  尾部反向扫描，`time` 非有限值的 `turn/end` 跳过继续向前；全部无有效时刻返回 null（R-01-010/AC-08）。 */
export function lastTurnEndFromEvents(events) {
	const list = Array.isArray(events) ? events : [];
	for (let i = list.length - 1; i >= 0; i -= 1) {
		const event = list[i]?.event;
		if (event?.type !== "turn/end") continue;
		const time = Number(event.time);
		if (Number.isFinite(time)) return time;
	}
	return null;
}

/** 从 ConversationSnapshot.turnTimings 提取最大 endTime；全部回合未结束或无回合返回 null。 */
export function lastTurnEndFromTimings(turnTimings) {
	if (!(turnTimings instanceof Map)) return null;
	let last = null;
	for (const timing of turnTimings.values()) {
		const end = Number(timing?.endTime);
		if (Number.isFinite(end) && (last === null || end > last)) last = end;
	}
	return last;
}

/**
 * 构建最近历史区条目：当前非活动、且在历史窗口内最后一次活动过的**主会话**
 * （子代理是临时工作单元，不入最近历史；故需同时排除表白会话与已结束子代理），
 * 按最后活动时间从新到旧，最多 HISTORY_MAX 条。blank 会话不出现（从未用过）；
 * 归档会话不出现——原生 runtime 会立即清空对归档会话的选中，列出它只会得到
 * 一张点了回落到新会话界面的死卡。完成确认中的会话留在活动区，不入历史区；
 * 委托周期（含耗尽空窗）中的会话同样留在活动区（delegatingIds，分区不变量）。
 * 窗口候选判定用宿主列表时间（下界）；turnEnds（id → 已知回合结束时刻）驱动
 * 时间精化：条目 activityAt 取宿主列表时间与回合结束时刻的较新者（R-01-010/AC-08、AC-09）。
 */
export function buildRecent(snapshot, workspaceItems, now, windowMs = HISTORY_WINDOW_MS, detailsById = {}, archivedIds = [], completions = null, delegatingIds = null, turnEnds = null) {
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
		if (isSubagentRow(row, byId)) continue; // 子代理（含已结束）不入最近历史；也无完成提醒语义
		if (completionReminder(row, completionFor(id, completions), false)) continue; // 完成确认中，留在活动区
		if (errorReminder(row, completionFor(id, completions), false)) continue; // 错误提醒中，留在活动区
		if (delegatingIds instanceof Set && delegatingIds.has(String(id))) continue; // 委托周期中（含耗尽空窗），留在活动区
		if (isActiveRow(row, byId, activeIds)) continue;
		const updatedAt = Number(row.updatedAt);
		if (!Number.isFinite(updatedAt)) continue;
		if (updatedAt > now || now - updatedAt > windowMs) continue;
		const turnEnd = Number(mapValue(turnEnds, id));
		const activityAt = Number.isFinite(turnEnd) ? Math.max(updatedAt, turnEnd) : updatedAt;
		const details = mapValue(detailsById, id) ?? {};
		const metadata = details.model ?? modelMetadata(details.models ?? row.models);
		// previews 不在此推导：渲染层按需 memo 计算（冷会话由 history 一次性写入 detail.previews）。
		const previews = details.previews ?? { userPreview: "", agentPreview: "" };
		const workspace = workspaceInfoForSession(id, items, byId);
		entries.push({
			id,
			kind: "recent",
			depth: 0,
			title: mainTitle(byId, id),
			workspaceTitle: workspace.title,
			workspaceKey: workspace.key,
			model: metadata.model ?? "",
			reasoning: metadata.reasoning ?? "",
			userPreview: previews.userPreview ?? "",
			agentPreview: previews.agentPreview ?? "",
			isCurrent: current !== null && String(current) === String(id),
			activityAt,
		});
	}

	entries.sort((a, b) => b.activityAt - a.activityAt);
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
/** token 计数紧凑缩写，镜像原生统计行 formatTokens：847 / 12.2K / 517K / 2.8M——
 *  千以下原样；K/M 档缩写值百位以上取整、不足百位保留一位小数；非法输入返回 null 不展示。 */
export function fmtTokens(n) {
	if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
	const scaled = (v) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
	if (n < 1e3) return String(n);
	if (n < 1e6) return `${scaled(n / 1e3)}K`;
	return `${scaled(n / 1e6)}M`;
}

/** 回合进度半衰期校准参数（R-01-009/AC-06，C-025、C-044）：基准速率 90 tok/s 对应
 *  基准半衰期 120s；慢模型按比例拉长、快模型缩短，夹取于 [60, 600] 秒。 */
export const PROGRESS_HALFLIFE_REF_RATE = 90;
export const PROGRESS_HALFLIFE_BASE_S = 120;
/** 无可用速率保守起步半衰期（C-044）：东家实测供应商最低速率 20 tok/s 对应的
 *  120×90÷20=540s——新会话起步期进度慢爬，速率实测后由最新值无缝接续校准。 */
export const PROGRESS_HALFLIFE_DEFAULT_S = 540;
export const PROGRESS_HALFLIFE_MIN_S = 60;
export const PROGRESS_HALFLIFE_MAX_S = 600;

/**
 * 回合进度半衰期速率校准（R-01-009/AC-06，C-025、C-044）：任务产出 token 量与模型速度
 * 无关、回合墙钟时长与速率成反比，故 k = 120×90÷r 秒并夹取 [60, 600]（r 为会话
 * 实测累计输出速率 tok/s）；无可用速率（缺省/非法/非正）回退保守默认 540s
 * （20 tok/s 起步基准，C-044）。返回整数秒。
 */
export function progressHalfLifeSec({ rateTokS = null } = {}) {
	if (!Number.isFinite(rateTokS) || rateTokS <= 0) return PROGRESS_HALFLIFE_DEFAULT_S;
	const k = Math.round((PROGRESS_HALFLIFE_BASE_S * PROGRESS_HALFLIFE_REF_RATE) / rateTokS);
	return Math.min(PROGRESS_HALFLIFE_MAX_S, Math.max(PROGRESS_HALFLIFE_MIN_S, k));
}

/**
 * 回合进度估计（0–100）：纯时间驱动，y = t/(t+k)（t 为本回合已耗秒数、k 为半衰期
 * 秒数）。过原点、先快后慢、渐近 100 永不到达；不区分 think/stream/tool 阶段，固定
 * k 下单调不减。半衰期按该会话最新实测输出速率现算（progressHalfLifeSec，C-044）——
 * 每次更新用最新累计平均速率重新校准，进度作为对完成度的实时估计允许随速率回落而
 * 回退（同回合单调承诺已撤销）。非法/缺失已耗时归一为 0；非法/缺失半衰期回退保守
 * 默认 540s。
 */
export function progressOf({ elapsedMs = 0, halfLifeSec = null } = {}) {
	const sec =
		Math.max(
			0,
			(Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0) / 1000,
		);
	const k = Number.isFinite(halfLifeSec) && halfLifeSec > 0 ? halfLifeSec : PROGRESS_HALFLIFE_DEFAULT_S;
	return Math.round((100 * sec) / (sec + k) * 10) / 10;
}

/** 委托耗尽归属宽限（R-01-009/AC-06）：后代全部结束后、在该毫秒数内开始的新回合
 *  视为处理后代结果的回合（委托周期锚点连续）；超时开始的新回合视为委托周期外的
 *  全新回合（归零重计）。 */
export const SETTLE_TURN_GRACE_MS = 60_000;

/**
 * 委托周期进度锚点（R-01-009/AC-06）：三态状态机。
 *   - idle：无活动后代且无开放回合，锚点为空。
 *   - turn：无活动后代、自身回合在飞；锚点 = 本回合起点，新回合开始即归零重计。
 *   - delegating：委托周期——自首个活动后代出现起，至后代全部结束且处理其结果的
 *     回合完成止；锚点在周期内连续，不随自身回合结束或新回合开始而归零；进入周期
 *     时取最近已知回合起点，无已知起点时以进入周期时刻（now）为起点。后代耗尽且
 *     无开放回合时记 drainedAt；耗尽后 SETTLE_TURN_GRACE_MS 内开始的新回合归属本
 *     周期（锚点连续），超时开始的新回合归零重计并退出周期。
 * 本状态机只管锚点记账、不承载半衰期（C-044）：进度 k 由渲染层每帧按最新实测输出
 * 速率现算（progressHalfLifeSec），不随锚点捕获冻结、允许进度随速率回落而回退。
 * prev 为上一帧状态（null 视同 idle）；返回新状态对象，渲染层按会话 id 记账。
 */
export function progressAnchor(prev, { descendantActive = false, hostStartTime = null, now = null } = {}) {
	const hs = Number.isFinite(hostStartTime) ? hostStartTime : null;
	const da = descendantActive === true;
	const mode = prev?.mode === "turn" || prev?.mode === "delegating" ? prev.mode : "idle";
	if (da) {
		if (mode === "delegating") {
			const turnStart = hs !== null && hs !== prev.turnStart ? hs : prev.turnStart;
			if (turnStart === prev.turnStart && prev.drainedAt == null) return prev;
			return { mode: "delegating", anchor: prev.anchor, turnStart, drainedAt: null };
		}
		const anchor = hs ?? (mode === "turn" ? prev.anchor : Number.isFinite(now) ? now : 0);
		return {
			mode: "delegating",
			anchor,
			turnStart: hs ?? (mode === "turn" ? prev.turnStart : null),
			drainedAt: null,
		};
	}
	if (hs === null) {
		if (mode !== "delegating") return { mode: "idle", anchor: null, turnStart: null, drainedAt: null };
		if (prev.drainedAt != null) return prev;
		return { ...prev, drainedAt: Number.isFinite(now) ? now : 0 };
	}
	if (mode === "delegating") {
		if (hs === prev.turnStart) return { mode: "turn", anchor: prev.anchor, turnStart: hs, drainedAt: null };
		const withinGrace = prev.drainedAt != null && hs - prev.drainedAt <= SETTLE_TURN_GRACE_MS;
		return withinGrace
			? { mode: "turn", anchor: prev.anchor, turnStart: hs, drainedAt: null }
			: { mode: "turn", anchor: hs, turnStart: hs, drainedAt: null };
	}
	if (mode === "turn" && hs === prev.turnStart) return prev;
	return { mode: "turn", anchor: hs, turnStart: hs, drainedAt: null };
}

/** 会话是否处于委托周期（含后代耗尽空窗）：delegating 态且未耗尽，或耗尽时刻距
 *  now 不超过 SETTLE_TURN_GRACE_MS（空窗内等待 settle 处理回合启动）。供渲染层
 *  派生 delegatingIds 注入 buildEntries/buildRecent（R-01-003/AC-05、R-01-009/AC-06）。 */
export function delegationActive(state, now) {
	if (state?.mode !== "delegating") return false;
	if (state.drainedAt == null) return true;
	return Number.isFinite(now) && now - state.drainedAt <= SETTLE_TURN_GRACE_MS;
}
