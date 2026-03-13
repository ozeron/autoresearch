import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExperimentState, LastRunChecks } from "../types.js";
/**
 * Registers the log_experiment MCP tool on the given server.
 *
 * The tool logs a completed experiment run: records its commit hash, primary
 * metric, optional secondary metrics, status, and description. On "keep"
 * status it auto-commits the working tree. Appends the result to
 * autoresearch.jsonl and updates in-memory state.
 */
export declare function registerLogTool(server: McpServer, getState: () => ExperimentState, setState: (s: ExperimentState) => void, getLastRunChecks: () => LastRunChecks | null, clearLastRunChecks: () => void, incrementExperiments: () => void, getProjectDir: () => string): void;
