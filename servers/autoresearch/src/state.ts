import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExperimentResult,
  ExperimentState,
  LastRunChecks,
  MetricDef,
} from "./types.js";

/**
 * Returns a fresh empty ExperimentState with default values.
 */
export function createDefaultState(): ExperimentState {
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
export function detectMetricUnit(name: string): string {
  if (name.endsWith("_µs") || name.includes("µs")) return "µs";
  if (name.endsWith("_ms") || name.includes("ms")) return "ms";
  if (name.endsWith("_s") || name.includes("sec")) return "s";
  return "";
}

/**
 * Returns true if current metric is better than best given the direction.
 */
export function isBetter(
  current: number,
  best: number,
  direction: "lower" | "higher"
): boolean {
  return direction === "lower" ? current < best : current > best;
}

/**
 * Filters results to only those belonging to the given segment.
 */
export function currentResults(
  results: ExperimentResult[],
  segment: number
): ExperimentResult[] {
  return results.filter((r) => r.segment === segment);
}

/**
 * Returns the metric of the first result in the given segment (the baseline),
 * or null if no results exist in that segment.
 */
export function findBaselineMetric(
  results: ExperimentResult[],
  segment: number
): number | null {
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
export function reconstructState(projectDir: string): {
  state: ExperimentState;
  lastRunChecks: LastRunChecks | null;
} {
  const state = createDefaultState();
  let lastRunChecks: LastRunChecks | null = null;

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
        const entry = JSON.parse(line) as Record<string, unknown>;

        if (entry["type"] === "config") {
          // Each config line after results exist starts a new segment
          if (state.results.length > 0) segment++;
          if (entry["name"]) state.name = entry["name"] as string;
          if (entry["metricName"])
            state.metricName = entry["metricName"] as string;
          if (entry["metricUnit"] !== undefined)
            state.metricUnit = entry["metricUnit"] as string;
          if (entry["bestDirection"])
            state.bestDirection = entry["bestDirection"] as "lower" | "higher";
          state.currentSegment = segment;
          continue;
        }

        // Experiment result line
        const result: ExperimentResult = {
          commit: (entry["commit"] as string) ?? "",
          metric: (entry["metric"] as number) ?? 0,
          metrics: (entry["metrics"] as Record<string, number>) ?? {},
          status: (entry["status"] as ExperimentResult["status"]) ?? "keep",
          description: (entry["description"] as string) ?? "",
          timestamp: (entry["timestamp"] as number) ?? 0,
          segment,
        };
        state.results.push(result);

        // Register secondary metrics with auto-detected units
        for (const name of Object.keys(result.metrics)) {
          const alreadyRegistered = state.secondaryMetrics.find(
            (m: MetricDef) => m.name === name
          );
          if (!alreadyRegistered) {
            state.secondaryMetrics.push({ name, unit: detectMetricUnit(name) });
          }
        }
      } catch {
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
      const parsed = JSON.parse(raw) as LastRunChecks;
      lastRunChecks = parsed;
    }
  } catch {
    // Ignore missing or malformed last-run file
  }

  return { state, lastRunChecks };
}
