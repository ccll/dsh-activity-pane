// dsh-activity-pane 核心单元检查与 client bundle 契约校验。
//
// 测试锚点：本文件被 CONVENTIONS.md 的 `测试锚点路径` 登记为测试文件，
// 以一行的 `// R-gg-nnn/AC-nn` 注释锚定 PRD 验收点；GUI 交互类验收点
// 见 scripts/acceptance.mjs（人工验收清单）。
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildEntries,
	cardSignature,
	pendingText,
	subagentTitle,
	workspaceTitleForSession,
} from "../src/core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ---- R-01-002/AC-01 待确认 ｜ R-01-002/AC-02 待审查/待回复 ----
assert.equal(pendingText("approval"), "待确认");
assert.equal(pendingText("plan-review"), "待审查");
assert.equal(pendingText("question"), "待回复");
assert.equal(pendingText("approval"), "待确认");

// ---- R-01-002/AC-03 完成主会话以"需要响应"呈现 ----
// pendingText 兜底为"需要响应"；完成态判定见下方 buildEntries 断言（R-01-001/AC-01）。
assert.equal(pendingText("unknown-kind"), "需要响应");

// ---- R-01-003/AC-03 工作区归属 ----
const workspaces = [
	{ title: "Ops", path: "/srv/ops", sessionIds: ["sA"] },
	{ title: "Mail", path: "/srv/mail", sessionIds: [] },
];
assert.equal(workspaceTitleForSession("sA", workspaces), "Ops");
assert.equal(
	workspaceTitleForSession("sB", workspaces, { sB: { cwd: "/srv/mail" } }),
	"Mail",
);
assert.equal(workspaceTitleForSession("sX", workspaces), "");

// ---- R-01-001/AC-01 活动卡片逐条显示 ｜ R-01-003/AC-01 子代理嵌套 ｜ R-01-003/AC-02 子代理结束即消失 ｜ R-01-006/AC-01 当前会话 ----
const snapshot = {
	ids: ["sA", "sA-c1", "sA-c2", "sB", "sX"],
	byId: {
		sA: { id: "sA", displayTitle: "主A", running: true, completed: false },
		"sA-c1": { id: "sA-c1", displayTitle: "子1", running: true, parentId: "sA" },
		"sA-c2": { id: "sA-c2", displayTitle: "子2", running: false, completed: true, parentId: "sA" },
		sB: { id: "sB", displayTitle: "主B", running: false, completed: true },
		sX: { id: "sX", displayTitle: "主X", running: false, completed: false },
	},
	current: "sA",
	subagentsByParent: {
		sA: { entries: [{ id: "sA-c1", label: "子代理一号" }] },
	},
};
const entries = buildEntries(snapshot, workspaces);
assert.deepEqual(
	entries.map((e) => [e.id, e.kind, e.depth, e.title]),
	[
		["sA", "running", 0, "主A"],
		["sA-c1", "subagent", 1, "子代理一号"],
		["sB", "awaiting", 0, "主B"],
	],
	"运行/等待主会话出现、子代理嵌套缩进、完成的子代理消失",
);
assert.equal(entries[0].isCurrent, true, "当前会话高亮标记");
assert.equal(entries[2].pendingText, "需要响应", "完成主会话=需要响应");
assert.equal(entries[2].workspaceTitle, "", "无归属则无工作区徽标");

// ---- R-01-001/AC-02 无活动会话时为空态 ｜ R-02-001/AC-01、R-02-001/AC-02 独立数据源 ----
// 核心映射只消费 DSH 原生快照结构（无任何第三方数据源引用）。
const snapshotOnly = { ids: [], byId: {}, current: null };
assert.deepEqual(buildEntries(snapshotOnly, []), [], "空快照产出空条目");

// ---- R-01-002/AC-01..02 等待优先于运行态 ----
const pendingSnap = {
	ids: ["sP"],
	byId: {
		sP: { id: "sP", displayTitle: "主P", running: true, pendingInteraction: "approval" },
	},
	current: null,
};
const pendingEntries = buildEntries(pendingSnap, []);
assert.equal(pendingEntries[0].kind, "awaiting", "pending 覆盖 running");
assert.equal(pendingEntries[0].pendingText, "待确认");

// ---- R-01-001/AC-01 可重复的确定性渲染（见下） ｜ R-02-003/AC-01 渲染签名去重 ----
const e1 = buildEntries(snapshot, workspaces);
const e2 = buildEntries(snapshot, workspaces);
assert.equal(cardSignature(e1), cardSignature(e2), "相同状态签名相等→跳过重绘");
assert.notEqual(
	cardSignature(e1),
	cardSignature([{ ...e1[0], title: "改" }]),
	"状态变化签名必变",
);

// ---- R-01-003/AC-01 无目录 label 时回退显示标题 ----
assert.equal(
	subagentTitle("sA", "sA-c2", snapshot.byId, snapshot.subagentsByParent),
	"子2",
);

// ---- 重建 client bundle 并校验产物契约 ----
await mkdir(join(root, ".dsh-plugin"), { recursive: true });
execFileSync(process.execPath, [join(root, "scripts/build-client.mjs")], {
	cwd: root,
	stdio: "pipe",
});
const bundle = await readFile(join(root, ".dsh-plugin/client.js"), "utf8");

// ---- R-02-001/AC-01 未安装任何第三方宠物插件时仍可用；R-02-001/AC-02 无第三方状态路由 ----
// 校验的是运行时引用：不得注入第三方插件服务、不得请求其状态路由、不得发起状态轮询
// （文档注释中的上位名提及属来源声明，不构成依赖）。
assert.ok(bundle.includes('id: "dsh-activity-pane"'), "bundle 含插件 id");
assert.ok(bundle.includes("ctx.get(\"sessions\")"), "数据来自 DSH 原生 sessions 服务");
assert.ok(bundle.includes("ctx.get(\"workspaces\")"), "数据来自 DSH 原生 workspaces 服务");
assert.ok(
	!bundle.includes("ctx.get(\"dsh-answer-pet\")"),
	"不得以服务方式依赖第三方宠物插件",
);
assert.ok(
	!bundle.includes("fetch("),
	"bundle 不得发起任何状态路由请求或状态轮询",
);

// ---- R-02-003/AC-02 卸载时清理注入元素、样式与监听 ----
assert.ok(bundle.includes("style.remove()"), "卸载移除注入样式");
assert.ok(bundle.includes("bodyObserver.disconnect()"), "卸载断开观察者");
assert.ok(bundle.includes("removeEventListener"), "卸载移除事件监听");

console.log("check: all assertions passed");
