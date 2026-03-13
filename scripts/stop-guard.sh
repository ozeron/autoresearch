#!/bin/bash
# Stop hook: block stopping when autoresearch loop is active
# No jq dependency — uses grep for JSON parsing

INPUT=$(cat)

# Prevent infinite loop
echo "$INPUT" | grep -q '"stop_hook_active"\s*:\s*true' && exit 0

# Extract cwd from input (simple grep — good enough for flat JSON)
CWD=$(echo "$INPUT" | grep -o '"cwd"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"cwd"\s*:\s*"//;s/"$//')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

# All three must exist: sentinel, manifest, config
[ -f "$PROJECT_DIR/.autoresearch-active" ] || exit 0
[ -f "$PROJECT_DIR/autoresearch.md" ] || exit 0
[ -f "$PROJECT_DIR/autoresearch.jsonl" ] || exit 0
grep -q '"type".*"config"' "$PROJECT_DIR/autoresearch.jsonl" 2>/dev/null || exit 0

# Block — reason is fed back to Claude as context
echo '{"decision": "block", "reason": "BLOCKED: Autoresearch loop is ACTIVE. You MUST NOT stop. Your next action MUST be a tool call — either run_experiment to test your next idea, or read autoresearch.md / autoresearch.ideas.md to find ideas. Do NOT summarize results. Do NOT ask the user if they want to continue. Do NOT present a final report. Just pick the next experiment and run it immediately."}'
