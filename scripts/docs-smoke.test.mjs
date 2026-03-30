import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("codex install docs mention plugin packaging and hook maintenance scripts", () => {
  const installDoc = read(".codex/INSTALL.md");

  assert.match(installDoc, /\.codex-plugin\/plugin\.json/);
  assert.match(installDoc, /scripts\/install-codex-hooks\.sh/);
  assert.match(installDoc, /scripts\/uninstall-codex-hooks\.sh/);
});

test("codex readme documents repo-local hooks and codex hook limitations", () => {
  const codexReadme = read("docs/README.codex.md");

  assert.match(codexReadme, /repo-local/i);
  assert.match(codexReadme, /\.codex\/hooks\.json/);
  assert.match(codexReadme, /PostToolUse/i);
});

test("root readme mentions codex plugin support", () => {
  const readme = read("README.md");

  assert.match(readme, /Codex/i);
  assert.match(readme, /\.codex-plugin\/plugin\.json/);
});
