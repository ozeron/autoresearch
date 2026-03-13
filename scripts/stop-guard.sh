#!/bin/bash
# Guard: check jq is available
command -v jq >/dev/null 2>&1 || { echo "autoresearch hooks require jq. Install: brew install jq" >&2; exit 0; }

INPUT=$(cat)

# Extract project dir from env or stdin
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

# Prevent infinite loop — check stop_hook_active field
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

# Check if experiments actually ran this session (sentinel file written by log_experiment)
if [ ! -f "$PROJECT_DIR/.autoresearch-active" ]; then
  exit 0
fi

# Check if autoresearch.md exists (session manifest = loop mode)
if [ ! -f "$PROJECT_DIR/autoresearch.md" ]; then
  exit 0
fi

# Check if autoresearch.jsonl has a config
if [ ! -f "$PROJECT_DIR/autoresearch.jsonl" ]; then
  exit 0
fi

HAS_CONFIG=$(jq -r 'select(.type == "config")' "$PROJECT_DIR/autoresearch.jsonl" 2>/dev/null | head -1)
if [ -z "$HAS_CONFIG" ]; then
  exit 0
fi

# Session is active and experiments ran — block stop with JSON decision
echo '{"decision": "block", "reason": "Autoresearch loop is active. Continue experimenting. Read autoresearch.md if you need context."}'
exit 0
