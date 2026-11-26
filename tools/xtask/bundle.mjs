// bundle：重建 .dsh-plugin/client.js 并与 Git index 版本逐字节比较；
// --check 在比较后恢复工作树（不留修改）。
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	ROOT,
	failureReason,
	gitBytes,
	readBytes,
	runNodeScript,
} from "./util.mjs";

const BUNDLE_REL = ".dsh-plugin/client.js";

export async function runBundle(rep, argv = []) {
	const checkMode = argv.includes("--check");
	const bundlePath = join(ROOT, BUNDLE_REL);
	const original = readBytes(bundlePath);

	const result = await runNodeScript("scripts/build-client.mjs", [], { timeoutMs: 120_000 });
	try {
		if (result.code !== 0) {
			rep.fail("bundle/重建", `${result.timedOut ? "超时 " : ""}build-client 退出 ${result.code}：${failureReason(result)}`);
			return;
		}
		const built = readBytes(bundlePath);
		if (built === null) {
			rep.fail("bundle/重建", "构建后 .dsh-plugin/client.js 不存在");
			return;
		}
		const indexed = gitBytes(["show", `:${BUNDLE_REL}`]);
		if (indexed === null) {
			rep.fail("bundle/index", `Git index 缺少 ${BUNDLE_REL}`);
			return;
		}
		if (built.equals(indexed)) {
			rep.ok("bundle/一致性", `${built.length} B 与 Git index 逐字节一致`);
		} else {
			let offset = 0;
			while (offset < built.length && offset < indexed.length && built[offset] === indexed[offset]) offset += 1;
			rep.fail(
				"bundle/一致性",
				`工作树 ${built.length} B ≠ index ${indexed.length} B（首个差异 @${offset}）；请用 node tools/xtask.mjs bundle 重建并暂存`,
			);
		}
	} finally {
		if (checkMode) {
			// --check 不得留下修改：恢复构建前内容（原先不存在则删除产物）。
			if (original === null) await rm(bundlePath, { force: true });
			else await writeFile(bundlePath, original);
		}
	}
}
