export interface MetricDef {
    name: string;
    unit: string;
}
export interface ExperimentResult {
    commit: string;
    metric: number;
    metrics: Record<string, number>;
    status: "keep" | "discard" | "crash" | "checks_failed";
    description: string;
    timestamp: number;
    segment: number;
}
export interface ExperimentState {
    results: ExperimentResult[];
    bestMetric: number | null;
    bestDirection: "lower" | "higher";
    metricName: string;
    metricUnit: string;
    secondaryMetrics: MetricDef[];
    name: string | null;
    currentSegment: number;
}
export interface RunDetails {
    command: string;
    exitCode: number | null;
    durationSeconds: number;
    passed: boolean;
    crashed: boolean;
    timedOut: boolean;
    tailOutput: string;
    checksPass: boolean | null;
    checksTimedOut: boolean;
    checksOutput: string;
    checksDuration: number;
}
export interface LastRunChecks {
    pass: boolean;
    output: string;
    duration: number;
}
