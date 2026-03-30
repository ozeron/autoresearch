#!/bin/bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: install-codex-hooks.sh <repo-root>" >&2
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$1" && pwd)

node "$SCRIPT_DIR/codex-hooks-manager.mjs" install "$REPO_ROOT"
echo "Installed autoresearch hooks into $REPO_ROOT/.codex/hooks.json"
