import { z } from "zod";
import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
/** Currently running child process, tracked for cleanup on server exit. */
let activeChild = null;
/** Kill the active child process if any (called on server exit). */
export function killActiveChild() {
    if (activeChild) {
        activeChild.kill("SIGKILL");
        activeChild = null;
    }
}
/**
 * Spawns a bash command, captures combined stdout+stderr, handles timeout.
 */
function spawnCommand(cmd, cwd, timeoutMs) {
    return new Promise((resolve) => {
        const start = Date.now();
        const proc = child_process.spawn("bash", ["-c", cmd], {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        activeChild = proc;
        let output = "";
        proc.stdout.on("data", (d) => {
            output += d.toString();
        });
        proc.stderr.on("data", (d) => {
            output += d.toString();
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill("SIGKILL");
        }, timeoutMs);
        proc.on("close", (code) => {
            clearTimeout(timer);
            activeChild = null;
            resolve({
                exitCode: code,
                timedOut,
                output,
                durationSeconds: (Date.now() - start) / 1000,
            });
        });
    });
}
/**
 * Truncates text to the last N lines.
 */
function tailLines(text, n) {
    const lines = text.split("\n");
    if (lines.length <= n)
        return text;
    return lines.slice(-n).join("\n");
}
/**
 * Registers the run_experiment MCP tool on the given server.
 *
 * The tool:
 * 1. Runs a shell command with a configurable timeout
 * 2. Optionally runs autoresearch.checks.sh if it exists in projectDir
 * 3. Stores LastRunChecks in memory and persists to .autoresearch-last-run.json
 * 4. Returns formatted output with status, duration, tail output, and checks result
 */
export function registerRunTool(server, setLastRunChecks, getProjectDir) {
    server.tool("run_experiment", "Run a benchmark or experiment command, optionally validate with checks script, and report results.", {
        command: z.string().describe("Shell command to run"),
        timeout_seconds: z
            .number()
            .optional()
            .default(600)
            .describe("Max seconds for benchmark"),
        checks_timeout_seconds: z
            .number()
            .optional()
            .default(300)
            .describe("Max seconds for checks script"),
    }, async (params) => {
        const projectDir = getProjectDir();
        const timeoutMs = params.timeout_seconds * 1000;
        const checksTimeoutMs = params.checks_timeout_seconds * 1000;
        // --- Run benchmark ---
        const bench = await spawnCommand(params.command, projectDir, timeoutMs);
        const benchmarkPassed = bench.exitCode === 0 && !bench.timedOut;
        const benchStatus = bench.timedOut
            ? "TIMEOUT"
            : benchmarkPassed
                ? "PASSED"
                : "FAILED";
        const tailOutput = tailLines(bench.output, 80);
        let responseLines = [
            `${benchStatus} (exit=${bench.exitCode ?? "null"}, ${bench.durationSeconds.toFixed(1)}s)`,
            tailOutput,
        ];
        // --- Run checks if benchmark passed and checks script exists ---
        const checksScriptPath = path.join(projectDir, "autoresearch.checks.sh");
        const checksExists = fs.existsSync(checksScriptPath);
        let lastRunChecks = null;
        if (benchmarkPassed && checksExists) {
            const checks = await spawnCommand("bash autoresearch.checks.sh", projectDir, checksTimeoutMs);
            const checksPass = checks.exitCode === 0 && !checks.timedOut;
            lastRunChecks = {
                pass: checksPass,
                output: checks.output,
                duration: checks.durationSeconds,
            };
            const checksStatus = checks.timedOut
                ? "TIMEOUT"
                : checksPass
                    ? "PASS"
                    : "FAIL";
            responseLines.push("");
            responseLines.push(`Checks: ${checksStatus} (${checks.durationSeconds.toFixed(1)}s)`);
            if (!checksPass) {
                responseLines.push(tailLines(checks.output, 80));
            }
        }
        else {
            responseLines.push("");
            responseLines.push("Checks: skipped (0.0s)");
        }
        // --- Persist and update in-memory state ---
        setLastRunChecks(lastRunChecks);
        if (lastRunChecks !== null) {
            const lastRunPath = path.join(projectDir, ".autoresearch-last-run.json");
            try {
                fs.writeFileSync(lastRunPath, JSON.stringify(lastRunChecks), "utf-8");
            }
            catch {
                // Best-effort persistence; non-fatal
            }
        }
        return {
            content: [{ type: "text", text: responseLines.join("\n") }],
        };
    });
}
//# sourceMappingURL=run.js.map