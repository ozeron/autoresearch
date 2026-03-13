#!/bin/bash
# SessionStart hook: inject autoresearch context on resume
# No jq dependency — uses grep for counting

INPUT=$(cat)
CWD=$(echo "$INPUT" | grep -o '"cwd"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"cwd"\s*:\s*"//;s/"$//')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

JSONL="$PROJECT_DIR/autoresearch.jsonl"
[ -f "$JSONL" ] || exit 0

# Count runs and kept (grep-based, no jq)
TOTAL=$(grep -c '"run"' "$JSONL" 2>/dev/null || echo 0)
KEPT=$(grep -c '"keep"' "$JSONL" 2>/dev/null || echo 0)
[ "$TOTAL" -eq 0 ] 2>/dev/null && exit 0

MSG="Autoresearch session detected: $TOTAL runs, $KEPT kept."
MSG="$MSG Read autoresearch.md for full context and continue the experiment loop."
MSG="$MSG NEVER STOP — loop until interrupted."

[ -f "$PROJECT_DIR/autoresearch.checks.sh" ] && MSG="$MSG Backpressure checks active (autoresearch.checks.sh) — you cannot keep results when checks fail."
[ -f "$PROJECT_DIR/autoresearch.ideas.md" ] && MSG="$MSG Ideas backlog exists (autoresearch.ideas.md) — check for untried ideas."

# Clean up stale sentinel
rm -f "$PROJECT_DIR/.autoresearch-active" 2>/dev/null

echo "$MSG"
