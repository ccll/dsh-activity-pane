#!/usr/bin/env python3
"""Project-level PRD/DESIGN diff to test-evidence gate (C-059, T-089)."""

import argparse
import fnmatch
import re
import subprocess
import sys
import tempfile
from pathlib import Path

AC_RE = re.compile(r"^#### (R-\d{2}-\d{3})\b(?P<body>[\s\S]*?)(?=^#### |\Z)", re.MULTILINE)
AC_LINE_RE = re.compile(r"^- (AC-\d{2})\s+(.+)$", re.MULTILINE)
AC_ID_RE = re.compile(r"\bR-\d{2}-\d{3}/AC-\d{2}\b")
AUTO_PATTERNS = ("scripts/check.mjs",)
E2E_PATTERNS = ("e2e/specs/*.mjs",)
MANUAL_PATTERNS = ("scripts/acceptance.mjs",)
EVIDENCE_PATTERNS = AUTO_PATTERNS + E2E_PATTERNS + MANUAL_PATTERNS
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
ALLOWED_LAYERS = {"UNIT", "E2E", "MANUAL", "UNIT/E2E", "UNIT/MANUAL", "E2E/MANUAL", "UNIT/E2E/MANUAL", "none"}
ALLOWED_ACTIONS = {"add", "update", "delete", "none"}
PLACEHOLDER_RE = re.compile(r"^(?:-|N/A|TBD|TODO|待补|无)$", re.IGNORECASE)


