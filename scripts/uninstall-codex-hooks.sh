#!/bin/bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
"$REPO_ROOT/skills/autoresearch-create/scripts/uninstall-codex-hooks.sh" "$REPO_ROOT"
