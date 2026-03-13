#!/bin/bash
# Guard: check jq is available
command -v jq >/dev/null 2>&1 || { echo "autoresearch hooks require jq. Install: brew install jq" >&2; exit 0; }

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

JSONL="$PROJECT_DIR/autoresearch.jsonl"

if [ ! -f "$JSONL" ]; then
  exit 0
fi

# Count results using jq for robustness
TOTAL=$(jq -s '[.[] | select(.run != null)] | length' "$JSONL" 2>/dev/null || echo 0)
KEPT=$(jq -s '[.[] | select(.status == "keep")] | length' "$JSONL" 2>/dev/null || echo 0)

if [ "$TOTAL" -eq 0 ]; then
  exit 0
fi

# Build context message
MSG="Autoresearch session detected: $TOTAL runs, $KEPT kept."
MSG="$MSG Read autoresearch.md for full context and continue the experiment loop."
MSG="$MSG NEVER STOP — loop until interrupted."

# Check if checks file exists
if [ -f "$PROJECT_DIR/autoresearch.checks.sh" ]; then
  MSG="$MSG Backpressure checks active (autoresearch.checks.sh) — you cannot keep results when checks fail."
fi

# Check for ideas backlog
if [ -f "$PROJECT_DIR/autoresearch.ideas.md" ]; then
  MSG="$MSG Ideas backlog exists (autoresearch.ideas.md) — check for untried ideas."
fi

# Clean up stale sentinel file on fresh session start
rm -f "$PROJECT_DIR/.autoresearch-active" 2>/dev/null

echo "$MSG"
exit 0
