import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { detectMetricUnit } from "../state.js";
/**
 * Registers the init_experiment MCP tool on the given server.
 *
 * The tool initializes (or reinitializes) an experiment: it sets the metric
 * name, unit, direction, and writes a config header to autoresearch.jsonl in
 * the project directory. On reinitialization it appends a new config line and
 * increments the segment counter so previous results are preserved but
 * separated from the new run.
 */
export function registerInitTool(server, getState, setState, getProjectDir) {
    server.tool("init_experiment", "Initialize or reinitialize an experiment. Sets the primary metric name, unit, and direction (lower/higher is better). On reinitialization, previous results are preserved in a separate segment.", {
        name: z.string().describe("Experiment name"),
        metric_name: z
            .string()
            .describe("Primary metric display name (e.g. 'total_µs', 'bundle_kb')"),
        metric_unit: z
            .string()
            .optional()
            .describe("Unit: 'µs', 'ms', 's', 'kb', 'mb', or '' for unitless. Default: auto-detect or ''"),
        direction: z
            .enum(["lower", "higher"])
            .optional()
            .describe("'lower' or 'higher' is better. Default: 'lower'"),
    }, async (params) => {
        const { name, metric_name, metric_unit, direction } = params;
        const state = getState();
        const isReinit = state.results.length > 0;
        // Resolve unit: explicit value (including empty string) takes precedence,
        // otherwise auto-detect from metric name.
        const resolvedUnit = metric_unit !== undefined ? metric_unit : detectMetricUnit(metric_name);
        const resolvedDirection = direction ?? "lower";
        // Build the updated state.
        const updatedState = {
            ...state,
            name,
            metricName: metric_name,
            metricUnit: resolvedUnit,
            bestDirection: resolvedDirection,
            results: [],
            bestMetric: null,
            secondaryMetrics: [],
            currentSegment: isReinit ? state.currentSegment + 1 : state.currentSegment,
        };
        // Write config header to autoresearch.jsonl.
        const projectDir = getProjectDir();
        const jsonlPath = path.join(projectDir, "autoresearch.jsonl");
        const configLine = JSON.stringify({
            type: "config",
            name,
            metricName: metric_name,
            metricUnit: resolvedUnit,
            bestDirection: resolvedDirection,
        }) + "\n";
        if (isReinit) {
            fs.appendFileSync(jsonlPath, configLine, "utf-8");
        }
        else {
            fs.writeFileSync(jsonlPath, configLine, "utf-8");
        }
        setState(updatedState);
        const action = isReinit ? "Reinitialized" : "Initialized";
        const unitDisplay = resolvedUnit ? ` (${resolvedUnit})` : "";
        const segmentInfo = isReinit
            ? ` Segment ${updatedState.currentSegment} started.`
            : "";
        return {
            content: [
                {
                    type: "text",
                    text: `${action} experiment "${name}". Metric: ${metric_name}${unitDisplay}, direction: ${resolvedDirection}.${segmentInfo}`,
                },
            ],
        };
    });
}
//# sourceMappingURL=init.js.map