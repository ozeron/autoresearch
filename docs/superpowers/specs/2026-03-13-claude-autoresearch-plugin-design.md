# Design: claude-autoresearch Plugin

Port of [pi-autoresearch](./pi-autoresearch/) as a Claude Code plugin.

## Goal

Autonomous experiment loop for Claude Code: try ideas, measure results, keep improvements, discard failures, repeat forever. Faithful port of pi-autoresearch adapted to Claude Code's plugin model (MCP server + skill + hooks).

## Decisions

- **MCP server (TypeScript)** for 4 tools — typed schemas, deterministic git/JSONL operations
- **Skill** for agent instructions — ported as closely as possible from pi's SKILL.md
- **Hooks** for auto-resume (Stop) and session state injection (SessionStart)
- **In-conversation text tables** for dashboard (no external UI)
- **`@modelcontextprotocol/sdk`** + **`zod`** for MCP server
- **`autoresearch.jsonl`** append-only log — matching pi's field names for compatibility
- **macOS/Linux only** — shell execution requires `bash`

## Plugin Structure

```
claude-autoresearch/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── servers/
│   └── autoresearch/
│       ├── src/
│       │   ├── index.ts              ← MCP server entry, tool registration
│       │   ├── tools/
│       │   │   ├── init.ts           ← init_experiment
│       │   │   ├── run.ts            ← run_experiment
│       │   │   ├── log.ts            ← log_experiment
│       │   │   └── dashboard.ts      ← show_dashboard
│       │   ├── state.ts              ← JSONL parsing, state reconstruction
│       │   └── render.ts             ← text table rendering
│       ├── package.json
│       └── tsconfig.json
├── skills/
│   └── autoresearch-create/
│       └── SKILL.md                  ← ported from pi, adapted for Claude Code
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── stop-guard.sh                ← Stop hook: keep looping if session active
│   └── session-start.sh             ← SessionStart hook: inject state summary
└── README.md
```

## Plugin Manifest

`.claude-plugin/plugin.json`:
```json
{
  "name": "autoresearch",
  "version": "1.0.0",
  "description": "Autonomous experiment loop: try ideas, keep what works, discard what doesn't, never stop.",
  "author": {
    "name": "ozeron"
  },
  "license": "MIT",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

## MCP Configuration

`.mcp.json`:
```json
{
  "mcpServers": {
    "autoresearch": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/servers/autoresearch/dist/index.js"],
      "env": {
        "PROJECT_DIR": "${CLAUDE_PROJECT_DIR}"
      }
    }
  }
}
```

## Types

Ported from pi with minimal changes:

```typescript
interface MetricDef {
  name: string;
  unit: string;
}

interface ExperimentResult {
  commit: string;
  metric: number;
  metrics: Record<string, number>;
  status: "keep" | "discard" | "crash" | "checks_failed";
  description: string;
  timestamp: number;
  segment: number;
}

interface ExperimentState {
  results: ExperimentResult[];
  bestMetric: number | null;
  bestDirection: "lower" | "higher";
  metricName: string;
  metricUnit: string;
  secondaryMetrics: MetricDef[];
  name: string | null;
  currentSegment: number;
}

