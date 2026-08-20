#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"

if ! command -v node >/dev/null 2>&1; then
  echo "dsh-activity-pane check: node not found; cannot verify" >&2
  exit 1
fi

# 单元检查 + client bundle 契约校验（会按 src 重建 .dsh-plugin/client.js）。
exec node "$root/scripts/check.mjs"
