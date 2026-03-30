#!/bin/bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
"$REPO_ROOT/skills/autoresearch-create/scripts/install-codex-hooks.sh" "$REPO_ROOT"
