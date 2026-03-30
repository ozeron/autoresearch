import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  installHooks,
  uninstallHooks,
  managedCommandPaths,
} from "../skills/autoresearch-create/scripts/codex-hooks-manager.mjs";

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "autoresearch-hooks-"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

test("install creates repo-local hooks file with autoresearch entries", () => {
  const repoRoot = mkRepo();
  fs.mkdirSync(path.join(repoRoot, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, ".codex", "hooks.template.json"), JSON.stringify({
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            {
              type: "command",
              command: "__REPO_ROOT__/scripts/session-start.sh",
              statusMessage: "Loading autoresearch context",
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "__REPO_ROOT__/scripts/stop-guard.sh",
              timeout: 30,
              statusMessage: "Checking autoresearch loop",
            },
          ],
        },
      ],
    },
  }, null, 2));

  installHooks({ repoRoot });

  const hooksPath = path.join(repoRoot, ".codex", "hooks.json");
  const actual = readJson(hooksPath);

  assert.equal(actual.hooks.SessionStart.length, 1);
  assert.equal(actual.hooks.Stop.length, 1);
  assert.equal(
    actual.hooks.SessionStart[0].hooks[0].command,
    path.join(repoRoot, "scripts", "session-start.sh"),
  );
  assert.equal(
    actual.hooks.Stop[0].hooks[0].command,
    path.join(repoRoot, "scripts", "stop-guard.sh"),
  );
});

test("install preserves unrelated hooks and is idempotent", () => {
  const repoRoot = mkRepo();
  const hooksPath = path.join(repoRoot, ".codex", "hooks.json");
  writeJson(hooksPath, {
    hooks: {
      SessionStart: [
        {
          matcher: "startup",
          hooks: [{ type: "command", command: "/tmp/custom-start.sh" }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: "command", command: "/tmp/custom-stop.sh" }],
        },
      ],
    },
  });
  fs.writeFileSync(path.join(repoRoot, ".codex", "hooks.template.json"), JSON.stringify({
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            {
              type: "command",
              command: "__REPO_ROOT__/scripts/session-start.sh",
              statusMessage: "Loading autoresearch context",
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "__REPO_ROOT__/scripts/stop-guard.sh",
              timeout: 30,
              statusMessage: "Checking autoresearch loop",
            },
          ],
        },
      ],
    },
  }, null, 2));

  installHooks({ repoRoot });
  installHooks({ repoRoot });

  const actual = readJson(hooksPath);

  assert.equal(actual.hooks.SessionStart.length, 2);
  assert.equal(actual.hooks.Stop.length, 2);

  const commands = JSON.stringify(actual);
  assert.equal(commands.includes("/tmp/custom-start.sh"), true);
  assert.equal(commands.includes("/tmp/custom-stop.sh"), true);

  const managed = managedCommandPaths(repoRoot);
  assert.equal(commands.split(managed.sessionStart).length - 1, 1);
  assert.equal(commands.split(managed.stopGuard).length - 1, 1);
});

test("uninstall removes only autoresearch-managed entries", () => {
  const repoRoot = mkRepo();
  const managed = managedCommandPaths(repoRoot);
  const hooksPath = path.join(repoRoot, ".codex", "hooks.json");

  writeJson(hooksPath, {
    hooks: {
      SessionStart: [
        {
          matcher: "startup",
          hooks: [{ type: "command", command: "/tmp/custom-start.sh" }],
        },
        {
          matcher: "startup|resume",
          hooks: [{ type: "command", command: managed.sessionStart }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: "command", command: managed.stopGuard, timeout: 30 }],
        },
        {
          hooks: [{ type: "command", command: "/tmp/custom-stop.sh" }],
        },
      ],
    },
  });

  uninstallHooks({ repoRoot });

  const actual = readJson(hooksPath);
  assert.equal(actual.hooks.SessionStart.length, 1);
  assert.equal(actual.hooks.Stop.length, 1);
  assert.equal(actual.hooks.SessionStart[0].hooks[0].command, "/tmp/custom-start.sh");
  assert.equal(actual.hooks.Stop[0].hooks[0].command, "/tmp/custom-stop.sh");
});

test("uninstall deletes hooks file when only autoresearch entries remain", () => {
  const repoRoot = mkRepo();
  const managed = managedCommandPaths(repoRoot);
  const hooksPath = path.join(repoRoot, ".codex", "hooks.json");

  writeJson(hooksPath, {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [{ type: "command", command: managed.sessionStart }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: "command", command: managed.stopGuard, timeout: 30 }],
        },
      ],
    },
  });

  uninstallHooks({ repoRoot });

  assert.equal(fs.existsSync(hooksPath), false);
});
