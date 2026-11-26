// release：版本 ↔ 最新 tag、npm files[] 完整且落地、工作树干净。
import { join } from "node:path";
import { ROOT, git, pathExists, readText, statusEntries } from "./util.mjs";

const REQUIRED_FILES = [".dsh-plugin", "src", "scripts", "cordis.patch.yml", "README.md", "LICENSE"];

function latestTag() {
	const described = git(["describe", "--tags", "--abbrev=0"], { allowFail: true });
	if (described) return described.trim();
	const tags = git(["tag", "--sort=-v:refname"], { allowFail: true });
	if (tags === null) return null;
	return tags.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] ?? null;
}

export function runRelease(rep) {
	const packageText = readText(join(ROOT, "package.json"));
	if (packageText === null) {
		rep.fail("release/版本", "package.json 不存在");
		rep.fail("release/files", "package.json 不存在");
		rep.fail("release/工作树", "package.json 不存在");
		return;
	}
	let pkg;
	try {
		pkg = JSON.parse(packageText);
	} catch (error) {
		rep.fail("release/版本", `package.json 无法解析：${error.message}`);
		return;
	}

	// 版本 ↔ 最新 tag（v<version>）。
	const version = pkg.version;
	const tag = latestTag();
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version))) {
		rep.fail("release/版本", `package.json version「${version}」不是 semver`);
	} else if (!tag) {
		rep.fail("release/版本", "仓库没有 git tag，无法对齐版本");
	} else if (tag !== `v${version}`) {
		rep.fail("release/版本", `package.json ${version} ≠ 最新 tag ${tag}（期望 v${version}）`);
	} else {
		rep.ok("release/版本", `${tag} 与 package.json ${version} 对齐`);
	}

	// files[] 完整性：关键路径必须发布，且每项在仓库内存在（通配项跳过）。
	const files = Array.isArray(pkg.files) ? pkg.files.map((item) => String(item)) : null;
	if (files === null) {
		rep.fail("release/files", "package.json 缺少 files[]");
	} else {
		const problems = [];
		for (const required of REQUIRED_FILES) {
			const covered = files.includes(required) || files.includes(".") ||
				files.some((entry) => !entry.includes("*") && required.startsWith(`${entry}/`));
			if (!covered) problems.push(`缺少 ${required}`);
		}
		for (const entry of files) {
			if (entry.includes("*")) continue;
			if (!pathExists(join(ROOT, entry))) problems.push(`files[] 项不存在：${entry}`);
		}
		if (problems.length === 0) rep.ok("release/files", `${files.length} 项覆盖关键路径且均存在`);
		else rep.fail("release/files", problems.slice(0, 8).join("；"));
	}

	// 工作树必须干净（含未跟踪文件）。
	const entries = statusEntries();
	if (entries.length === 0) {
		rep.ok("release/工作树", "干净，无未提交改动");
	} else {
		const shown = entries.slice(0, 5).map((entry) => `${entry.status.trim() || "??"} ${entry.path}`);
		rep.fail("release/工作树", `有 ${entries.length} 处未提交改动：${shown.join("、")}${entries.length > 5 ? "…" : ""}`);
	}
}
