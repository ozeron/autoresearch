import * as fs from "node:fs";
import * as path from "node:path";
/**
 * Returns a fresh empty ExperimentState with default values.
 */
export function createDefaultState() {
    return {
        results: [],
        bestMetric: null,
        bestDirection: "lower",
        metricName: "metric",
        metricUnit: "",
        secondaryMetrics: [],
        name: null,
        currentSegment: 0,
    };
}
/**
 * Detects the unit for a metric name based on naming conventions.
 * If name contains `_µs` or `µs` → "µs"
 * If name contains `_ms` or `ms` → "ms"
 * If name contains `_s` or `sec` → "s"
 * Otherwise → ""
 */
export function detectMetricUnit(name) {
    if (name.endsWith("_µs") || name.includes("µs"))
        return "µs";
    if (name.endsWith("_ms") || name.includes("ms"))
        return "ms";
    if (name.endsWith("_s") || name.includes("sec"))
        return "s";
    return "";
}
/**
 * Returns true if current metric is better than best given the direction.
 */
export function isBetter(current, best, direction) {
    return direction === "lower" ? current < best : current > best;
}
/**
 * Filters results to only those belonging to the given segment.
 */
export function currentResults(results, segment) {
    return results.filter((r) => r.segment === segment);
}
/**
 * Returns the metric of the first result in the given segment (the baseline),
 * or null if no results exist in that segment.
 */
export function findBaselineMetric(results, segment) {
    const cur = currentResults(results, segment);
    return cur.length > 0 ? cur[0].metric : null;
}
/**
 * Reads autoresearch.jsonl from projectDir and reconstructs the ExperimentState.
 * Also attempts to load .autoresearch-last-run.json for crash resilience.
 *
 * Config lines (type === "config") update state metadata. Each config line after
 * results exist increments the segment counter.
 * Result lines are pushed to state.results with the current segment.
 * Secondary metrics are auto-registered with units detected from their names.
 */
export function reconstructState(projectDir) {
    const state = createDefaultState();
    let lastRunChecks = null;
    const jsonlPath = path.join(projectDir, "autoresearch.jsonl");
    if (fs.existsSync(jsonlPath)) {
        let segment = 0;
        const lines = fs
            .readFileSync(jsonlPath, "utf-8")
            .trim()
            .split("\n")
            .filter(Boolean);
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry["type"] === "config") {
                    // Each config line after results exist starts a new segment
                    if (state.results.length > 0)
                        segment++;
                    if (entry["name"])
                        state.name = entry["name"];
                    if (entry["metricName"])
                        state.metricName = entry["metricName"];
                    if (entry["metricUnit"] !== undefined)
                        state.metricUnit = entry["metricUnit"];
                    if (entry["bestDirection"])
                        state.bestDirection = entry["bestDirection"];
                    state.currentSegment = segment;
                    continue;
                }
                // Experiment result line
                const result = {
                    commit: entry["commit"] ?? "",
                    metric: entry["metric"] ?? 0,
                    metrics: entry["metrics"] ?? {},
                    status: entry["status"] ?? "keep",
                    description: entry["description"] ?? "",
                    timestamp: entry["timestamp"] ?? 0,
                    segment,
                };
                state.results.push(result);
                // Register secondary metrics with auto-detected units
                for (const name of Object.keys(result.metrics)) {
                    const alreadyRegistered = state.secondaryMetrics.find((m) => m.name === name);
                    if (!alreadyRegistered) {
                        state.secondaryMetrics.push({ name, unit: detectMetricUnit(name) });
                    }
                }
            }
            catch {
                // Skip malformed lines
            }
        }
        if (state.results.length > 0) {
            state.bestMetric = findBaselineMetric(state.results, state.currentSegment);
        }
    }
    // Try to load last run checks for crash resilience
    const lastRunPath = path.join(projectDir, ".autoresearch-last-run.json");
    try {
        if (fs.existsSync(lastRunPath)) {
            const raw = fs.readFileSync(lastRunPath, "utf-8");
            const parsed = JSON.parse(raw);
            lastRunChecks = parsed;
        }
    }
    catch {
        // Ignore missing or malformed last-run file
    }
    return { state, lastRunChecks };
}
//# sourceMappingURL=state.js.map