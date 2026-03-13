import { currentResults } from "./state.js";
/**
 * Formats a number with comma-separated thousands groups.
 * Example: 1234567 → "1,234,567"
 */
export function commas(n) {
    const [intPart, decPart] = n.toString().split(".");
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}
/**
 * Formats a number with commas and optional fixed decimal places.
 */
export function fmtNum(n, decimals) {
    if (decimals !== undefined) {
        return commas(parseFloat(n.toFixed(decimals)));
    }
    return commas(n);
}
/**
 * Formats a metric value with its unit. Returns "-" for null values.
 * Example: (42.3, "s") → "42.3s"
 */
export function formatNum(value, unit) {
    if (value === null)
        return "-";
    return `${fmtNum(value, 1)}${unit}`;
}
/** Pads a string to a minimum width with spaces on the right. */
function padR(s, width) {
    return s.padEnd(width);
}
/** Pads a string to a minimum width with spaces on the left. */
function padL(s, width) {
    return s.padStart(width);
}
/**
 * Computes the delta percentage string for a result vs baseline.
 * Returns "crash" metric display and "-" delta for crashed runs.
 */
function fmtPct(value, baseline) {
    const pct = ((value - baseline) / Math.abs(baseline)) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}%`;
}
function computeDelta(result, baseline) {
    if (result.status === "crash")
        return "-";
    if (baseline === null || baseline === 0)
        return "-";
    return fmtPct(result.metric, baseline);
}
/**
 * Formats a metric value display for a result (with unit appended).
 */
function formatResultMetric(result, unit) {
    if (result.status === "crash")
        return "crash";
    return formatNum(result.metric, unit);
}
/**
 * Builds summary statistics from the segment's results.
 */
/**
 * Builds the header summary lines for the dashboard.
 */
function buildSummaryLines(state) {
    const results = currentResults(state.results, state.currentSegment);
    let kept = 0, discarded = 0, crashes = 0, checksFailed = 0;
    for (const r of results) {
        switch (r.status) {
            case "keep":
                kept++;
                break;
            case "discard":
                discarded++;
                break;
            case "crash":
                crashes++;
                break;
            case "checks_failed":
                checksFailed++;
                break;
        }
    }
    const label = state.name ? `autoresearch (${state.name})` : "autoresearch";
    const parts = [`${results.length} runs`, `${kept} kept`, `${discarded} discarded`];
    if (crashes > 0)
        parts.push(`${crashes} crash`);
    if (checksFailed > 0)
        parts.push(`${checksFailed} checks_failed`);
    const line1 = `${label}: ${parts.join(" | ")}`;
    const baseline = results.length > 0 ? results[0].metric : null;
    const bestMetric = state.bestMetric;
    const unit = state.metricUnit;
    let line2 = `baseline: ${formatNum(baseline, unit)} | best: ${formatNum(bestMetric, unit)}`;
    if (baseline !== null && bestMetric !== null && baseline !== 0) {
        line2 += ` (${fmtPct(bestMetric, baseline)})`;
    }
    return [line1, line2];
}
/**
 * Renders a table row for an experiment result.
 */
function buildTableRow(index, result, baseline, unit, colWidths, secondaryMetrics) {
    const num = padL(String(index), colWidths[0]);
    const commit = padR(result.commit.slice(0, 7), colWidths[1]);
    const metric = padR(formatResultMetric(result, unit), colWidths[2]);
    const deltaDisplay = computeDelta(result, baseline);
    const delta = padR(deltaDisplay, colWidths[3]);
    const status = padR(result.status, colWidths[4]);
    const desc = result.description;
    const primaryCols = [num, commit, metric, delta, status, desc];
    let row = primaryCols.join(" | ");
    for (let i = 0; i < secondaryMetrics.length; i++) {
        const sm = secondaryMetrics[i];
        const val = result.metrics[sm.name];
        const formatted = val !== undefined ? formatNum(val, sm.unit) : "-";
        const width = colWidths[6 + i];
        row += ` | ${width !== undefined ? padR(formatted, width) : formatted}`;
    }
    return ` ${row}`;
}
/**
 * Computes column widths for the table based on data.
 */
function computeColumnWidths(rows, unit, secondaryMetrics, baseline) {
    // Primary columns: #, commit, metric, delta, status, description
    const minWidths = [2, 7, 7, 6, 5, 11];
    const headers = ["#", "commit", "metric", "delta", "status", "description"];
    // Compute widths from data
    for (const result of rows) {
        minWidths[0] = Math.max(minWidths[0], String(rows.length).length);
        minWidths[2] = Math.max(minWidths[2], formatResultMetric(result, unit).length);
        const deltaDisplay = computeDelta(result, baseline);
        minWidths[3] = Math.max(minWidths[3], deltaDisplay.length);
        minWidths[4] = Math.max(minWidths[4], result.status.length);
        minWidths[5] = Math.max(minWidths[5], result.description.length);
    }
    // Ensure at least as wide as header text
    for (let i = 0; i < headers.length; i++) {
        minWidths[i] = Math.max(minWidths[i], headers[i].length);
    }
    // Secondary metric widths
    for (const sm of secondaryMetrics) {
        let w = sm.name.length;
        for (const result of rows) {
            const val = result.metrics[sm.name];
            if (val !== undefined) {
                w = Math.max(w, formatNum(val, sm.unit).length);
            }
        }
        minWidths.push(w);
    }
    return minWidths;
}
/**
 * Builds the table header and separator lines.
 */
function buildTableHeader(colWidths, secondaryMetrics) {
    const headers = ["#", "commit", "metric", "delta", "status", "description"];
    const paddedPrimary = headers.map((h, i) => {
        if (i === 0)
            return padL(h, colWidths[i]);
        return padR(h, colWidths[i]);
    });
    let headerLine = ` ${paddedPrimary.join(" | ")}`;
    for (let i = 0; i < secondaryMetrics.length; i++) {
        const sm = secondaryMetrics[i];
        const w = colWidths[6 + i];
        headerLine += ` | ${w !== undefined ? padR(sm.name, w) : sm.name}`;
    }
    // Build separator
    const separatorParts = colWidths
        .slice(0, 6 + secondaryMetrics.length)
        .map((w, i) => "-".repeat(w + (i === 0 ? 1 : 0)));
    const separator = separatorParts.join("-|-");
    return { header: headerLine, separator };
}
/**
 * Shared dashboard renderer used by both compact and full variants.
 */
function renderDashboard(state, lastN, secondary) {
    const summaryLines = buildSummaryLines(state);
    const results = currentResults(state.results, state.currentSegment);
    const baseline = results.length > 0 ? results[0].metric : null;
    const unit = state.metricUnit;
    const rows = results.slice(-lastN);
    const lines = [...summaryLines, ""];
    if (rows.length === 0) {
        lines.push("No runs yet.");
        return lines.join("\n");
    }
    const colWidths = computeColumnWidths(rows, unit, secondary, baseline);
    const { header, separator } = buildTableHeader(colWidths, secondary);
    lines.push(header);
    lines.push(separator);
    const startIndex = results.length - rows.length + 1;
    for (let i = 0; i < rows.length; i++) {
        lines.push(buildTableRow(startIndex + i, rows[i], baseline, unit, colWidths, secondary));
    }
    return lines.join("\n");
}
/**
 * Renders a compact dashboard: summary lines + last N runs table (default 6).
 */
export function renderCompactDashboard(state, lastN = 6) {
    return renderDashboard(state, lastN, []);
}
/**
 * Renders a full dashboard: summary lines + all runs table with secondary
 * metrics columns (default lastN=50).
 */
export function renderFullDashboard(state, lastN = 50) {
    return renderDashboard(state, lastN, state.secondaryMetrics);
}
//# sourceMappingURL=render.js.map