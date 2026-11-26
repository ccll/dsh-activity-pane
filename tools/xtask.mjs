#!/usr/bin/env node
// xtask：唯一门禁入口。node tools/xtask.mjs <子命令> [参数]
// 无参数打印用法并退出 0；未知子命令退出 2；任一检查 fail 退出 1。
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Reporter, SUBCOMMANDS } from "./xtask/util.mjs";
import { runSkills } from "./xtask/skills.mjs";
import { runDocs } from "./xtask/docs.mjs";
import { runLists } from "./xtask/lists.mjs";
import { runPolicy } from "./xtask/policy.mjs";
import { runRatchet } from "./xtask/ratchet.mjs";
import { runBundle } from "./xtask/bundle.mjs";
import { runRelease } from "./xtask/release.mjs";
import { runAccept, runE2e, runPerf, runUnit } from "./xtask/tests.mjs";
import { GATES, runCi } from "./xtask/ci.mjs";

export { GATES, SUBCOMMANDS };

const RUNNERS = {
	skills: runSkills,
	docs: runDocs,
	lists: runLists,
	policy: runPolicy,
	ratchet: runRatchet,
	bundle: runBundle,
	unit: runUnit,
	e2e: runE2e,
	accept: runAccept,
	perf: runPerf,
	release: runRelease,
	ci: runCi,
};

const USAGE = `xtask —— dsh-activity-pane 门禁入口（Node 内建模块，无 npm 依赖）

用法: node tools/xtask.mjs <子命令> [参数]

子命令:
  skills                     技能层拓扑：AGENTS.md 路由 ↔ .agents/skills、大小、frontmatter、README 索引、路径/命令引用、.claude/skills 链接
  docs                       文档漂移：架构依赖表 ↔ 真实 import、宿主版本矩阵、RFC 索引、roadmap 结构与退役 ID
  lists [--fix]              只减清单/package.json files[] 排序、.githooks/*.d 命名与编号
  policy [--message <path>] [--replay] [--push] [--base <ref>]
                             提交规范：标题正则、正文三段标题、生成物同步、禁止路径与退役 ID；
                             --message 读消息文件（commit-msg 用），--replay 复检 origin/main..HEAD（pre-push 用），--push 拒绝 main
  ratchet [--bless]          只减清单存活：未覆盖 spec、宿主 shim 行、人工验收期限、bundle 字节预算；--bless 只接受更小预算
  bundle [--check]           重建 client bundle 并与 Git index 逐字节比较；--check 比较后恢复工作树
  unit                       运行 scripts/check.mjs 并报告 pass/fail/耗时
  e2e [--shard i/n] [--timeout ms] [spec...]
                             逐 spec 运行 e2e/run.mjs（单 spec 超时），失败截图残留判定
  accept                     运行 scripts/acceptance.mjs（人工验收清单）
  perf                       运行 scripts/perf-ab.mjs 并与 tools/ratchet/perf-budget.json 比对（无预算则 skip）
  release                    版本 ↔ 最新 tag、package.json files[] 完整、工作树干净
  ci [--fast] [--list] [--all] [--base <ref>]
                             权威门禁：按变更文件决定每个 GATES 门禁 run/skip；--list 只打印不执行，
                             --fast 只跑 policy/skills/docs/lists/ratchet/bundle/unit，--all 含人工验收

约定:
  - 每行一个检查：ok / fail / skip，附原因；末尾打印汇总。
  - 缺失文件或外部命令失败落成 fail 行，不打印堆栈。
  - 退出码：0 通过（含 skip），1 任一 fail，2 未知子命令。
`;

async function main() {
	const argv = process.argv.slice(2);
	if (argv.length === 0) {
		console.log(USAGE);
		process.exitCode = 0;
		return;
	}
	const [command, ...rest] = argv;
	if (command === "--help" || command === "-h") {
		console.log(USAGE);
		process.exitCode = 0;
		return;
	}
	if (!SUBCOMMANDS.includes(command)) {
		console.error(`xtask: 未知子命令「${command}」`);
		console.error(USAGE);
		process.exitCode = 2;
		return;
	}
	const reporter = new Reporter(command);
	try {
		await RUNNERS[command](reporter, rest);
	} catch (error) {
		reporter.fail(`${command}/内部错误`, error?.message ?? String(error));
	}
	process.exitCode = reporter.summary();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}
