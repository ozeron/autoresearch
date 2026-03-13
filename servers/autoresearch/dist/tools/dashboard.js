import { z } from "zod";
import { renderFullDashboard } from "../render.js";
export function registerDashboardTool(server, getState) {
    server.tool("show_dashboard", "Display full experiment history with all runs, metrics, and statistics", {
        last_n: z.number().optional().describe("Show last N runs. Default: all runs, max 50 per page."),
    }, async (params) => {
        const state = getState();
        const dashboard = renderFullDashboard(state, params.last_n);
        return { content: [{ type: "text", text: dashboard }] };
    });
}
//# sourceMappingURL=dashboard.js.map