def run_git(root, *args, input_text=None, check=True):
    result = subprocess.run(
        ["git", *args], cwd=str(root), input=input_text, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result


def git_text(root, spec, path):
    result = run_git(root, "show", "%s:%s" % (spec, path), check=False)
    if result.returncode == 0:
        return result.stdout
    missing = ("does not exist in", "exists on disk, but not in", "not in the index")
    if any(marker in result.stderr for marker in missing):
        return ""
    raise RuntimeError(result.stderr.strip() or "git show failed for %s:%s" % (spec, path))


def working_text(root, path):
    target = root / path
    return target.read_text(encoding="utf-8") if target.is_file() else ""


def index_text(root, path):
    return git_text(root, "", path)


def parse_acceptance(text):
    found = {}
    for requirement in AC_RE.finditer(text):
        rid = requirement.group(1)
        for local_id, sentence in AC_LINE_RE.findall(requirement.group("body")):
            found["%s/%s" % (rid, local_id)] = " ".join(sentence.split())
    return found


def matches(path, patterns):
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def evidence_anchors(files, reader):
    anchors = {"unit": set(), "e2e": set(), "manual": set()}
    for path in files:
        if matches(path, AUTO_PATTERNS):
            kind = "unit"
        elif matches(path, E2E_PATTERNS):
            kind = "e2e"
        elif matches(path, MANUAL_PATTERNS):
            kind = "manual"
        else:
            continue
        anchors[kind].update(AC_ID_RE.findall(reader(path)))
    return anchors


def all_evidence_files(root, target, reader):
    if target in {"working", "index"}:
        args = ("ls-files", "--cached", "--others", "--exclude-standard") if target == "working" else ("ls-files", "--cached")
        result = run_git(root, *args)
    else:
        result = run_git(root, "ls-tree", "-r", "--name-only", target)
    return sorted(path for path in result.stdout.splitlines() if matches(path, EVIDENCE_PATTERNS))


def changed_paths(root, base, target):
    if target == "working":
        result = run_git(root, "diff", "--name-only", base, "--")
        untracked = run_git(root, "ls-files", "--others", "--exclude-standard")
        return set(result.stdout.splitlines()) | set(untracked.stdout.splitlines())
    if target == "index":
        return set(run_git(root, "diff", "--cached", "--name-only", base, "--").stdout.splitlines())
    return set(run_git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", base, target).stdout.splitlines())


def task_impact_rows(text):
    match = re.search(r"^## 测试影响\s*$([\s\S]*?)(?=^##\s|\Z)", text, re.MULTILINE)
    if not match:
        return []
    rows = []
    for line in match.group(1).splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 5 or cells[0] in {"需求/AC", "---"} or set(cells[0]) == {"-"}:
            continue
        rows.append(cells)
    return rows


def changed_active_task_rows(root, changed, reader):
    rows = []
    for path in sorted(changed):
        if not fnmatch.fnmatch(path, "tasks/T-*.md"):
            continue
        text = reader(path)
        if re.search(r"^状态:\s*active\s*$", text, re.MULTILINE):
            rows.extend(task_impact_rows(text))
    return rows


def valid_impact_row(row):
    subject, change, layer, action, evidence = row
    return (
        bool(subject and change)
        and layer in ALLOWED_LAYERS
        and action.lower() in ALLOWED_ACTIONS
        and len(evidence.strip()) >= 8
        and PLACEHOLDER_RE.fullmatch(evidence.strip()) is None
    )


def row_covers(rows, key, require_none=False):
    for row in rows:
        if not valid_impact_row(row):
            continue
        subject, _change, _layer, action, _evidence = row
        subjects = set(AC_ID_RE.findall(subject))
        if key not in subjects and subject != key:
            continue
        if require_none and action.lower() != "none":
            continue
        return True
    return False


def evaluate(root, base, target, report=False):
    if target == "working":
        reader = lambda path: working_text(root, path)
        prd_new = reader("PRD.md")
    elif target == "index":
        reader = lambda path: index_text(root, path)
        prd_new = reader("PRD.md")
    else:
        reader = lambda path: git_text(root, target, path)
        prd_new = reader("PRD.md")

    changed = changed_paths(root, base, target)
    prd_old = git_text(root, base, "PRD.md")
    old_ac = parse_acceptance(prd_old)
    new_ac = parse_acceptance(prd_new)
    added = set(new_ac) - set(old_ac)
    deleted = set(old_ac) - set(new_ac)
    modified = {key for key in set(old_ac) & set(new_ac) if old_ac[key] != new_ac[key]}

    files = all_evidence_files(root, target, reader)
    anchors = evidence_anchors(files, reader)
    all_anchors = set().union(*anchors.values())
    changed_evidence = {path for path in changed if matches(path, EVIDENCE_PATTERNS)}
    changed_anchor_map = {}
    for path in changed_evidence:
        changed_anchor_map[path] = set(AC_ID_RE.findall(reader(path)))
    rows = changed_active_task_rows(root, changed, reader)

    errors = []
    for key in sorted(added | modified):
        touched = any(key in ids for ids in changed_anchor_map.values())
        waived = row_covers(rows, key, require_none=True)
        if not touched and not waived:
            errors.append("%s %s but no changed test evidence or active-task none rationale" % (
                key, "added" if key in added else "modified"
            ))
    for key in sorted(deleted):
        if key in all_anchors:
            errors.append("%s deleted but test evidence still references it" % key)

    prd_changed = "PRD.md" in changed
    if prd_changed and not (added or modified or deleted) and not row_covers(rows, "PRD"):
        errors.append("PRD.md changed without AC diff; changed active task must explain PRD test impact")
    if "DESIGN.md" in changed and not row_covers(rows, "DESIGN"):
        errors.append("DESIGN.md changed without a DESIGN row in a changed active task 测试影响 table")

    if report:
        print(
            "Test impact report: acceptance-criteria=%d, unit=%d, e2e=%d, manual=%d, "
            "changed=%d, added=%d, modified=%d, deleted=%d" % (
                len(new_ac), len(set(new_ac) & anchors["unit"]),
                len(set(new_ac) & anchors["e2e"]), len(set(new_ac) & anchors["manual"]),
                len(added | modified | deleted), len(added), len(modified), len(deleted),
            )
        )
        if added or modified or deleted:
            print("Test impact changes: " + ", ".join(
                ["+" + key for key in sorted(added)] +
                ["~" + key for key in sorted(modified)] +
                ["-" + key for key in sorted(deleted)]
            ))
    return errors


def commit_parent(root, commit):
    resolved = run_git(root, "rev-parse", commit).stdout.strip()
    fields = run_git(root, "rev-list", "--parents", "-n", "1", resolved).stdout.split()
    if not fields or fields[0] != resolved:
        raise RuntimeError("cannot resolve commit parent for %s" % commit)
    return fields[1] if len(fields) > 1 else EMPTY_TREE


def outgoing_commits(root, local_sha, remote_sha, remote):
    if remote_sha != "0" * 40:
        return run_git(root, "rev-list", "--reverse", "%s..%s" % (remote_sha, local_sha)).stdout.splitlines()
    if not remote:
        raise RuntimeError("test impact pre-push: new remote ref requires remote name")
    return run_git(root, "rev-list", "--reverse", local_sha, "--not", "--remotes=%s" % remote).stdout.splitlines()


def pre_push(root, report, remote):
    errors = []
    for line in sys.stdin:
        fields = line.split()
        if len(fields) != 4:
            raise RuntimeError("test impact pre-push: malformed ref update line")
        _local_ref, local_sha, _remote_ref, remote_sha = fields
        if local_sha == "0" * 40:
            continue
        for commit in outgoing_commits(root, local_sha, remote_sha, remote):
            current = evaluate(root, commit_parent(root, commit), commit, report)
            errors.extend(["%s: %s" % (commit[:8], error) for error in current])
    return errors


def fixture(root):
    (root / "tools").mkdir()
    (root / "tasks").mkdir()
    (root / "scripts").mkdir()
    (root / "e2e/specs").mkdir(parents=True)
    run_git(root, "init", "-q")
    run_git(root, "config", "user.email", "test@example.com")
    run_git(root, "config", "user.name", "Test")
    (root / "PRD.md").write_text("# PRD\n\n#### R-01-001 Search\n- AC-01 当查询存在时，系统应当返回结果。\n", encoding="utf-8")
    (root / "DESIGN.md").write_text("# DESIGN\n", encoding="utf-8")
    (root / "scripts/check.mjs").write_text("// R-01-001/AC-01\nassert(true)\n", encoding="utf-8")
    (root / "scripts/acceptance.mjs").write_text("", encoding="utf-8")
    run_git(root, "add", ".")
    run_git(root, "commit", "-qm", "base")


def self_test():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        fixture(root)
        prd = root / "PRD.md"
        check = root / "scripts/check.mjs"

        def reset():
            run_git(root, "reset", "--hard", "-q", "HEAD")
            run_git(root, "clean", "-fdq")

        prd.write_text(prd.read_text(encoding="utf-8").replace("返回结果", "返回排序结果"), encoding="utf-8")
        assert any("modified" in error for error in evaluate(root, "HEAD", "working"))
        check.write_text(check.read_text(encoding="utf-8") + "// updated assertion R-01-001/AC-01\n", encoding="utf-8")
        assert not evaluate(root, "HEAD", "working")
        run_git(root, "add", "PRD.md", "scripts/check.mjs")
        assert not evaluate(root, "HEAD", "index")
        reset()

        prd.write_text(prd.read_text(encoding="utf-8") + "\n#### R-01-002 Export\n- AC-01 当导出存在时，系统应当返回文件。\n", encoding="utf-8")
        assert any("added" in error for error in evaluate(root, "HEAD", "working"))
        (root / "e2e/specs").mkdir(parents=True, exist_ok=True)
        (root / "e2e/specs/export.mjs").write_text("// R-01-002/AC-01\nassert(true)\n", encoding="utf-8")
        assert not evaluate(root, "HEAD", "working")
        reset()

        prd.write_text("# PRD\n", encoding="utf-8")
        assert any("still references" in error for error in evaluate(root, "HEAD", "working"))
        check.write_text("assert(true)\n", encoding="utf-8")
        assert not evaluate(root, "HEAD", "working")
        reset()

        prd.write_text(prd.read_text(encoding="utf-8").replace("返回结果", "返回排序结果"), encoding="utf-8")
        (root / "tasks").mkdir(exist_ok=True)
        task = root / "tasks/T-001-test.md"
        task.write_text(
            "状态: active\n\n## 测试影响\n\n| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |\n"
            "|---|---|---|---|---|\n| R-01-001/AC-01 | wording | UNIT | skip | x |\n",
            encoding="utf-8",
        )
        assert any("modified" in error for error in evaluate(root, "HEAD", "working"))
        task.write_text(
            "状态: active\n\n## 测试影响\n\n| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |\n"
            "|---|---|---|---|---|\n| R-01-001/AC-01 | wording | UNIT | none | wording only; observable behavior unchanged |\n",
            encoding="utf-8",
        )
        assert not evaluate(root, "HEAD", "working")
        reset()

        design = root / "DESIGN.md"
        design.write_text("# DESIGN\nchanged\n", encoding="utf-8")
        assert any("DESIGN.md" in error for error in evaluate(root, "HEAD", "working"))
        (root / "tasks").mkdir(exist_ok=True)
        task = root / "tasks/T-001-test.md"
        task.write_text(
            "状态: active\n\n## 测试影响\n\n| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |\n"
            "|---|---|---|---|---|\n| DESIGN | docs | UNIT | none | behavior unchanged |\n",
            encoding="utf-8",
        )
        assert not evaluate(root, "HEAD", "working")
        reset()

        (root / "marker.txt").write_text("new remote branch\n", encoding="utf-8")
        run_git(root, "add", "marker.txt")
        run_git(root, "commit", "-qm", "new branch commit")
        local = run_git(root, "rev-parse", "HEAD").stdout.strip()
        parent = run_git(root, "rev-parse", "HEAD^").stdout.strip()
        run_git(root, "update-ref", "refs/remotes/origin/main", parent)
        run_git(root, "update-ref", "refs/remotes/other/main", local)
        assert local in outgoing_commits(root, local, "0" * 40, "origin")
        try:
            git_text(root, "missing-ref", "PRD.md")
            raise AssertionError("invalid Git ref must not be treated as a missing path")
        except RuntimeError:
            pass
    print("test impact lint self-test passed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--staged", action="store_true")
    parser.add_argument("--pre-push", action="store_true")
    parser.add_argument("--commit")
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--remote")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    root = Path(run_git(Path.cwd(), "rev-parse", "--show-toplevel").stdout.strip())
    if args.pre_push:
        errors = pre_push(root, args.report, args.remote)
    elif args.commit:
        errors = evaluate(root, commit_parent(root, args.commit), args.commit, args.report)
    else:
        errors = evaluate(root, "HEAD", "index" if args.staged else "working", args.report)
    if errors:
        print("test impact lint failed:")
        for error in errors:
            print("  - " + error)
        return 1
    print("test impact lint passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
