import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExperimentState } from "../types.js";
import { renderFullDashboard } from "../render.js";

export function registerDashboardTool(
  server: McpServer,
  getState: () => ExperimentState
): void {
  server.tool(
    "show_dashboard",
    "Display full experiment history with all runs, metrics, and statistics",
    {
      last_n: z.number().optional().describe("Show last N runs. Default: all runs, max 50 per page."),
    },
    async (params) => {
      const state = getState();
      const dashboard = renderFullDashboard(state, params.last_n);
      return { content: [{ type: "text", text: dashboard }] };
    }
  );
}
