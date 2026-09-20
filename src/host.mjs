// dsh-activity-pane 宿主侧：完成确认与错误提醒状态（R-01-002/AC-03、AC-05、AC-10～AC-13、R-01-010/AC-06，C-030、C-043），
// 以及会话累计运行时长记账（R-01-020，C-074）。
//
// 职责：
//   1. 订阅 `session/event` 的 `turn/end`，把事件顶层 `time` 登记为会话的 `lastTurnEnd`，
//      并登记回合结束原因 `lastTurnEndKind`（取 `data.reason.kind`，缺失/非法归一
//      `'unknown'`）与 error 回合的错误信息 `lastTurnEndError`（截断至 ERROR_NOTE_MAX）；
//   2. `POST /dsh-activity-pane/api/ack` 写回 `ackedAt`；
//   3. `GET /dsh-activity-pane/api/acks` 全量快照；`GET /dsh-activity-pane/api/acks/stream` SSE 推送
//      （连接即发全量、变更即广播）。
//   4. 订阅 `session/event` 按回合与等待边界（`approval/asked`–`decided`、`ask_user_question`
//      的 `tool/call`–`tool/result`）配对累计每会话运行过程时长（R-01-020）：
//      持久化于独立 domain 表 `turn_stats`（`{ busyMs, openTurnStart, openWaitStart,
//      openWaitKind, openWaitId, waitedMs, watermarkSeq }`），无记录/水位缺口/水位超前会话经
//      `sessionQuery.listEvents` 懒回填（统一 reconcileTurnStats 收敛，启动扫描强制结算
//      残留开放回合），经 `GET /api/busy` 全量快照与 `/busy/stream` SSE 只读下发，无写回路径。
//   5. 后台任务输出镜像（R-01-024）：同一事件流中 `job_output` 的 `tool/call`（经
//      `arguments.job_id` 建 callId → jobId 映射）与配对 `tool/result`（模型收到的定案
//      文本）登记进每会话内存环形缓冲（200 条）；`GET /api/jobs-output` 以会话事件日志
//      重放（持久种子）与内存镜像按 seq 去重合并回放 `{ text, truncated, read }`；
//      `GET /api/jobs/stream` SSE 广播 `{ sessionId, jobId }` 轨迹通知；不消费模型的
//      `job_output` 读取游标，零 DSH 写入。
//
// 持久化：storageDomain 声明式 domain 表 `acks`（sessionId → { lastTurnEnd, lastTurnEndKind,
// lastTurnEndError, ackedAt }）与 `dsh_activity_pane_turns` 表 `turn_stats`（sessionId →
// { busyMs, openTurnStart, watermarkSeq }）——domain 无迁移机制（version 不同在 open 时
// 拒绝），新增表必须落在新 domain，不动既有 acks domain。
// 设计约束（C-030）：不写会话日志、不依赖 sessionProjections、不引入客户端轮询；
// 完成提醒成立 = 主会话 && 非 running && 无阻塞等待 && 非委托周期 && lastTurnEnd > ackedAt，
// 错误提醒成立 = 主会话 && 非 running && 无阻塞等待 && 非委托周期 && lastTurnEndKind === 'error'
// （不消费 ack 游标，C-043），判定在客户端纯函数完成，本侧只维护持久事实与广播。

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { applyTurnEventToStats, createSessionEventSerializer, isBusyBoundaryEvent, jobOutputFromTraces, jobOutputTraces, reconcileTurnStats, turnStatsEqual, turnStatsFrom, truncateErrorNote } from './core.mjs'

export const name = 'dsh-activity-pane'
export const inject = ['storageDomain', 'webServer', 'sessionQuery', 'connection']

const API_PATH = '/dsh-activity-pane/api'

