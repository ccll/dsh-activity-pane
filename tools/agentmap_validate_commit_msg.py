#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
from pathlib import Path


PAIRS = {
    "⭐": "功能",
    "✨": "改进",
    "🐛": "修复",
    "📝": "文档",
    "🧪": "测试",
    "📌": "计划",
    "🧹": "维护",
    "⚙️": "配置",
    "♻️": "重构",
    "🚀": "发布",
}
SUBJECT = re.compile(
    r"^(?P<emoji>\S+) (?P<type>[^\s(]+)"
    r"\((?P<scope>[a-z0-9][a-z0-9-]*)\): (?P<message>.+)$"
)
EXCEPTIONS = ("Merge ", "Revert ", "fixup! ", "squash! ")
REQUIRED_HEADINGS = {"原因", "影响", "取舍"}


def fail(message: str) -> int:
    print(f"commit-msg: {message}. See CONVENTIONS.md#Git-提交规范", file=sys.stderr)
    return 1


def validate(lines: list[str]) -> int:
    if not lines:
        return fail("empty commit message")
    subject = lines[0].strip()
    if subject.startswith(EXCEPTIONS):
        return 0
    match = SUBJECT.fullmatch(subject)
    if not match:
        return fail("expected emoji 中文类型(scope): 中文结果描述")
    if PAIRS.get(match.group("emoji")) != match.group("type"):
        return fail("unknown or mismatched emoji/type")
    if not re.search(r"[\u4e00-\u9fff]", match.group("message")):
        return fail("result description must contain Chinese")
    if len(lines) < 2 or lines[1].strip():
        return fail("subject and body must be separated by a blank line")

    headings: set[str] = set()
    in_code_block = False
    for line in lines[1:]:
        if re.match(r"^\s*```", line):
            in_code_block = not in_code_block
        elif not in_code_block:
            heading = re.fullmatch(r"##\s+(.+?)\s*", line)
            if heading:
                headings.add(heading.group(1))
    missing = REQUIRED_HEADINGS - headings
    if missing:
        return fail("missing body sections: " + "、".join(sorted(missing)))
    return 0


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: agentmap_validate_commit_msg.py <commit-msg-file>")
    return validate(Path(sys.argv[1]).read_text(encoding="utf-8").splitlines())


if __name__ == "__main__":
    raise SystemExit(main())
