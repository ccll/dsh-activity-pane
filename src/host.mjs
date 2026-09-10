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
//   4. 订阅 `session/event` 配对 `turn/start`–`turn/end` 累计每会话 busy 总时长（R-01-020）：
//      持久化于独立 domain 表 `turn_stats`（`{ busyMs, openTurnStart, watermarkSeq }`），
//      无记录会话经 `sessionQuery.listEvents` 懒回填，经 `GET /api/busy` 全量快照与
//      `/busy/stream` SSE 只读下发，无写回路径。
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
import { applyTurnEventToStats, truncateErrorNote } from './core.mjs'

export const name = 'dsh-activity-pane'
export const inject = ['storageDomain', 'webServer', 'sessionQuery']

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

/** 每会话累计运行时长记账（R-01-020）：busyMs 已完成回合运行时长累计（null=尚无有效计时）、
 *  openTurnStart 当前开放回合起点（无开放回合为 null）、watermarkSeq 实时登记已覆盖的最大事件
 *  seq（回填与实时登记以水位衔接，seq ≤ watermark 的事件不重复应用）。全部字段可选/可空。 */
const turnStatRecord = z.object({
	busyMs: z.number().nullable().optional(),
	openTurnStart: z.number().nullable().optional(),
	watermarkSeq: z.number().nullable().optional(),
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
	})

	/** 全量 busy 快照：{ [sessionId]: { busyMs, openTurnStart } }（水位为宿主内部记账，不下发）。 */
	function busySnapshot() {
		const out = {}
		if (turnStats === null) return out
		for (const [id, record] of turnStats.entries()) {
			out[id] = { busyMs: record?.busyMs ?? null, openTurnStart: record?.openTurnStart ?? null }
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

	/** 懒回填（R-01-020/AC-05，C-074）：经 sessionQuery.listEvents 读取会话事件，保证
	 *  记账覆盖全部存量回合——无记录会话自空状态全量重放；已有记录会话仅增量应用
	 *  seq > watermarkSeq 的事件（宿主离线期间经其它入口发生的回合），以水位衔接保证
	 *  不重复、不遗漏。重放以「最近未配对 start」策略覆盖实时登记同一口径，写入后
	 *  广播。读取失败保留已有记账，随下次请求重试；会话不存在/已删除时静默跳过。 */
	function ensureTurnStatsFresh(id) {
		if (backfills.has(id)) return backfills.get(id)
		const promise = new Promise((resolve) => {
			ctx.inject(['sessionQuery'], (sessionQuery) => {
				resolve(sessionQuery)
			})
		}).then(async (sessionQuery) => {
			try {
				await domainReady
				const current = turnStats.get(id)
				if (current) {
					// 已有记账：只补水位之后的缺口回合（宿主离线期间经其它入口发生的回合）。
					const watermark = Number(current.watermarkSeq)
					const records = await sessionQuery.listEvents(id)
					let state = { busyMs: current.busyMs ?? null, openTurnStart: current.openTurnStart ?? null }
					let watermarkSeq = current.watermarkSeq ?? null
					for (const record of Array.isArray(records) ? records : []) {
						const seq = Number(record?.seq)
						if (!Number.isFinite(seq)) continue
						if (Number.isFinite(watermark) && seq <= watermark) continue
						state = applyTurnEventToStats(state, record)
						if (watermarkSeq === null || seq > watermarkSeq) watermarkSeq = seq
					}
					if (watermarkSeq !== null && (watermarkSeq !== (current.watermarkSeq ?? null) || state.busyMs !== (current.busyMs ?? null) || state.openTurnStart !== (current.openTurnStart ?? null))) {
						await turnStats.put(id, { busyMs: state.busyMs, openTurnStart: state.openTurnStart, watermarkSeq })
						broadcastBusy()
					}
					return
				}
				// 无记录：自空状态全量重放（存量会话首次回填）。
				const records = await sessionQuery.listEvents(id)
				let state = { busyMs: null, openTurnStart: null }
				let watermarkSeq = null
				for (const record of Array.isArray(records) ? records : []) {
					state = applyTurnEventToStats(state, record)
					const seq = Number(record?.seq)
					if (Number.isFinite(seq) && (watermarkSeq === null || seq > watermarkSeq)) watermarkSeq = seq
				}
				await turnStats.put(id, { busyMs: state.busyMs, openTurnStart: state.openTurnStart, watermarkSeq })
				broadcastBusy()
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

	// 累计运行时长实时登记（R-01-020/AC-02、AC-04、AC-05，C-074）：turn/start–turn/end 配对记账，
	// completed/blocked/max-tokens/aborted/error 全部结束原因均计入；事件按会话序提交，
	// seq ≤ watermark 的事件幂等跳过；主/子统一登记，过滤由客户端判定。
	// 表内无记录的会话先懒回填存量回合再应用实时事件——否则首个实时事件会以 null 建立记录、
	// 存量回合永远失去补齐机会。
	ctx.on('session/event', async (session, event) => {
		const type = event?.type
		if (type !== 'turn/start' && type !== 'turn/end') return
		const seq = Number(event.seq)
		if (!Number.isFinite(seq)) return
		const id = String(session?.id ?? '')
		if (id === '') return
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
			const current = turnStats.get(id)
			if (Number.isFinite(current?.watermarkSeq) && seq <= current.watermarkSeq) return
			const next = applyTurnEventToStats(
				{ busyMs: current?.busyMs ?? null, openTurnStart: current?.openTurnStart ?? null },
				event,
			)
			await turnStats.put(id, { busyMs: next.busyMs, openTurnStart: next.openTurnStart, watermarkSeq: seq })
			broadcastBusy()
		} catch (error) {
			ctx.logger?.warn?.(`dsh-activity-pane: 回合统计登记失败（${id}）: ${String(error)}`)
		}
	})

	// HTTP API（前缀挂载，handler 内按子路径分发）。
	ctx.webServer.register({
		path: API_PATH,
		handler(req, res) {
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
	}
}