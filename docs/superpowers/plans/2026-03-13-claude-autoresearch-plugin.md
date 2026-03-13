# claude-autoresearch Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port pi-autoresearch as a Claude Code plugin with MCP server (4 tools), skill, and hooks.

**Architecture:** TypeScript MCP server using @modelcontextprotocol/sdk + zod, Claude Code plugin packaging with SKILL.md and bash hook scripts.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, zod, Node.js >=18, bash (hooks)

**Spec:** `docs/superpowers/specs/2026-03-13-claude-autoresearch-plugin-design.md`

---

## Task 1: Plugin Scaffold & Build Configuration

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `servers/autoresearch/package.json`
- Create: `servers/autoresearch/tsconfig.json`
- Create: `.gitattributes`

- [ ] **Step 1: Create plugin manifest**

Create `.claude-plugin/plugin.json`:
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

- [ ] **Step 2: Create MCP config**

Create `.mcp.json`:
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

- [ ] **Step 3: Create server package.json**

Create `servers/autoresearch/package.json`:
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

- [ ] **Step 4: Create tsconfig.json**

Create `servers/autoresearch/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Create .gitattributes**

```
servers/autoresearch/dist/** linguist-generated=true
```

- [ ] **Step 6: Install dependencies**

Run: `cd servers/autoresearch && npm install`

- [ ] **Step 7: Commit scaffold**

```bash
git add .claude-plugin .mcp.json servers/autoresearch/package.json servers/autoresearch/tsconfig.json servers/autoresearch/package-lock.json .gitattributes
git commit -m "feat: plugin scaffold with MCP server build config"
```

---

## Task 2: Types & State Module

**Files:**
- Create: `servers/autoresearch/src/types.ts`
- Create: `servers/autoresearch/src/state.ts`

- [ ] **Step 1: Create types.ts**

Port types directly from pi's index.ts (lines 31-80). All interfaces: `MetricDef`, `ExperimentResult`, `ExperimentState`, `RunDetails`, `LastRunChecks`. Add helper type for JSONL config line.

```typescript
export interface MetricDef {
  name: string;
  unit: string;
}

export interface ExperimentResult {
  commit: string;
  metric: number;
  metrics: Record<string, number>;
  status: "keep" | "discard" | "crash" | "checks_failed";
  description: string;
  timestamp: number;
  segment: number;
}

export interface ExperimentState {
  results: ExperimentResult[];
  bestMetric: number | null;
  bestDirection: "lower" | "higher";
  metricName: string;
  metricUnit: string;
  secondaryMetrics: MetricDef[];
  name: string | null;
  currentSegment: number;
}

export interface RunDetails {
  command: string;
  exitCode: number | null;
  durationSeconds: number;
  passed: boolean;
  crashed: boolean;
  timedOut: boolean;
  tailOutput: string;
  checksPass: boolean | null;
  checksTimedOut: boolean;
  checksOutput: string;
  checksDuration: number;
}

export interface LastRunChecks {
  pass: boolean;
  output: string;
  duration: number;
}
```

- [ ] **Step 2: Create state.ts**

State module with:
- `createDefaultState(): ExperimentState` — returns fresh state
- `reconstructState(jsonlPath: string): { state: ExperimentState, lastRunChecks: LastRunChecks | null }` — reads JSONL file, parses config + result lines, builds state. Port logic from pi index.ts lines 520-617.
- `findBaselineMetric(results, segment): number | null` — first result in segment
- `currentResults(results, segment): ExperimentResult[]` — filter by segment
- `isBetter(current, best, direction): boolean`
- `detectMetricUnit(name: string): string` — auto-detect unit from metric name (_µs, _ms, _s, sec)

Key reconstruction logic: read JSONL line by line. Lines with `type: "config"` update state config. Other lines (with `run` field) are result lines pushed to results array. Segment increments when a config line appears after results exist.

Also loads `.autoresearch-last-run.json` for crash resilience of lastRunChecks.

- [ ] **Step 3: Verify build compiles**

Run: `cd servers/autoresearch && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add servers/autoresearch/src/types.ts servers/autoresearch/src/state.ts
git commit -m "feat: types and state reconstruction module"
```

---

## Task 3: Render Module (Text Dashboard)

**Files:**
- Create: `servers/autoresearch/src/render.ts`

- [ ] **Step 1: Create render.ts**

Port formatting helpers from pi index.ts (lines 156-200):
- `commas(n: number): string` — comma-separated thousands
- `fmtNum(n: number, decimals?: number): string` — format with commas + optional decimals
- `formatNum(value: number | null, unit: string): string` — format metric value with unit

Add dashboard renderers:
- `renderCompactDashboard(state: ExperimentState, lastN?: number): string` — summary line + last N runs table (default 6). Used by `log_experiment` return.
- `renderFullDashboard(state: ExperimentState, lastN?: number): string` — full table with all runs + secondary metrics. Used by `show_dashboard`. Default lastN=50 for pagination.

Table format (plain text, no ANSI colors):
```
autoresearch: 12 runs | 8 kept | 3 discarded | 1 crash
baseline: 42.3s | best: 31.1s (-26.5%)

 #  | commit  | metric  | delta  | status  | description
----|---------|---------|--------|---------|---------------------------
```

Compute delta % vs baseline for each row. Use `+`/`-` prefix for delta direction.

- [ ] **Step 2: Verify build**

Run: `cd servers/autoresearch && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add servers/autoresearch/src/render.ts
git commit -m "feat: text dashboard rendering module"
```

---

## Task 4: init_experiment Tool

**Files:**
- Create: `servers/autoresearch/src/tools/init.ts`

- [ ] **Step 1: Create init.ts**

Implement `registerInitTool(server: McpServer, getState, setState, getProjectDir)`.

Zod schema:
```typescript
{
  name: z.string(),
  metric_name: z.string(),
  metric_unit: z.string().optional(),
  direction: z.string().optional(),
}
```

Behavior (port from pi index.ts lines 810-870):
1. Determine if reinit (`state.results.length > 0`)
2. Update state: name, metricName, metricUnit, bestDirection
3. Reset: results=[], bestMetric=null, secondaryMetrics=[]
4. If reinit: increment currentSegment
5. Write config header to `autoresearch.jsonl`:
   - Reinit: `fs.appendFileSync`
   - First init: `fs.writeFileSync`
   - Format: `{ "type": "config", "name", "metricName", "metricUnit", "bestDirection" }`
6. Return confirmation text

- [ ] **Step 2: Verify build**

Run: `cd servers/autoresearch && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add servers/autoresearch/src/tools/init.ts
git commit -m "feat: init_experiment MCP tool"
```

---

## Task 5: run_experiment Tool

**Files:**
- Create: `servers/autoresearch/src/tools/run.ts`

- [ ] **Step 1: Create run.ts**

Implement `registerRunTool(server: McpServer, getState, setLastRunChecks, getProjectDir)`.

This is the most complex tool. Port from pi index.ts lines 900-1027.

Zod schema:
```typescript
{
  command: z.string(),
  timeout_seconds: z.number().optional().default(600),
  checks_timeout_seconds: z.number().optional().default(300),
}
```

Behavior:
1. Spawn `bash -c <command>` via `child_process.spawn`
2. Capture stdout+stderr, measure wall-clock duration
3. `benchmarkPassed = exitCode === 0 && !killed`
4. If benchmark passed AND `autoresearch.checks.sh` exists: run checks with separate timeout
5. Store `lastRunChecks` in memory AND persist to `.autoresearch-last-run.json`
6. Build human-readable response text (TIMEOUT/FAILED/PASSED, current best metric, tail output, checks output)
7. Return as MCP tool result

Key implementation detail: use a Promise wrapper around `child_process.spawn` with timeout via `setTimeout` + `process.kill`. Track running child process for cleanup on server exit.

- [ ] **Step 2: Verify build**

Run: `cd servers/autoresearch && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add servers/autoresearch/src/tools/run.ts
git commit -m "feat: run_experiment MCP tool"
```

---

## Task 6: log_experiment Tool

**Files:**
- Create: `servers/autoresearch/src/tools/log.ts`

- [ ] **Step 1: Create log.ts**

Implement `registerLogTool(server: McpServer, getState, setState, getLastRunChecks, clearLastRunChecks, getProjectDir)`.

Port from pi index.ts lines 1109-1300. Most complex business logic.

Zod schema:
```typescript
{
  commit: z.string(),
  metric: z.number(),
  metrics: z.record(z.string(), z.number()).optional(),
  status: z.enum(["keep", "discard", "crash", "checks_failed"]),
  description: z.string(),
  force: z.boolean().optional().default(false),
}
```

Behavior:
1. Gate: if `lastRunChecks?.pass === false` and status is "keep", return error
2. Validate secondary metrics consistency (missing = error, new without force = error)
3. Create `ExperimentResult`: `commit.slice(0,7)`, metric, metrics, status, description, `Date.now()`, segment
4. Push to state.results, increment experimentsThisSession
5. Register new secondary metric names (with auto-detected units)
6. Update bestMetric = findBaselineMetric
7. If "keep": git add -A && git commit, rev-parse for actual hash, update experiment.commit
8. If not "keep": return revert suggestion text
9. Append to autoresearch.jsonl AFTER git commit: `{ run: N, ...experiment }`
10. Write `.autoresearch-active` sentinel file
11. Reset lastRunChecks, delete `.autoresearch-last-run.json`
12. Return compact dashboard via `renderCompactDashboard`

- [ ] **Step 2: Verify build**

Run: `cd servers/autoresearch && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add servers/autoresearch/src/tools/log.ts
git commit -m "feat: log_experiment MCP tool"
```

---

## Task 7: show_dashboard Tool

**Files:**
- Create: `servers/autoresearch/src/tools/dashboard.ts`

- [ ] **Step 1: Create dashboard.ts**

Implement `registerDashboardTool(server: McpServer, getState)`.

Zod schema:
```typescript
{
  last_n: z.number().optional(),
}
```

Behavior:
1. Read in-memory state
2. Call `renderFullDashboard(state, params.last_n)`
3. Return text result

Simplest tool — just delegates to render module.

- [ ] **Step 2: Verify build**

Run: `cd servers/autoresearch && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add servers/autoresearch/src/tools/dashboard.ts
git commit -m "feat: show_dashboard MCP tool"
```

---

## Task 8: MCP Server Entry Point

**Files:**
- Create: `servers/autoresearch/src/index.ts`

- [ ] **Step 1: Create index.ts**

Main entry point that:
1. Resolves project directory: `process.env.PROJECT_DIR || process.cwd()`
2. Creates McpServer instance: `new McpServer({ name: "autoresearch", version: "1.0.0" })`
3. Reconstructs state from JSONL on startup
4. Registers all 4 tools (passing state getters/setters and projectDir)
5. Registers process cleanup handler for child processes
6. Connects via StdioServerTransport

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// ... register tools, connect
```

- [ ] **Step 2: Build the full server**

Run: `cd servers/autoresearch && npm run build`
Expected: `dist/` directory created with compiled JS

- [ ] **Step 3: Verify server starts**

Run: `echo '{}' | timeout 2 node servers/autoresearch/dist/index.js 2>&1 || true`
Expected: Server starts without crash (may timeout waiting for MCP messages, that's fine)

- [ ] **Step 4: Commit**

```bash
git add servers/autoresearch/src/index.ts servers/autoresearch/dist/
git commit -m "feat: MCP server entry point with all 4 tools"
```

---

## Task 9: Hook Scripts

**Files:**
- Create: `scripts/stop-guard.sh`
- Create: `scripts/session-start.sh`
- Create: `hooks/hooks.json`

- [ ] **Step 1: Create hooks.json**

Create `hooks/hooks.json` with the full content from the design spec (Stop + SessionStart hooks).

- [ ] **Step 2: Create stop-guard.sh**

Create `scripts/stop-guard.sh` with the full content from the design spec. Checks:
1. jq availability guard
2. stop_hook_active infinite loop prevention
3. .autoresearch-active sentinel file
4. autoresearch.md existence
5. autoresearch.jsonl has config
6. JSON decision output on exit 0

- [ ] **Step 3: Create session-start.sh**

Create `scripts/session-start.sh` with the full content from the design spec. Outputs:
- Run count summary
- NEVER STOP directive
- Checks file status
- Ideas backlog status
- Cleans up stale .autoresearch-active sentinel

- [ ] **Step 4: Make scripts executable**

Run: `chmod +x scripts/stop-guard.sh scripts/session-start.sh`

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json scripts/stop-guard.sh scripts/session-start.sh
git commit -m "feat: hook scripts for auto-resume and session state injection"
```

---

## Task 10: Skill (SKILL.md)

**Files:**
- Create: `skills/autoresearch-create/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Port pi's `skills/autoresearch-create/SKILL.md` line by line with these changes:
1. Tool names: `init_experiment`, `run_experiment`, `log_experiment` (MCP tools don't need `mcp__autoresearch__` prefix in skill text — Claude Code resolves them)
2. Dashboard reference: change "ctrl+x" to "call `show_dashboard`"
3. log_experiment description: change "Dashboard: ctrl+x" to "Dashboard: call `show_dashboard`"
4. Add "NEVER STOP" reinforcement matching the never-stop directive
5. Keep ALL other content identical: setup steps, file templates, loop rules, ideas backlog, user messages during experiments

- [ ] **Step 2: Commit**

```bash
git add skills/autoresearch-create/SKILL.md
git commit -m "feat: autoresearch-create skill ported from pi"
```

---

## Task 11: Build, Test & Final Commit

- [ ] **Step 1: Full rebuild**

Run: `cd servers/autoresearch && npm run build`

- [ ] **Step 2: Verify plugin structure**

Run: `ls -la .claude-plugin/ .mcp.json hooks/ scripts/ skills/ servers/autoresearch/dist/`
Expected: All files present

- [ ] **Step 3: Test server starts**

Run: `echo '{}' | timeout 2 node servers/autoresearch/dist/index.js 2>&1 || true`
Expected: No crash

- [ ] **Step 4: Test hook scripts parse valid JSON**

Run: `echo '{"cwd":"/tmp","stop_hook_active":false}' | bash scripts/stop-guard.sh`
Expected: exit 0 (no active session)

Run: `echo '{"cwd":"/tmp"}' | bash scripts/session-start.sh`
Expected: exit 0 (no JSONL file)

- [ ] **Step 5: Final commit with dist/**

```bash
git add -A
git commit -m "feat: complete claude-autoresearch plugin with dist build"
```
