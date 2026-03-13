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
      "args": ["${CLAUDE_PLUGIN_ROOT}/servers/autoresearch/dist/index.js"]
    }
  }
}
```

## MCP Server — 4 Tools

### In-Memory State

The MCP server process persists between tool calls. It maintains:

- `state: ExperimentState` — current session state (results, bestMetric, direction, etc.)
- `lastRunChecks: { pass: boolean, output: string } | null` — result of last `run_experiment`'s checks. Used by `log_experiment` to gate "keep" status. Reset to `null` after each `log_experiment` call.

State is reconstructed from `autoresearch.jsonl` on server startup.

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
- On first init: creates file. On re-init: appends (new segment).
- Resets in-memory results array, bestMetric, secondaryMetrics for new segment
- Segment counter derived from number of config lines (same as pi reconstruction)

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
- Spawns shell process, captures stdout/stderr, measures wall-clock duration
- Detects pass/fail via exit code
- If `autoresearch.checks.sh` exists AND benchmark passed: runs checks with separate timeout
- Truncates output to last 80 lines
- Stores result in `lastRunChecks` in-memory state (consumed by `log_experiment`)

**Returns:**
```typescript
{
  durationSeconds: number,
  passed: boolean,
  crashed: boolean,
  timedOut: boolean,
  tailOutput: string,         // last 80 lines of stdout+stderr
  checksPass: boolean | null, // null if no checks script
  checksTimedOut: boolean | null,
  checksDuration: number | null,
  checksOutput: string | null,
}
```

### `log_experiment`

Records an experiment result and manages git state.

**Input:**
```typescript
{
  commit: z.string().describe("Git commit hash (short, 7 chars) — agent passes current HEAD hash"),
  metric: z.number().describe("Primary metric value. 0 for crashes."),
  metrics: z.record(z.number()).optional().describe("Secondary metrics dict"),
  status: z.enum(["keep", "discard", "crash", "checks_failed"]),
  description: z.string().describe("What was tried"),
  force: z.boolean().default(false).describe("Force keep even with new secondary metrics"),
}
```

**Behavior:**
- Validates: blocks "keep" if `lastRunChecks.pass === false` (in-memory gating)
- Validates: secondary metrics keys must match previous runs (unless force=true)
- On "keep":
  1. `git add -A && git commit -m "<description>\n\nAutoresearch: <JSON trailer>"`
  2. Capture new commit hash via `git rev-parse --short=7 HEAD`
  3. Update experiment.commit with actual hash
- On "discard"/"crash"/"checks_failed":
  - Does NOT auto-revert (matches pi behavior)
  - Returns message: "Git: skipped commit (<status>) — revert with `git checkout -- .`"
  - Agent is responsible for reverting (skill instructions say to revert)
- Appends result to `autoresearch.jsonl` matching pi format: `{ "run": N, "commit", "metric", "metrics", "status", "description", "timestamp", "segment" }`
  - Note: pi does NOT use `"type": "result"` — result lines have `"run"` field instead
- Resets `lastRunChecks = null`
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

Displays full experiment history. New tool (no pi equivalent — replaces TUI widget).

**Input:** none

**Behavior:** Reads in-memory state (reconstructed from `autoresearch.jsonl`).

**Returns:** Full markdown table with ALL runs + secondary metrics columns + summary stats.

## State Model

Matches pi-autoresearch JSONL format for compatibility. `autoresearch.jsonl` append-only log in project root.

**Config header line (pi format):**
```json
{ "type": "config", "name": "optimize-build", "metricName": "duration", "metricUnit": "s", "bestDirection": "lower" }
```

Note: segment is NOT stored in config line (matches pi). Segment counter is derived during reconstruction by counting config lines.

**Result line (pi format):**
```json
{ "run": 5, "commit": "a3f1c2d", "metric": 33.1, "metrics": { "memory_mb": 128 }, "status": "keep", "description": "inlined the hot loop", "timestamp": "2026-03-13T12:01:00Z", "segment": 0 }
```

Note: result lines use `"run": N` (not `"type": "result"`), matching pi's format. Reconstruction differentiates config vs result lines by checking for `"type": "config"` key.

State reconstruction: read file top-to-bottom. Config headers (lines with `"type": "config"`) mark segment boundaries. Each new config resets the current segment's results but preserves history.

## Hooks

`hooks/hooks.json`:
```json
{
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

```bash
#!/bin/bash
INPUT=$(cat)

# Extract project dir from env or stdin
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

# Prevent infinite loop — check stop_hook_active field
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

# Check if autoresearch session is active
JSONL="$PROJECT_DIR/autoresearch.jsonl"
if [ ! -f "$JSONL" ]; then
  exit 0  # No session, allow stop
fi

# Check for active config (last config line exists = session active)
LAST_CONFIG=$(grep '"type":"config"' "$JSONL" | tail -1)
if [ -z "$LAST_CONFIG" ]; then
  exit 0  # No config, allow stop
fi

# Check if autoresearch.md exists (session manifest = loop mode)
if [ ! -f "$PROJECT_DIR/autoresearch.md" ]; then
  exit 0  # No manifest, allow stop
fi

# Session is active — block stop (exit 2 = blocking error, stderr fed to Claude)
echo "Autoresearch loop is active. Continue experimenting. Read autoresearch.md if you need context." >&2
exit 2
```

**Safety valve:** User can delete `autoresearch.md` to stop the loop. The hook checks for this file, so removing it allows Claude to stop normally. This mirrors pi's behavior where the user could manually stop the agent.

### `session-start.sh`

```bash
#!/bin/bash
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"

JSONL="$PROJECT_DIR/autoresearch.jsonl"

if [ ! -f "$JSONL" ]; then
  exit 0  # No session
fi

# Count results (lines without "type":"config")
TOTAL=$(grep -c '"run":' "$JSONL" 2>/dev/null || echo 0)
KEPT=$(grep -c '"status":"keep"' "$JSONL" 2>/dev/null || echo 0)

if [ "$TOTAL" -eq 0 ]; then
  exit 0
fi

# Output injected into Claude's context (stdout on exit 0)
echo "Autoresearch session detected: $TOTAL runs, $KEPT kept. Read autoresearch.md for context and continue the experiment loop."
exit 0
```

## Skill — `autoresearch-create/SKILL.md`

Ported from pi-autoresearch with these adaptations:

1. **Tool references** updated — pi's `init_experiment`/`run_experiment`/`log_experiment` become `mcp__autoresearch__init_experiment`, etc. in descriptions
2. **Dashboard reference** changed from "ctrl+x" to "call `show_dashboard`" (or `mcp__autoresearch__show_dashboard`)
3. **Loop rules** identical — LOOP FOREVER, primary metric is king, simpler is better, don't thrash, etc.
4. **Setup workflow** identical — 5 steps, same file conventions
5. **All file conventions preserved** — `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.ideas.md`, `autoresearch.jsonl`
6. **Git revert responsibility** — skill explicitly instructs agent to run `git checkout -- .` on discard/crash/checks_failed (matching pi behavior where the tool tells agent to revert)

Full SKILL.md content to be ported line-by-line from the pi original, preserving all loop rules, setup steps, file templates, and behavioral instructions.

## Server Dependencies

`servers/autoresearch/package.json`:
```json
{
  "name": "autoresearch-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
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

- Plugin ships with pre-built `dist/` so users don't need to build
- MCP server entry: `servers/autoresearch/dist/index.js`
- Can be installed via `claude plugin install` from marketplace or `--plugin-dir` for local dev

## Key Differences from pi-autoresearch

| Aspect | pi-autoresearch | claude-autoresearch |
|--------|----------------|---------------------|
| Platform | pi coding agent | Claude Code |
| Tools | pi extension API | MCP server (stdio) |
| Dashboard | TUI widget + fullscreen overlay | In-conversation text tables via `show_dashboard` tool |
| Shortcuts | Ctrl+X, Ctrl+Shift+X | `show_dashboard` tool call |
| Auto-resume | `agent_end` event handler | `Stop` hook (exit 2 blocks stop) |
| Session inject | `before_agent_start` hook | `SessionStart` hook (stdout → context) |
| Skill | pi skill system | Claude Code skill (SKILL.md) |
| Language | TypeScript (pi APIs) | TypeScript (MCP SDK) |
| State format | autoresearch.jsonl | autoresearch.jsonl (identical field names) |
| Git revert | Agent does it (tool suggests) | Agent does it (tool suggests) — same |
| Stop override | User stops agent manually | User deletes `autoresearch.md` |

## Known Limitations

1. **No colors in dashboard** — Claude Code conversation doesn't support ANSI colors. Uses plain text with `+`/`-` symbols for delta direction.
2. **No live-updating widget** — dashboard only shown when `log_experiment` or `show_dashboard` is called, not continuously visible.
3. **Secondary metrics always assume lower is better** — inherited from pi's rendering logic, documented as known limitation.
4. **Stop hook requires `jq`** — hook scripts use `jq` for JSON parsing. Users need `jq` installed (`brew install jq` on macOS).
