import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reconstructState } from "./state.js";
import { registerInitTool } from "./tools/init.js";
import { registerRunTool, killActiveChild } from "./tools/run.js";
import { registerLogTool } from "./tools/log.js";
import { registerDashboardTool } from "./tools/dashboard.js";
import type { ExperimentState, LastRunChecks } from "./types.js";

/**
 * Walk up from startDir looking for autoresearch.jsonl.
 * Returns the directory containing it, or null if not found.
 */
function findProjectDir(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, "autoresearch.jsonl"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }
  return null;
}

// Resolve project directory:
// 1. Explicit PROJECT_DIR env var (if non-empty)
// 2. Walk up from cwd() looking for autoresearch.jsonl
// 3. Fall back to cwd() (init will create the file here)
const envDir = process.env["PROJECT_DIR"];
const projectDir = (envDir && envDir.trim() !== "")
  ? envDir
  : findProjectDir(process.cwd()) ?? process.cwd();

// Reconstruct state from JSONL on startup
const reconstructed = reconstructState(projectDir);
let state: ExperimentState = reconstructed.state;
let lastRunChecks: LastRunChecks | null = reconstructed.lastRunChecks;
let experimentsThisSession = 0;

// State accessors
const getState = (): ExperimentState => state;
const setState = (s: ExperimentState): void => { state = s; };
const getLastRunChecks = (): LastRunChecks | null => lastRunChecks;
const setLastRunChecks = (checks: LastRunChecks | null): void => { lastRunChecks = checks; };
const clearLastRunChecks = (): void => { lastRunChecks = null; };
const incrementExperiments = (): void => { experimentsThisSession++; };
const getProjectDir = (): string => projectDir;

// Create MCP server
const server = new McpServer({
  name: "autoresearch",
  version: "1.0.0",
});

// Register all 4 tools
registerInitTool(server, getState, setState, getProjectDir);
registerRunTool(server, setLastRunChecks, getProjectDir);
registerLogTool(server, getState, setState, getLastRunChecks, clearLastRunChecks, incrementExperiments, getProjectDir);
registerDashboardTool(server, getState);

// Cleanup child processes on exit
process.on("exit", killActiveChild);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
