#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
exec node "$root/tools/xtask.mjs" ci --fast
