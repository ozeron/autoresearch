import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reconstructState } from "./state.js";
import { registerInitTool } from "./tools/init.js";
import { registerRunTool, killActiveChild } from "./tools/run.js";
import { registerLogTool } from "./tools/log.js";
import { registerDashboardTool } from "./tools/dashboard.js";
// Resolve project directory
const projectDir = process.env["PROJECT_DIR"] || process.cwd();
// Reconstruct state from JSONL on startup
const reconstructed = reconstructState(projectDir);
let state = reconstructed.state;
let lastRunChecks = reconstructed.lastRunChecks;
let experimentsThisSession = 0;
// State accessors
const getState = () => state;
const setState = (s) => { state = s; };
const getLastRunChecks = () => lastRunChecks;
const setLastRunChecks = (checks) => { lastRunChecks = checks; };
const clearLastRunChecks = () => { lastRunChecks = null; };
const incrementExperiments = () => { experimentsThisSession++; };
const getProjectDir = () => projectDir;
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
//# sourceMappingURL=index.js.map