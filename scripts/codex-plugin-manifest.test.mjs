import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("codex plugin manifest exists and points at bundled components", () => {
  const manifest = readJson(".codex-plugin/plugin.json");

  assert.equal(manifest.name, "autoresearch");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(typeof manifest.interface.displayName, "string");
});

test("repo marketplace exposes the repo-local plugin", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json");

  assert.equal(marketplace.name, "autoresearch-local");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "autoresearch");
  assert.equal(marketplace.plugins[0].source.path, "./");
});

test("shared mcp config uses a local server path", () => {
  const mcpConfig = readJson(".mcp.json");

  assert.equal(mcpConfig.mcpServers.autoresearch.command, "node");
  assert.deepEqual(mcpConfig.mcpServers.autoresearch.args, ["./servers/autoresearch/dist/index.js"]);
});