interface RunDetails {
  command: string;
  exitCode: number | null;
  durationSeconds: number;
  passed: boolean;
  crashed: boolean;
  timedOut: boolean;
  tailOutput: string;
  checksPass: boolean | null;
  checksTimedOut: boolean;    // false when checks didn't run (matches pi)
  checksOutput: string;       // "" when checks didn't run (matches pi)
  checksDuration: number;     // 0 when checks didn't run (matches pi)
}
```

Note: `checksTimedOut`, `checksOutput`, `checksDuration` use default values (not nullables) to match pi's behavior.

## MCP Server — 4 Tools

### Working Directory

The MCP server uses `process.cwd()` as the project root (inherited from Claude Code's process). The `PROJECT_DIR` env var from `.mcp.json` is available as override. On startup, log the resolved project directory for debugging.

### In-Memory State

The MCP server process persists between tool calls (MCP stdio transport is long-lived). It maintains:

- `state: ExperimentState` — current session state (results, bestMetric, direction, etc.)
- `lastRunChecks: { pass: boolean, output: string, duration: number } | null` — result of last `run_experiment`'s checks. Used by `log_experiment` to gate "keep" status. Reset to `null` after each `log_experiment` call.
- `experimentsThisSession: number` — incremented by `log_experiment`, used by Stop hook via sentinel file.

**Crash resilience:** `lastRunChecks` is also persisted to `.autoresearch-last-run.json` alongside JSONL. On startup, if the file exists, reload it. `log_experiment` deletes it after consuming.

State is reconstructed from `autoresearch.jsonl` on server startup.

### Process Cleanup

The server registers `process.on('exit', ...)` to kill any running child processes (experiment commands). Uses `child_process.spawn` with proper signal handling to avoid orphan processes.

### `init_experiment`

Configures a new experiment session or re-initializes with a new baseline.

**Input:**
```typescript
{
  name: z.string().describe("Experiment name"),
  metric_name: z.string().describe("Primary metric display name (e.g. 'total_µs', 'bundle_kb')"),
  metric_unit: z.string().optional().describe("Unit: 'µs', 'ms', 's', 'kb', 'mb', or '' for unitless. Default: ''"),
  direction: z.string().optional().describe("'lower' or 'higher' is better. Default: 'lower'"),
}
```

**Behavior:**
- Writes config header to `autoresearch.jsonl` matching pi format: `{ "type": "config", "name", "metricName", "metricUnit", "bestDirection" }`
- On first init (`state.results.length === 0`): creates/overwrites file. On re-init: appends (new segment).
- Resets in-memory results array, bestMetric, secondaryMetrics for new segment
- Segment counter: during reconstruction, count config lines. If results exist when a new config is encountered, increment segment. First config = segment 0. (Matches pi exactly.)

**Returns:** Confirmation text with session info.

### `run_experiment`

Executes a timed benchmark command.

**Input:**
```typescript
{
  command: z.string().describe("Shell command to run"),
  timeout_seconds: z.number().default(600).describe("Max seconds for benchmark"),
  checks_timeout_seconds: z.number().default(300).describe("Max seconds for checks script"),
}
```

**Behavior:**
- Spawns `bash -c <command>` via `child_process.spawn`, captures stdout/stderr, measures wall-clock duration
- Detects pass/fail: `benchmarkPassed = exitCode === 0 && !killed`
- If `autoresearch.checks.sh` exists AND benchmark passed: runs checks with separate timeout
- Truncates output to last 80 lines
- Stores result in `lastRunChecks` in-memory state AND persists to `.autoresearch-last-run.json`
- Overall `passed = benchmarkPassed && (checksPass === null || checksPass)`

**Returns:**
```typescript
{
  exitCode: number | null,
  durationSeconds: number,
  passed: boolean,
  crashed: boolean,
  timedOut: boolean,
  tailOutput: string,         // last 80 lines of stdout+stderr
  checksPass: boolean | null, // null if no checks script
  checksTimedOut: boolean,    // false if checks didn't run
  checksDuration: number,     // 0 if checks didn't run
  checksOutput: string,       // "" if checks didn't run
}
```

Also returns human-readable text summary (matching pi's format: TIMEOUT/FAILED/PASSED status, current best metric, output tail, checks output if failed).

### `log_experiment`

Records an experiment result and manages git state.

**Input:**
```typescript
{
  commit: z.string().describe("Git commit hash (short, 7 chars)"),
  metric: z.number().describe("Primary metric value. 0 for crashes."),
  metrics: z.record(z.number()).optional().describe("Secondary metrics dict"),
  status: z.enum(["keep", "discard", "crash", "checks_failed"]),
  description: z.string().describe("What was tried"),
  force: z.boolean().default(false).describe("Force keep even with new secondary metrics"),
}
```

**Behavior:**
- Validates: blocks "keep" if `lastRunChecks` exists and `!lastRunChecks.pass` (in-memory gating)
- Validates: secondary metrics keys must match previous runs (unless force=true)
- `experiment.commit = params.commit.slice(0, 7)` (matches pi)
- On "keep":
  1. `git add -A && git commit -m "<description>\n\nResult: <JSON trailer>"`
  2. Capture new commit hash via `git rev-parse --short=7 HEAD`
  3. Update experiment.commit with actual hash
- On "discard"/"crash"/"checks_failed":
  - Does NOT auto-revert (matches pi behavior)
  - Returns message: "Git: skipped commit (<status>) — revert with `git checkout -- .`"
  - Agent is responsible for reverting (skill instructions say to revert)
- Appends result to `autoresearch.jsonl` AFTER git commit (so hash is correct), matching pi format: `{ "run": N, ...experiment }`
  - Note: pi does NOT use `"type": "result"` — result lines have `"run"` field, spread with ExperimentResult fields
- Increments `experimentsThisSession` counter
- Writes `.autoresearch-active` sentinel file (for Stop hook to detect experiments ran)
- Resets `lastRunChecks = null`, deletes `.autoresearch-last-run.json`
- Updates in-memory state (bestMetric, results array)

**Returns:** Compact dashboard — summary line + last 6 runs table:
```
autoresearch: 12 runs | 8 kept | 3 discarded | 1 crash
baseline: 42.3s | best: 31.1s (-26.5%)

 #  | commit  | metric  | delta  | status  | description
