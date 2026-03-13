import type { ExperimentResult, ExperimentState, LastRunChecks } from "./types.js";
/**
 * Returns a fresh empty ExperimentState with default values.
 */
export declare function createDefaultState(): ExperimentState;
/**
 * Detects the unit for a metric name based on naming conventions.
 * If name contains `_µs` or `µs` → "µs"
 * If name contains `_ms` or `ms` → "ms"
 * If name contains `_s` or `sec` → "s"
 * Otherwise → ""
 */
export declare function detectMetricUnit(name: string): string;
/**
 * Returns true if current metric is better than best given the direction.
 */
export declare function isBetter(current: number, best: number, direction: "lower" | "higher"): boolean;
/**
 * Filters results to only those belonging to the given segment.
 */
export declare function currentResults(results: ExperimentResult[], segment: number): ExperimentResult[];
/**
 * Returns the metric of the first result in the given segment (the baseline),
 * or null if no results exist in that segment.
 */
export declare function findBaselineMetric(results: ExperimentResult[], segment: number): number | null;
/**
 * Registers any new secondary metric names from the given metrics record,
 * with units auto-detected from their names.
 */
export declare function registerSecondaryMetrics(state: ExperimentState, metrics: Record<string, number>): void;
/**
 * Reads autoresearch.jsonl from projectDir and reconstructs the ExperimentState.
 * Also attempts to load .autoresearch-last-run.json for crash resilience.
 *
 * Config lines (type === "config") update state metadata. Each config line after
 * results exist increments the segment counter.
 * Result lines are pushed to state.results with the current segment.
 * Secondary metrics are auto-registered with units detected from their names.
 */
export declare function reconstructState(projectDir: string): {
    state: ExperimentState;
    lastRunChecks: LastRunChecks | null;
};
