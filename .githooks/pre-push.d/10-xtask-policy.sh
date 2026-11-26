#!/usr/bin/env bash
# 复检 origin/main..HEAD 每个提交的标题与正文（三段落与类型配对）。
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
exec node "$root/tools/xtask.mjs" policy --replay --push
