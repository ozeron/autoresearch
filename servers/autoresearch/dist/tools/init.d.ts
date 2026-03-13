import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExperimentState } from "../types.js";
/**
 * Registers the init_experiment MCP tool on the given server.
 *
 * The tool initializes (or reinitializes) an experiment: it sets the metric
 * name, unit, direction, and writes a config header to autoresearch.jsonl in
 * the project directory. On reinitialization it appends a new config line and
 * increments the segment counter so previous results are preserved but
 * separated from the new run.
 */
export declare function registerInitTool(server: McpServer, getState: () => ExperimentState, setState: (s: ExperimentState) => void, getProjectDir: () => string): void;