/** 每会话完成/错误登记：lastTurnEnd 最后回合结束时刻（事件 time，毫秒）、
 *  lastTurnEndKind 回合结束原因（completed/blocked/max-tokens/aborted/error/unknown）、
 *  lastTurnEndError error 回合的错误信息（截断，非 error 回合为 null）、ackedAt 确认时刻。
 *  字段全部可选/可空：容纳升级前仅含 { lastTurnEnd, ackedAt } 的旧记录——
 *  dsh-storage-domain 打开时对每条记录做 valueSchema.parse，缺失必填键会以 invalid-record
 *  使整个 domain 打开失败、登记与确认写回永久挂起（C-043 Spec 轴审核发现）；写入侧恒写全字段。 */
const ackRecord = z.object({
	lastTurnEnd: z.number().nullable().optional(),
	lastTurnEndKind: z.string().nullable().optional(),
	lastTurnEndError: z.string().nullable().optional(),
	ackedAt: z.number().nullable().optional(),
})

const domainSpec = defineDomain({
	name: 'dsh_activity_pane',
	version: 1,
	global: { schema: z.object({}), initial: {} },
	tables: {
		acks: domainTable(ackRecord),
	},
})

/** 每会话累计运行时长记账（R-01-020）：busyMs 运行过程时长累计（null=尚无有效计时）、
 *  openTurnStart 当前开放回合起点（无开放回合为 null）、openWaitStart/openWaitKind 当前
 *  未配对等待区间（回合内阻塞等待：approval/question）、waitedMs 本回合已配对等待时长
 *  累计、watermarkSeq 实时登记已覆盖的最大事件 seq（回填与实时登记以水位衔接，seq ≤
 *  watermark 的事件不重复应用）、watermarkTime 水位处事件的时刻（实时登记据此识别 seq
 *  空间重编：低 seq 事件携带比水位更新的时刻，增量口径失效，须全量重放）。全部字段
 *  可选/可空。 */
const turnStatRecord = z.object({
	busyMs: z.number().nullable().optional(),
	openTurnStart: z.number().nullable().optional(),
	openWaitStart: z.number().nullable().optional(),
	openWaitKind: z.string().nullable().optional(),
	openWaitId: z.string().nullable().optional(),
	waitedMs: z.number().nullable().optional(),
	watermarkSeq: z.number().nullable().optional(),
	watermarkTime: z.number().nullable().optional(),
})

/** 独立 domain：dsh-storage-domain 无迁移机制（version 不同在 open 时拒绝），新增表落新 domain，
 *  不动既有 acks domain 的 version 1 medium（C-074）。 */
const turnDomainSpec = defineDomain({
	name: 'dsh_activity_pane_turns',
	version: 1,
	global: { schema: z.object({}), initial: {} },
	tables: {
		turn_stats: domainTable(turnStatRecord),
	},
})

/** 从请求流读取 JSON body；空 body 返回 null。 */
function readJsonBody(req) {
	return new Promise((resolve) => {
		const chunks = []
		req.on('data', (chunk) => chunks.push(chunk))
		req.on('end', () => {
			if (chunks.length === 0) return resolve(null)
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
			} catch {
				resolve(null)
			}
		})
		req.on('error', () => resolve(null))
	})
}

