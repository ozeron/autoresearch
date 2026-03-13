import type { ExperimentState } from "./types.js";
/**
 * Formats a number with comma-separated thousands groups.
 * Example: 1234567 → "1,234,567"
 */
export declare function commas(n: number): string;
/**
 * Formats a number with commas and optional fixed decimal places.
 */
export declare function fmtNum(n: number, decimals?: number): string;
/**
 * Formats a metric value with its unit. Returns "-" for null values.
 * Example: (42.3, "s") → "42.3s"
 */
export declare function formatNum(value: number | null, unit: string): string;
/**
 * Renders a compact dashboard: summary lines + last N runs table (default 6).
 */
export declare function renderCompactDashboard(state: ExperimentState, lastN?: number): string;
/**
 * Renders a full dashboard: summary lines + all runs table with secondary
 * metrics columns (default lastN=50).
 */
export declare function renderFullDashboard(state: ExperimentState, lastN?: number): string;
