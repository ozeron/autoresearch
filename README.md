# claude-autoresearch

Claude Code plugin for autonomous experiment loops. Port of [pi-autoresearch](./pi-autoresearch/).

Try ideas, measure results, keep improvements, discard failures, repeat forever.

## Install

```bash
claude plugin install /path/to/claude-autoresearch
```

Or add to your project's `.claude/plugins.json`.

### Requirements

- Node.js >= 18
- `jq` (for hook scripts): `brew install jq`
- macOS or Linux (bash required)

## Usage

Tell Claude Code to set up autoresearch for any optimization target:

> "Run autoresearch to optimize the build time of my project"

The plugin will:
1. Ask for (or infer) the goal, command, metric, files in scope, and constraints
2. Create `autoresearch.md` (session manifest) and `autoresearch.sh` (benchmark script)
3. Run the experiment loop autonomously — measuring, committing improvements, reverting failures

### Stopping the Loop

The plugin blocks Claude from stopping while experiments are active. To stop:
- Delete `autoresearch.md` — the loop will end on the next cycle
- Or delete `.autoresearch-active` — allows the current stop to proceed

## How It Works

### MCP Tools

| Tool | Description |
|------|-------------|
| `init_experiment` | Configure session: name, metric, unit, direction |
| `run_experiment` | Execute benchmark command with timeout, run optional checks |
| `log_experiment` | Record result — `keep` auto-commits, `discard`/`crash` suggests revert |
| `show_dashboard` | Display full experiment history table |

### Hooks

- **Stop hook** (`stop-guard.sh`) — blocks stopping when experiments are active
- **SessionStart hook** (`session-start.sh`) — injects session summary on resume

### Files Created in Your Project

| File | Purpose |
|------|---------|
| `autoresearch.md` | Session manifest — goal, metrics, scope, constraints, history |
| `autoresearch.sh` | Benchmark script — runs the workload, outputs metrics |
| `autoresearch.checks.sh` | Optional correctness checks (tests, types, lint) |
| `autoresearch.ideas.md` | Ideas backlog for promising but untried optimizations |
| `autoresearch.jsonl` | Append-only experiment log |

### State Format

Results are stored in `autoresearch.jsonl` (compatible with pi-autoresearch):

```jsonl
{"type":"config","name":"optimize-build","metricName":"duration","metricUnit":"s","bestDirection":"lower"}
{"run":1,"commit":"a3f1c2d","metric":42.3,"metrics":{},"status":"keep","description":"baseline","timestamp":1710331260000,"segment":0}
```

## Development

```bash
cd servers/autoresearch
npm install
npm run build    # compile TypeScript to dist/
npm run dev      # run with tsx (hot reload)
```

The plugin ships with pre-built `dist/` so users don't need a build step.

## Plugin Structure

```
claude-autoresearch/
├── .claude-plugin/plugin.json     Plugin manifest
├── .mcp.json                      MCP server config
├── servers/autoresearch/
│   └── src/
│       ├── index.ts               MCP server entry point
│       ├── types.ts               Type definitions
│       ├── state.ts               JSONL parsing, state reconstruction
│       ├── render.ts              Text dashboard rendering
│       └── tools/
│           ├── init.ts            init_experiment
│           ├── run.ts             run_experiment
│           ├── log.ts             log_experiment
│           └── dashboard.ts       show_dashboard
├── skills/autoresearch-create/
│   └── SKILL.md                   Agent instructions
├── hooks/hooks.json               Hook configuration
└── scripts/
    ├── stop-guard.sh              Stop hook
    └── session-start.sh           SessionStart hook
```

## License

MIT