export function apply(ctx) {
	// domain 就绪 Promise：路由与事件登记都先等它（storageDomain.open 是异步的）。
	let resolveDomain = null
	const domainReady = new Promise((resolve) => {
		resolveDomain = resolve
	})
	let acks = null // KvTable: sessionId -> { lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }
	let turnStats = null // KvTable: sessionId -> { busyMs, openTurnStart, watermarkSeq }
	/** SSE 连接集合：广播时逐个写 `event: state`。 */
	const streamClients = new Set()
	const busyStreamClients = new Set()
	const jobStreamClients = new Set()
	/** 懒回填单飞：每会话至多一个在途回填，重复触发共享同一 promise（R-01-020/AC-05）。 */
	const backfills = new Map()

	ctx.inject(['storageDomain'], async (domainCtx) => {
		const domain = await domainCtx.storageDomain.open(domainSpec)
		const turnDomain = await domainCtx.storageDomain.open(turnDomainSpec)
		ctx.effect(() => () => domain.close(), 'dsh-activity-pane: domainClose')
		ctx.effect(() => () => turnDomain.close(), 'dsh-activity-pane: turnDomainClose')
		acks = domain.table('acks')
		turnStats = turnDomain.table('turn_stats')
		resolveDomain()
		// 启动扫描（R-01-020/AC-04）：宿主重启后不存在仍在运行的回合——残留开放回合的
		// 记账按日志最后事件时刻强制结算关闭，否则总耗时按 now − openTurnStart 无限增长。
		// 无 watermarkTime 的存量记录（本字段引入前写入）强制全量重放复核一次——无论重编
		// 后日志 seq 是否已超越旧水位（部分重叠重编）都能收敛，重写后带上该字段、不再
		// 重复扫描；此后重编由实时登记的重编检测承接。
		for (const [id, record] of turnStats.entries()) {
			const closeOpenTurn = record?.openTurnStart != null
			const legacy = record?.watermarkTime == null
			if (closeOpenTurn || legacy) ensureTurnStatsFresh(id, { closeOpenTurn, forceFresh: legacy })
		}
	})

	/** 全量 busy 快照：{ [sessionId]: { busyMs, openTurnStart, waitedMs, openWaitStart } }
	 *  （水位与等待种类为宿主内部记账，不下发）。 */
	function busySnapshot() {
		const out = {}
		if (turnStats === null) return out
		for (const [id, record] of turnStats.entries()) {
			out[id] = {
				busyMs: record?.busyMs ?? null,
				openTurnStart: record?.openTurnStart ?? null,
				waitedMs: record?.waitedMs ?? null,
				openWaitStart: record?.openWaitStart ?? null,
			}
		}
		return out
	}

	/** 向全部 busy SSE 连接广播当前全量状态。 */
	function broadcastBusy() {
		const data = `event: state\ndata: ${JSON.stringify(busySnapshot())}\n\n`
		for (const res of busyStreamClients) {
			try {
				res.write(data)
			} catch {
				busyStreamClients.delete(res)
			}
		}
	}

	/** 懒回填（R-01-020/AC-05，C-074）：经 sessionQuery.listEvents 读取会话事件，统一经
	 *  reconcileTurnStats 收敛——无记录、水位非法或水位超前于日志最大 seq（事件 seq 空间
	 *  被重编，如 dsh 0.1.5 V3 迁移）的会话自空状态全量重放；已有记录会话仅增量应用
	 *  seq > watermarkSeq 的事件（宿主离线期间经其它入口发生的回合），以水位衔接保证
	 *  不重复、不遗漏。forceFresh：调用侧已证实水位口径失效（实时登记识别出 seq 空间
	 *  重编，或存量记录尚未携带 watermarkTime）时丢弃已有记账、强制从空状态全量重放；
	 *  在途回填不得吞掉该选项——命中时在其完成后补一次强制重放。closeOpenTurn（启动
	 *  扫描）：重放后仍开放的回合按日志最后事件时刻强制结算。读取失败保留已有记账，
	 * 随下次请求重试；会话不存在/已删除时静默跳过。 */
	function ensureTurnStatsFresh(id, { closeOpenTurn = false, forceFresh = false } = {}) {
		if (backfills.has(id)) {
			const inflight = backfills.get(id)
			if (!forceFresh) return inflight
			return inflight.then(() => ensureTurnStatsFresh(id, { closeOpenTurn, forceFresh: true }))
		}
		const promise = new Promise((resolve) => {
			ctx.inject(['sessionQuery'], (sessionQuery) => {
				resolve(sessionQuery)
			})
		}).then(async (sessionQuery) => {
			try {
				await domainReady
				const current = forceFresh ? null : turnStats.get(id) ?? null
				const records = await sessionQuery.listEvents(id)
				const next = reconcileTurnStats(current, Array.isArray(records) ? records : [], { closeOpenTurn })
				const changed =
					forceFresh ||
					current === null ||
					next.watermarkSeq !== (current.watermarkSeq ?? null) ||
					!turnStatsEqual(next, current)
				if (changed) {
					await turnStats.put(id, { ...turnStatsFrom(next), watermarkSeq: next.watermarkSeq, watermarkTime: next.watermarkTime })
					broadcastBusy()
				}
			} catch (error) {
				ctx.logger?.warn?.(`dsh-activity-pane: busy 回填失败（${id}）: ${String(error)}`)
			} finally {
				backfills.delete(id)
			}
		})
		backfills.set(id, promise)
		return promise
	}

	/** 全量快照：{ [sessionId]: { lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt } }。
 *  acks 未就绪时返回空对象。旧记录缺新字段时按 null/undefined 下发（客户端判定恒安全）。 */
	function snapshot() {
		const out = {}
		if (acks === null) return out
		for (const [id, record] of acks.entries()) out[id] = record
		return out
	}

	/** 向全部 SSE 连接广播当前全量状态；写失败（连接已断）的连接直接移除。 */
	function broadcast() {
		const data = `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`
		for (const res of streamClients) {
			try {
				res.write(data)
			} catch {
				streamClients.delete(res)
			}
		}
	}

	// turn/end 登记（R-01-002/AC-03、AC-11～AC-13、C-043）：事件按会话序提交，get+put 无竞态；
	// 保留既有 ackedAt（回合更替不清确认游标），lastTurnEnd 前移即让旧提醒失效、新提醒成立；
	// 同回合登记结束原因与错误信息（错误提醒的持久事实来源）。
	ctx.on('session/event', async (session, event) => {
		if (event?.type !== 'turn/end') return
		const time = Number(event.time)
		if (!Number.isFinite(time)) return
		const id = String(session?.id ?? '')
		if (id === '') return
		try {
			await domainReady
			const reason = event.data && typeof event.data === 'object' && event.data.reason && typeof event.data.reason === 'object'
				? event.data.reason
				: null
			const kind = typeof reason?.kind === 'string' ? reason.kind : 'unknown'
			// 错误信息契约仅为字符串（agent-loop 的 LlmError failure.message）；非字符串不展示，
			// 避免界面出现 "[object Object]"（C-043 复审收紧）。
			const errorMessage = kind === 'error' && typeof reason?.error?.message === 'string' ? reason.error.message : ''
			const current = acks.get(id)
			await acks.put(id, {
				lastTurnEnd: time,
				lastTurnEndKind: kind,
				lastTurnEndError: kind === 'error' && errorMessage !== '' ? truncateErrorNote(errorMessage) : null,
				ackedAt: current?.ackedAt ?? null,
			})
			broadcast()
		} catch (error) {
			ctx.logger?.warn?.(`dsh-activity-pane: turn/end 登记失败（${id}）: ${String(error)}`)
		}
	})

	// 累计运行时长实时登记（R-01-020/AC-02、AC-04、AC-05、AC-07，C-074）：turn/start–turn/end
	// 配对记账，回合内阻塞等待经 approval/asked–decided 与 ask_user_question 的 tool/call–
	// tool/result 配对扣除；completed/blocked/max-tokens/aborted/error 全部结束原因均计入；
	// 事件按会话序提交，seq ≤ watermark 的事件幂等跳过；无效果的边界事件（如非提问工具的
	// tool/call）不落盘、不广播；主/子统一登记，过滤由客户端判定。
	// 表内无记录的会话先懒回填存量回合再应用实时事件——否则首个实时事件会以 null 建立记录、
	// 存量回合永远失去补齐机会。
	// 读-改-写经 createSessionEventSerializer 按会话串行（put 先落盘后更新内存，并发
	// 读-改-写会丢先到事件效果，机制见 core.mjs 同名 JSDoc）；注册同步进行保持派发序，
	// run 内 catch-all 保证链不因单事件失败中断。
	const serializeBusyEvent = createSessionEventSerializer()
	ctx.on('session/event', (session, event) => {
		const type = event?.type
		if (!isBusyBoundaryEvent(type)) return
		const seq = Number(event.seq)
		if (!Number.isFinite(seq)) return
		const id = String(session?.id ?? '')
		if (id === '') return
		serializeBusyEvent(id, async () => {
			try {
				await domainReady
				if (!turnStats.get(id)) {
					await ensureTurnStatsFresh(id)
				} else {
					// 回填在途时排队等待其写入完成，再按水位应用实时事件，避免回填快照
					// 覆盖（回退）实时事件的效果或造成缺口丢失（R-01-020/AC-04）。
					const inflight = backfills.get(id)
					if (inflight) await inflight
				}
				let current = turnStats.get(id)
				if (Number.isFinite(current?.watermarkSeq) && seq <= current.watermarkSeq) {
					// 重编检测（R-01-020/AC-04）：稳定 seq 空间内低水位事件的时刻不可能比水位处
					// 事件更新；时刻反而更新说明事件 seq 空间被重编（如 dsh 0.1.5 V3 迁移），
					// 持久化水位已失效，增量口径不再封死后续事件。无 watermarkTime 的存量记录
					//（本字段引入前写入，其水位未经重编检测校验）同样不可信——两者统一丢弃旧
					// 记账强制全量重放自愈；重放若仍覆盖不到本事件（日志写入滞后），落回下方
					// 正常增量路径应用。
					const time = Number(event.time)
					if (!Number.isFinite(time)) return
					if (Number.isFinite(current.watermarkTime) && time <= current.watermarkTime) return
					await ensureTurnStatsFresh(id, { forceFresh: true })
					current = turnStats.get(id)
					if (Number.isFinite(current?.watermarkSeq) && seq <= current.watermarkSeq) return
				}
				const next = applyTurnEventToStats(turnStatsFrom(current), event)
				if (turnStatsEqual(next, current)) {
					// 无效果事件（非提问工具调用、未配对的结算事件等）：不落盘不广播，
					// 水位不前移——重放路径对同类事件同样不改变记账状态，口径一致。
					return
				}
				const time = Number(event.time)
				// 与 reconcile 同口径：时刻无效时保留既有 watermarkTime 不前推（能走到此处的
				// 必为有效果事件、时刻有效，null 分支仅作防御）。
				await turnStats.put(id, { ...turnStatsFrom(next), watermarkSeq: seq, watermarkTime: Number.isFinite(time) ? time : turnStatsFrom(current).watermarkTime ?? null })
				broadcastBusy()
			} catch (error) {
				ctx.logger?.warn?.(`dsh-activity-pane: 回合统计登记失败（${id}）: ${String(error)}`)
			}
		})
	})

	// 后台任务输出镜像（R-01-024，C-030 同模式——会话事件是唯一事实来源、零 DSH 写入）：
	// `job_output` 的 tool/call 经 arguments.job_id 建立 callId → jobId 映射，配对的
	// tool/result 携带模型收到的定案文本。内存环形缓冲每会话 200 条（seq 去重的 Map，
	// 最旧先出）；镜像只收与已登记 callId 配对的 result（与缓冲内的 call 同源收窄，
	// 超 200 条被挤出的 call 其后续 result 不再缓存——由事件日志重放兜底，见下）。
	// result 落镜即经 /jobs/stream 广播 { sessionId, jobId }（轨迹不入库、无全量快照，
	// 客户端按需回读）。持久侧：/jobs-output 响应以 sessionQuery.listEvents 日志重放
	// （覆盖宿主重启后镜像空白）与镜像按 seq 去重合并——两源合流的去重口径由
	// core.jobOutputFromTraces 单点承载。
	const jobMirrorTraces = new Map() // sessionId -> Map(seq -> trace)
	const jobMirrorCalls = new Map() // sessionId -> Set(callId)
	const JOB_MIRROR_MAX = 200

	/** 向一组 SSE 连接写同一 state 帧；写失败（连接已断）的连接当场剔除。 */
	function broadcastState(clients, payload) {
		const data = `event: state\ndata: ${JSON.stringify(payload)}\n\n`
		for (const res of clients) {
			try {
				res.write(data)
			} catch {
				clients.delete(res)
			}
		}
	}

	/** 向全部 jobs SSE 连接广播一条轨迹通知（result 落镜即发，内容由客户端按需回读）。 */
	function broadcastJobTrace(sessionId, jobId) {
		broadcastState(jobStreamClients, { sessionId, jobId })
	}

	ctx.on('session/event', (session, event) => {
		const type = event?.type
		if (type !== 'tool/call' && type !== 'tool/result') return
		const id = String(session?.id ?? '')
		if (id === '') return
		const [trace] = jobOutputTraces([event])
		if (trace === undefined) return
		let bySeq = jobMirrorTraces.get(id)
		if (bySeq === undefined) jobMirrorTraces.set(id, bySeq = new Map())
		const calls = jobMirrorCalls.get(id)
		if (trace.kind === 'call') {
			// callId 只在缓冲内有效：登记与随缓冲驱逐同步，长命会话的集合规模有界。
			if (calls === undefined) jobMirrorCalls.set(id, new Set([trace.callId]))
			else calls.add(trace.callId)
		} else if (calls?.has(trace.callId) !== true) {
			// 未配对的结算事件不缓存（如其它工具的 result 或镜像缓冲未涵盖的旧 call）。
			return
		}
		bySeq.set(trace.seq, trace)
		if (bySeq.size > JOB_MIRROR_MAX) {
			// FIFO 环形：被挤出的轨迹交由 /jobs-output 的日志重放兜底；callId 随驱逐
			// 同步注销——其后续 result 不再入镜（与持久侧重放的合流口径保持一致）。
			const excess = bySeq.size - JOB_MIRROR_MAX
			const evicted = [...bySeq.values()].slice(0, excess)
			for (const evictedTrace of evicted) {
				bySeq.delete(evictedTrace.seq)
				if (evictedTrace.kind === 'call') calls.delete(evictedTrace.callId)
			}
		}
		if (trace.kind !== 'result') return
		let jobId = null
		for (const cached of bySeq.values()) {
			if (cached.kind === 'call' && cached.callId === trace.callId) jobId = cached.jobId
		}
		if (jobId !== null) broadcastJobTrace(id, jobId)
	})

	// HTTP API（前缀挂载，handler 内按子路径分发）。
	// A1-08：自定义 webServer 路由不继承宿主鉴权门——每个请求先过
	// connection.requestRejection，401/403 直接拒绝，避免 acks/busy 读写通道
	// 成为绕过 bootstrap token/signed cookie 的安全空洞。
	ctx.webServer.register({
		path: API_PATH,
		handler(req, res) {
			const rejection = ctx.connection?.requestRejection?.(req)
			if (rejection !== undefined) {
				res.writeHead(rejection, { 'Content-Type': 'text/plain' })
				res.end('unauthorized')
				return
			}
			const url = new URL(req.url || '/', 'http://dsh-activity-pane')
			const route = url.pathname.slice(API_PATH.length)
			const method = req.method || 'GET'
			if (route === '/acks' && method === 'GET') {
				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify(snapshot()))
				return
			}
			if (route === '/acks/stream' && method === 'GET') {
				// SSE：连接即发全量快照，此后每次变更广播；浏览器 EventSource 自动重连，
				// 重连时再收一次全量，状态必然收敛（R-01-002/AC-12）。
				res.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive',
				})
				const hello = `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`
				res.write(hello)
				streamClients.add(res)
				const remove = () => streamClients.delete(res)
				req.on('close', remove)
				res.on('close', remove)
				return
			}
			if (route === '/ack' && method === 'POST') {
				readJsonBody(req).then(async (body) => {
					const sessionId = body !== null && typeof body?.sessionId === 'string' ? body.sessionId : ''
					if (sessionId === '') {
						res.writeHead(400, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ ok: false, error: 'sessionId 缺失或非法' }))
						return
					}
					try {
						await domainReady
						const current = acks.get(sessionId)
						// 确认写回只动 ackedAt：保留回合结束时刻、结束原因与错误信息（C-043）。
						await acks.put(sessionId, {
							lastTurnEnd: current?.lastTurnEnd ?? null,
							lastTurnEndKind: current?.lastTurnEndKind ?? null,
							lastTurnEndError: current?.lastTurnEndError ?? null,
							ackedAt: Date.now(),
						})
						broadcast()
						res.writeHead(200, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ ok: true }))
					} catch (error) {
						res.writeHead(500, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ ok: false, error: String(error) }))
					}
				})
				return
			}
			if (route === '/busy' && method === 'GET') {
				// 只读下发：响应立即返回当前全量快照；查询参数 ids（逗号分隔会话 id）指定
				// 客户端当前可见的主会话，对其中无记录者触发懒回填（fire-and-forget），
				// 回填完成经 /busy/stream 广播推送（R-01-020/AC-05）。
				const idsParam = url.searchParams.get('ids') ?? ''
				for (const id of idsParam.split(',')) {
					if (id !== '') ensureTurnStatsFresh(id)
				}
				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify(busySnapshot()))
				return
			}
			if (route === '/busy/stream' && method === 'GET') {
				// SSE：连接即发全量快照，此后每次变更广播；浏览器 EventSource 自动重连，
				// 重连时再收一次全量，状态必然收敛。
				res.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive',
				})
				const hello = `event: state\ndata: ${JSON.stringify(busySnapshot())}\n\n`
				res.write(hello)
				busyStreamClients.add(res)
				const remove = () => busyStreamClients.delete(res)
				req.on('close', remove)
				res.on('close', remove)
				return
			}
			if (route === '/jobs-output' && method === 'GET') {
				// 后台任务输出回放（R-01-024）：归属会话事件日志重放（持久种子）与内存镜像
				// 按 seq 去重合并，配对产出 { text, truncated, read }；只读、无模型游标消费。
				const sessionId = url.searchParams.get('sessionId') ?? ''
				const jobId = url.searchParams.get('jobId') ?? ''
				if (sessionId === '' || jobId === '') {
					res.writeHead(400, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ ok: false, error: 'sessionId/jobId 缺失或非法' }))
					return
				}
				ctx.inject(['sessionQuery'], (injected) => {
					Promise.resolve()
						.then(async () => {
							const records = await injected.sessionQuery.listEvents(sessionId).catch(() => [])
							const storeTraces = jobOutputTraces(Array.isArray(records) ? records : [])
							const mirror = jobMirrorTraces.get(sessionId)
							const merged = mirror !== undefined && mirror.size > 0 ? storeTraces.concat([...mirror.values()]) : storeTraces
							return jobOutputFromTraces(merged, jobId)
						})
						.then((payload) => {
							res.writeHead(200, { 'Content-Type': 'application/json' })
							res.end(JSON.stringify(payload))
						})
						.catch((error) => {
							// 读取失败以 5xx 明示（客户端呈现「输出读取失败」而非误判「尚未被读取」）：
							// 失败语义不冒充为「无读取」，下次轨迹通知或重新选中允许重试。
							ctx.logger?.warn?.(`dsh-activity-pane: 任务输出回放失败（${sessionId}/${jobId}）: ${String(error)}`)
							if (res.headersSent) return
							res.writeHead(500, { 'Content-Type': 'application/json' })
							res.end(JSON.stringify({ ok: false, error: 'job output replay failed' }))
						})
				})
				return
			}
			if (route === '/jobs/stream' && method === 'GET') {
				// SSE：连接即发空快照（轨迹不入库、无全量快照语义），此后每个 result 轨迹
				// 广播 { sessionId, jobId }；客户端仅对已选中任务回读输出。
				res.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive',
				})
				res.write('event: state\ndata: {}\n\n')
				jobStreamClients.add(res)
				const remove = () => jobStreamClients.delete(res)
				req.on('close', remove)
				res.on('close', remove)
				return
			}
			res.writeHead(404, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ ok: false, error: 'not found' }))
		},
	})

	// 卸载：关闭全部 SSE 连接；domain 由 ctx.effect 关闭。
	return () => {
		for (const res of streamClients) {
			try {
				res.end()
			} catch {
				/* 连接已断 */
			}
		}
		streamClients.clear()
		for (const res of busyStreamClients) {
			try {
				res.end()
			} catch {
				/* 连接已断 */
			}
		}
		busyStreamClients.clear()
		for (const res of jobStreamClients) {
			try {
				res.end()
			} catch {
				/* 连接已断 */
			}
		}
		jobStreamClients.clear()
	}
}