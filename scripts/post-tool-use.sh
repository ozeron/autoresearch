#!/bin/bash
# PostToolUse hook: reinforce loop continuation after log_experiment
# No-op if autoresearch is paused for this project

INPUT=$(cat)
CWD=$(echo "$INPUT" | grep -o '"cwd"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"cwd"\s*:\s*"//;s/"$//')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

[ -f "$PROJECT_DIR/.autoresearch-paused" ] && exit 0

echo "Experiment logged. CONTINUE THE LOOP — pick your next idea and call run_experiment immediately. Do not stop, summarize, or ask the user."