----|---------|---------|--------|---------|---------------------------
 7  | a3f1c2d | 33.1s   | -21.7% | keep    | inline hot path
 8  | b7e4a1f | 35.0s   | -17.3% | discard | tried loop unrolling
 9  | -       | crash   |   -    | crash   | segfault in allocator
 10 | c2d8f3a | 32.0s   | -24.3% | keep    | reduce allocations
 11 | d1e9b4c | 32.1s   | -24.1% | discard | marginal, simpler without
 12 | e5f2a7b | 31.1s   | -26.5% | keep    | cache lookup table
```

### `show_dashboard`

Displays full experiment history. New tool (no pi equivalent — replaces TUI widget). **Human-triggered only** — not called automatically during the loop. The skill should NOT instruct the agent to call this during normal loop operation.

**Input:**
```typescript
{
  last_n: z.number().optional().describe("Show last N runs. Default: all runs, max 50 per page."),
}
```

**Behavior:** Reads in-memory state (reconstructed from `autoresearch.jsonl`). Paginates output to avoid excessive context token consumption.

**Returns:** Full markdown table with runs + secondary metrics columns + summary stats.

## State Model

Matches pi-autoresearch JSONL format for compatibility. `autoresearch.jsonl` append-only log in project root.

**Config header line (pi format):**
```json
{ "type": "config", "name": "optimize-build", "metricName": "duration", "metricUnit": "s", "bestDirection": "lower" }
```

Note: segment is NOT stored in config line (matches pi). Segment counter is derived during reconstruction: increment when a config line is encountered after results exist.

**Result line (pi format):**
```json
{ "run": 5, "commit": "a3f1c2d", "metric": 33.1, "metrics": { "memory_mb": 128 }, "status": "keep", "description": "inlined the hot loop", "timestamp": 1710331260000, "segment": 0 }
```

Note: result lines use `"run": N` (not `"type": "result"`), matching pi's format. `timestamp` is `Date.now()` (epoch ms), matching pi. Reconstruction differentiates config vs result lines by checking for `"type": "config"` key.

State reconstruction: read file top-to-bottom. Config headers mark segment boundaries. Each new config resets the current segment's results but preserves history. Secondary metric units auto-detected from name (`_µs`/`µs` → `"µs"`, `_ms`/`ms` → `"ms"`, `_s`/`sec` → `"s"`).

## Hooks

`hooks/hooks.json`:
```json
{
  "description": "Autoresearch loop hooks: prevent stopping during active experiments and inject session state on start",
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/stop-guard.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

### Environment Variables

Hook scripts receive JSON on stdin (common fields: `session_id`, `cwd`, `hook_event_name`).

Available env vars in Claude Code hooks:
- `$CLAUDE_PROJECT_DIR` — project root (documented in Claude Code hooks reference)

The `cwd` field from stdin JSON can be used as fallback if env var is unavailable:
```bash
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"
```

### `stop-guard.sh`

Uses JSON output (`exit 0` + `decision: block`) instead of `exit 2` for proper Claude feedback. Checks `.autoresearch-active` sentinel file to only block stops when experiments actually ran this session (mirrors pi's `experimentsThisSession > 0` guard).

```bash
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
  exit 0  # No experiments ran, allow stop
fi

# Check if autoresearch.md exists (session manifest = loop mode)
if [ ! -f "$PROJECT_DIR/autoresearch.md" ]; then
  exit 0  # No manifest, allow stop
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
```

**Safety valves:**
1. Delete `autoresearch.md` to stop the loop
2. Delete `.autoresearch-active` to allow stop without removing the manifest
3. If no experiments ran this session, stop is always allowed (prevents blocking manual stops)

### `session-start.sh`

Injects richer context including checks file status and never-stop directive (replaces pi's `before_agent_start` system prompt injection).

```bash
#!/bin/bash
# Guard: check jq is available
command -v jq >/dev/null 2>&1 || { echo "autoresearch hooks require jq. Install: brew install jq" >&2; exit 0; }

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

JSONL="$PROJECT_DIR/autoresearch.jsonl"

if [ ! -f "$JSONL" ]; then
  exit 0  # No session
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
```

## Skill — `autoresearch-create/SKILL.md`

Ported from pi-autoresearch with these adaptations:

1. **Tool references** updated — pi's `init_experiment`/`run_experiment`/`log_experiment` become `mcp__autoresearch__init_experiment`, etc. in descriptions
2. **Dashboard reference** changed from "ctrl+x" to "call `show_dashboard`" (human-triggered only, not part of the automated loop)
3. **Loop rules** identical — LOOP FOREVER, primary metric is king, simpler is better, don't thrash, etc.
4. **Setup workflow** identical — 5 steps, same file conventions
5. **All file conventions preserved** — `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.ideas.md`, `autoresearch.jsonl`
6. **Git revert responsibility** — skill explicitly instructs agent to run `git checkout -- .` on discard/crash/checks_failed (matching pi behavior where the tool tells agent to revert)
7. **Never-stop reinforcement** — skill includes "NEVER STOP" directive matching pi's system prompt injection

Full SKILL.md content to be ported line-by-line from the pi original, preserving all loop rules, setup steps, file templates, and behavioral instructions.

## Server Dependencies

`servers/autoresearch/package.json`:
```json
{
  "name": "autoresearch-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0"
  }
}
```

## Build & Distribution

- Plugin ships with pre-built `dist/` committed to repo (standard for Claude Code plugins — no build step for users)
- Add `dist/` to `.gitattributes` with `linguist-generated=true`
- MCP server entry: `servers/autoresearch/dist/index.js`
- Can be installed via `claude plugin install` from marketplace or `--plugin-dir` for local dev
- Hook scripts must have executable permissions: `chmod +x scripts/*.sh`
- Development setup: `cd servers/autoresearch && npm install && npm run build`

## Key Differences from pi-autoresearch

| Aspect | pi-autoresearch | claude-autoresearch |
|--------|----------------|---------------------|
| Platform | pi coding agent | Claude Code |
| Tools | pi extension API | MCP server (stdio) |
| Dashboard | TUI widget + fullscreen overlay | In-conversation text tables via `show_dashboard` tool |
| Shortcuts | Ctrl+X, Ctrl+Shift+X | `show_dashboard` tool call (human-triggered) |
| Auto-resume | `agent_end` event → resume message | `Stop` hook blocks stop (JSON decision) |
| Session inject | `before_agent_start` hook | `SessionStart` hook (context injection with checks/ideas status) |
| Experiment guard | `experimentsThisSession > 0` | `.autoresearch-active` sentinel file |
| Skill | pi skill system | Claude Code skill (SKILL.md) |
| Language | TypeScript (pi APIs) | TypeScript (MCP SDK) |
| State format | autoresearch.jsonl | autoresearch.jsonl (identical field names) |
| Git revert | Agent does it (tool suggests) | Agent does it (tool suggests) — same |
| Stop override | User stops agent manually | Delete `autoresearch.md` or `.autoresearch-active` |

## Known Limitations

1. **No colors in dashboard** — Claude Code conversation doesn't support ANSI colors. Uses plain text with `+`/`-` symbols for delta direction.
2. **No live-updating widget** — dashboard only shown when `log_experiment` or `show_dashboard` is called, not continuously visible.
3. **Secondary metrics always assume lower is better** — inherited from pi's rendering logic, documented as known limitation.
4. **Hook scripts require `jq`** — graceful degradation with error message if missing (`brew install jq` on macOS).
5. **macOS/Linux only** — shell execution via `bash` not available on Windows.
6. **Stop hook ≠ pi auto-resume** — pi allows stop + resumes with fresh context (handles context exhaustion). The Stop hook blocks stopping entirely. Claude Code's context compaction partially addresses this, but long sessions may still hit limits. Documented as behavioral approximation.
7. **MCP tool call timeout** — experiments up to 600s. If Claude Code imposes a shorter MCP timeout, long experiments could fail. Document as configuration consideration.
8. **Node.js >=18 required** — MCP server requires Node.js. Documented in `engines` field and README.
9. **`git checkout -- .` does not remove untracked files** — experiments that create new files leave them behind on revert. Matches pi behavior. Agent can `git clean -fd` when appropriate.
