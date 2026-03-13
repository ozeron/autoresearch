import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LastRunChecks } from "../types.js";
/** Kill the active child process if any (called on server exit). */
export declare function killActiveChild(): void;
/**
 * Registers the run_experiment MCP tool on the given server.
 *
 * The tool:
 * 1. Runs a shell command with a configurable timeout
 * 2. Optionally runs autoresearch.checks.sh if it exists in projectDir
 * 3. Stores LastRunChecks in memory and persists to .autoresearch-last-run.json
 * 4. Returns formatted output with status, duration, tail output, and checks result
 */
export declare function registerRunTool(server: McpServer, setLastRunChecks: (checks: LastRunChecks | null) => void, getProjectDir: () => string): void;
