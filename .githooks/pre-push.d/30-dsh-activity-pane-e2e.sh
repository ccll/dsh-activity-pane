#!/usr/bin/env bash
# dsh-activity-pane 浏览器 E2E 套件（T-083）：隔离环境 + mock LLM + Playwright。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export PLAYWRIGHT_BROWSERS_PATH=0
exec node e2e/run.mjs
