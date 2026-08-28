#!/usr/bin/env bash
# dsh-activity-pane 完整门禁（C-046、T-085）：快速检查 + 浏览器 E2E。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export PLAYWRIGHT_BROWSERS_PATH=0
exec pnpm verify
