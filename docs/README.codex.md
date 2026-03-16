# claude-autoresearch for Codex

Codex support in this repository is a thin adapter over the shared core:

- `servers/autoresearch/` provides the MCP server
- `skills/autoresearch-create/` provides the agent behavior

Codex does not use `.claude-plugin/plugin.json`, `.mcp.json`, or Claude hooks. Instead it uses:

- native skill discovery
- native MCP configuration in `config.toml`

## Install Model

1. Clone this repository.
2. Build `servers/autoresearch`.
3. Symlink `skills/` into `~/.agents/skills/claude-autoresearch`.
4. Add the MCP entry from `.codex/config.toml.example` to Codex.
5. Restart Codex.

Detailed steps live in [.codex/INSTALL.md](/Users/ozeron/code/claude-autoresearch/.codex/INSTALL.md).

## What Works In Codex

- `autoresearch-create` skill
- `autoresearch` MCP server and its tools
- the shared state/logging model in project files such as `autoresearch.jsonl`

## What Is Claude-Only

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.mcp.json`
- `hooks/hooks.json`
- `scripts/session-start.sh`
- `scripts/stop-guard.sh`

## Recommended Setup

Use skills plus MCP. Do not try to emulate the Claude plugin packaging in Codex.

That keeps the implementation surface small:

- skills tell Codex when and how to run the workflow
- MCP provides the typed experiment tools
- project files preserve session state across runs
