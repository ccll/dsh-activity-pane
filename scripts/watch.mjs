// dsh-activity-pane 源码 watch：src/*.mjs 或 build 脚本变化时自动重建
// .dsh-plugin/client.js（原地写入，保留 profile 硬链接）。配合 DSH 的
// dsh-client-hmr：文件一变，浏览器即热装该插件，无需整页刷新或重启。
//
// 用法：node scripts/watch.mjs  （或 pnpm dev:watch）
import { watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from './build-client.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const watched = [
	join(root, 'src'),
	join(root, 'scripts/build-client.mjs'),
]
const DEBOUNCE_MS = 80
let timer = null

async function rebuild(reason) {
	try {
		await build()
		console.log(
			`[watch] ${new Date().toLocaleTimeString()} 重建 .dsh-plugin/client.js（${reason}）`,
		)
	} catch (error) {
		console.error(`[watch] 构建失败：${error?.message ?? error}`)
	}
}

function schedule(reason) {
	if (timer !== null) clearTimeout(timer)
	timer = setTimeout(() => {
		timer = null
		rebuild(reason)
	}, DEBOUNCE_MS)
}

for (const target of watched) {
	watch(target, () => schedule('src 变化'))
}

console.log('[watch] 监视 src/ 与 scripts/build-client.mjs；Ctrl+C 退出')
await rebuild('启动')
