import fs from "node:fs";
import path from "node:path";

function hooksPath(repoRoot) {
  return path.join(repoRoot, ".codex", "hooks.json");
}

function templatePath(repoRoot) {
  return path.join(repoRoot, ".codex", "hooks.template.json");
}

export function managedCommandPaths(repoRoot) {
  return {
    sessionStart: path.join(repoRoot, "scripts", "session-start.sh"),
    stopGuard: path.join(repoRoot, "scripts", "stop-guard.sh"),
  };
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function managedCommandsSet(repoRoot) {
  const commands = managedCommandPaths(repoRoot);
  return new Set(Object.values(commands));
}

function isManagedGroup(group, managedCommands) {
  const hooks = Array.isArray(group?.hooks) ? group.hooks : [];
  return hooks.some((hook) => managedCommands.has(hook?.command));
}

function replaceRepoRoot(value, repoRoot) {
  if (typeof value === "string") {
    return value.replaceAll("__REPO_ROOT__", repoRoot);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceRepoRoot(item, repoRoot));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, replaceRepoRoot(inner, repoRoot)]),
    );
  }
  return value;
}

function managedTemplate(repoRoot) {
  const template = readJsonIfExists(templatePath(repoRoot), { hooks: {} });
  return replaceRepoRoot(template, repoRoot);
}

function normalizeConfig(config) {
  return {
    hooks: config?.hooks && typeof config.hooks === "object" ? config.hooks : {},
  };
}

export function installHooks({ repoRoot }) {
  const existing = normalizeConfig(readJsonIfExists(hooksPath(repoRoot), { hooks: {} }));
  const template = normalizeConfig(managedTemplate(repoRoot));
  const managedCommands = managedCommandsSet(repoRoot);
  const next = { hooks: {} };

  const events = new Set([...Object.keys(existing.hooks), ...Object.keys(template.hooks)]);
  for (const eventName of events) {
    const existingGroups = Array.isArray(existing.hooks[eventName]) ? existing.hooks[eventName] : [];
    const templateGroups = Array.isArray(template.hooks[eventName]) ? template.hooks[eventName] : [];
    const preserved = existingGroups.filter((group) => !isManagedGroup(group, managedCommands));
    const merged = [...preserved, ...templateGroups];
    if (merged.length > 0) {
      next.hooks[eventName] = merged;
    }
  }

  writeJson(hooksPath(repoRoot), next);
}

export function uninstallHooks({ repoRoot }) {
  const existing = normalizeConfig(readJsonIfExists(hooksPath(repoRoot), { hooks: {} }));
  const managedCommands = managedCommandsSet(repoRoot);
  const next = { hooks: {} };

  for (const [eventName, groups] of Object.entries(existing.hooks)) {
    const preserved = (Array.isArray(groups) ? groups : []).filter(
      (group) => !isManagedGroup(group, managedCommands),
    );
    if (preserved.length > 0) {
      next.hooks[eventName] = preserved;
    }
  }

  const filePath = hooksPath(repoRoot);
  if (Object.keys(next.hooks).length === 0) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  writeJson(filePath, next);
}

function usage() {
  console.error("Usage: node skills/autoresearch-create/scripts/codex-hooks-manager.mjs <install|uninstall> <repoRoot>");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const action = process.argv[2];
  const repoRoot = process.argv[3] ? path.resolve(process.argv[3]) : null;

  if (!repoRoot) {
    usage();
    process.exitCode = 1;
  } else if (action === "install") {
    installHooks({ repoRoot });
  } else if (action === "uninstall") {
    uninstallHooks({ repoRoot });
  } else {
    usage();
    process.exitCode = 1;
  }
}
