import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  ExperimentResult,
  ExperimentState,
  LastRunChecks,
} from "../types.js";
import {
  currentResults,
  findBaselineMetric,
  isBetter,
  registerSecondaryMetrics,
} from "../state.js";
import { renderCompactDashboard } from "../render.js";

/**
 * Registers the log_experiment MCP tool on the given server.
 *
 * The tool logs a completed experiment run: records its commit hash, primary
 * metric, optional secondary metrics, status, and description. On "keep"
 * status it auto-commits the working tree. Appends the result to
 * autoresearch.jsonl and updates in-memory state.
 */
export function registerLogTool(
  server: McpServer,
  getState: () => ExperimentState,
  setState: (s: ExperimentState) => void,
  getLastRunChecks: () => LastRunChecks | null,
  clearLastRunChecks: () => void,
  incrementExperiments: () => void,
  getProjectDir: () => string
): void {
  server.tool(
    "log_experiment",
    "Log a completed experiment run. On 'keep' status, auto-commits the working tree. Records metric, secondary metrics, status, and description.",
    {
      commit: z.string().describe("Git commit hash (short, 7 chars)"),
      metric: z.number().describe("Primary metric value. 0 for crashes."),
      metrics: z
        .record(z.string(), z.number())
        .optional()
        .describe("Secondary metrics dict"),
      status: z.enum(["keep", "discard", "crash", "checks_failed"]),
      description: z.string().describe("What was tried"),
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe("Force keep even with new secondary metrics"),
    },
    async (params) => {
      const state = getState();
      const projectDir = getProjectDir();
      const lastRunChecks = getLastRunChecks();

      // 1. Gate: cannot keep if checks failed
      if (lastRunChecks?.pass === false && params.status === "keep") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Cannot keep: checks failed. Log as 'checks_failed' or 'discard' instead.",
            },
          ],
        };
      }

      // 2. Validate secondary metrics consistency
      const segmentResults = currentResults(state.results, state.currentSegment);
      const previousResultsWithMetrics = segmentResults.filter(
        (r) => Object.keys(r.metrics).length > 0
      );

      if (previousResultsWithMetrics.length > 0 && params.metrics) {
        const existingKeys = new Set(
          Object.keys(previousResultsWithMetrics[0]!.metrics)
        );
        const newKeys = Object.keys(params.metrics);

        const addedKeys = newKeys.filter((k) => !existingKeys.has(k));
        const missingKeys = [...existingKeys].filter(
          (k) => !newKeys.includes(k)
        );

        if (addedKeys.length > 0 && !params.force) {
          return {
            content: [
              {
                type: "text" as const,
                text: `New secondary metric keys found: ${addedKeys.join(", ")}. Use force=true to proceed with new metrics.`,
              },
            ],
          };
        }

        if (missingKeys.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Missing secondary metric keys: ${missingKeys.join(", ")}. All previously logged secondary metrics must be provided.`,
              },
            ],
          };
        }
      }

      // 3. Create ExperimentResult
      const experiment: ExperimentResult = {
        commit: params.commit.slice(0, 7),
        metric: params.metric,
        metrics: params.metrics ?? {},
        status: params.status,
        description: params.description,
        timestamp: Date.now(),
        segment: state.currentSegment,
      };

      let gitMessage = "";

      // 4. If "keep": run git commit
      if (params.status === "keep") {
        const runNumber = segmentResults.length + 1;
        const commitMsg = `${params.description}\n\nAutoresearch run ${runNumber}: ${JSON.stringify({ metric: params.metric, status: params.status, metrics: params.metrics ?? {} })}`;

        try {
          child_process.execFileSync("git", ["add", "-A"], { cwd: projectDir });
          child_process.execFileSync("git", ["commit", "-m", commitMsg], { cwd: projectDir });
          const actualHash = child_process
            .execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: projectDir })
            .toString()
            .trim();
          experiment.commit = actualHash;
          gitMessage = `Git: committed as ${actualHash}`;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          gitMessage = `Git: commit failed — ${errMsg}`;
        }
      } else {
        // 5. Non-keep: skip commit, inform user how to revert
        gitMessage = `Git: skipped commit (${params.status}) — revert with \`git checkout -- .\``;
      }

      // 6. Register new secondary metric names
      if (params.metrics) {
        registerSecondaryMetrics(state, params.metrics);
      }

      // 7. Push result to state.results
      state.results.push(experiment);

      // 8. Update bestMetric
      const updatedSegmentResults = currentResults(state.results, state.currentSegment);
      const baseline = updatedSegmentResults.length > 0 ? updatedSegmentResults[0]!.metric : null;
      state.bestMetric = baseline;

      for (const r of updatedSegmentResults) {
        if (
          r.status === "keep" &&
          state.bestMetric !== null &&
          isBetter(r.metric, state.bestMetric, state.bestDirection)
        ) {
          state.bestMetric = r.metric;
        }
      }

      // 9. Append to autoresearch.jsonl AFTER git commit
      const runNumber = updatedSegmentResults.length;
      const line = JSON.stringify({ run: runNumber, ...experiment });
      fs.appendFileSync(path.join(projectDir, "autoresearch.jsonl"), line + "\n");

      // 10. Increment experiments counter
      incrementExperiments();

      // 11. Write .autoresearch-active sentinel file
      fs.writeFileSync(
        path.join(projectDir, ".autoresearch-active"),
        String(Date.now())
      );

      // 12. Reset lastRunChecks
      clearLastRunChecks();
      const lastRunPath = path.join(projectDir, ".autoresearch-last-run.json");
      try {
        fs.unlinkSync(lastRunPath);
      } catch {
        // Ignore ENOENT or other errors
      }

      // 13. setState with updated state
      setState(state);

      // 14. Return compact dashboard with git message
      const dashboard = renderCompactDashboard(state);
      const responseText = `${dashboard}\n\n${gitMessage}`;

      return {
        content: [
          {
            type: "text" as const,
            text: responseText,
          },
        ],
      };
    }
  );
}
