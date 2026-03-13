import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExperimentState } from "../types.js";
export declare function registerDashboardTool(server: McpServer, getState: () => ExperimentState): void;
