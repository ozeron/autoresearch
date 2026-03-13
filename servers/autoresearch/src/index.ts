import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reconstructState } from "./state.js";
import { registerInitTool } from "./tools/init.js";
import { registerRunTool } from "./tools/run.js";
import { registerLogTool } from "./tools/log.js";
import { registerDashboardTool } from "./tools/dashboard.js";
import type { ExperimentState, LastRunChecks } from "./types.js";

// Resolve project directory
const projectDir = process.env["PROJECT_DIR"] || process.cwd();

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

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
