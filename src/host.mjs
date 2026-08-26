// dsh-activity-pane 宿主侧：完成确认状态（R-01-002/AC-03、AC-05、AC-10～AC-12、R-01-010/AC-06，C-030）。
//
// 职责：
//   1. 订阅 `session/event` 的 `turn/end`，把事件顶层 `time` 登记为会话的 `lastTurnEnd`；
//   2. `POST /dsh-activity-pane/api/ack` 写回 `ackedAt`；
//   3. `GET /dsh-activity-pane/api/acks` 全量快照；`GET /dsh-activity-pane/api/acks/stream` SSE 推送
//      （连接即发全量、变更即广播）。
//
// 持久化：storageDomain 声明式 domain 表 `acks`（sessionId → { lastTurnEnd, ackedAt }）。
// 设计约束（C-030）：不写会话日志、不依赖 sessionProjections、不引入客户端轮询；
// 完成提醒成立 = 主会话 && 非 running && 无阻塞等待 && 非委托周期 && lastTurnEnd > ackedAt，
// 判定在客户端纯函数完成，本侧只维护持久事实与广播。

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const name = 'dsh-activity-pane'
export const inject = ['storageDomain', 'webServer']

const API_PATH = '/dsh-activity-pane/api'

/** 每会话完成确认记录：lastTurnEnd 最后回合结束时刻（事件 time，毫秒），ackedAt 确认时刻。 */
const ackRecord = z.object({
	lastTurnEnd: z.number().nullable(),
	ackedAt: z.number().nullable(),
})

const domainSpec = defineDomain({
	name: 'dsh_activity_pane',
	version: 1,
	global: { schema: z.object({}), initial: {} },
	tables: {
		acks: domainTable(ackRecord),
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
	let acks = null // KvTable: sessionId -> { lastTurnEnd, ackedAt }
	/** SSE 连接集合：广播时逐个写 `event: state`。 */
	const streamClients = new Set()

	ctx.inject(['storageDomain'], async (domainCtx) => {
		const domain = await domainCtx.storageDomain.open(domainSpec)
		ctx.effect(() => () => domain.close(), 'dsh-activity-pane: domainClose')
		acks = domain.table('acks')
		resolveDomain()
	})

	/** 全量快照：{ [sessionId]: { lastTurnEnd, ackedAt } }。acks 未就绪时返回空对象。 */
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

	// turn/end 登记（R-01-002/AC-03、AC-11、AC-12）：事件按会话序提交，get+put 无竞态；
	// 保留既有 ackedAt（回合更替不清确认游标），lastTurnEnd 前移即让旧提醒失效、新提醒成立。
	ctx.on('session/event', async (session, event) => {
		if (event?.type !== 'turn/end') return
		const time = Number(event.time)
		if (!Number.isFinite(time)) return
		const id = String(session?.id ?? '')
		if (id === '') return
		try {
			await domainReady
			const current = acks.get(id)
			await acks.put(id, { lastTurnEnd: time, ackedAt: current?.ackedAt ?? null })
			broadcast()
		} catch (error) {
			ctx.logger?.warn?.(`dsh-activity-pane: turn/end 登记失败（${id}）: ${String(error)}`)
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
						await acks.put(sessionId, { lastTurnEnd: current?.lastTurnEnd ?? null, ackedAt: Date.now() })
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
	}
}