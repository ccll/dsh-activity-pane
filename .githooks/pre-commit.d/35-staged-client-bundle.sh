#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
if ! command -v node >/dev/null 2>&1; then
  echo "staged client bundle check: node not found; cannot verify" >&2
  exit 1
fi
exec node "$root/scripts/check-staged-client.mjs"
