#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
if command -v mise >/dev/null 2>&1; then
  exec mise x -- python "$root/tools/test_impact_lint.py" --pre-push --report
else
  exec python3 "$root/tools/test_impact_lint.py" --pre-push --report
fi
