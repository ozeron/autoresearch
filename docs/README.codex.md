# claude-autoresearch for Codex

Codex support in this repository is now packaged in a Codex-native way on top of the shared core:

- `servers/autoresearch/` provides the MCP server
- `skills/autoresearch-create/` provides the agent behavior

Codex adds these repo-local integration files:

- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `.codex/hooks.template.json`
- bundled skill maintenance scripts under `skills/autoresearch-create/scripts/`
- repo-local `.codex/hooks.json` when installed

## Install Model

1. Clone this repository.
2. Build `servers/autoresearch`.
3. Enable Codex hooks in your `config.toml` if you want auto-resume / stop-guard behavior.
4. Install the repo-local hooks with `scripts/install-codex-hooks.sh`.
5. Open the repo in Codex and install the local plugin from the repo marketplace.

Detailed steps live in [.codex/INSTALL.md](/Users/ozeron/code/claude-autoresearch/.codex/INSTALL.md).

## What Works In Codex

- Codex plugin packaging via [.codex-plugin/plugin.json](/Users/ozeron/code/claude-autoresearch/.codex-plugin/plugin.json)
- repo-local marketplace exposure via [.agents/plugins/marketplace.json](/Users/ozeron/code/claude-autoresearch/.agents/plugins/marketplace.json)
- `autoresearch-create` skill
- `autoresearch` MCP server and its tools
- the shared state/logging model in project files such as `autoresearch.jsonl`
- repo-local hooks installed into [.codex/hooks.json](/Users/ozeron/code/claude-autoresearch/.codex/hooks.json) by the maintenance scripts
- automatic hook install from [skills/autoresearch-create/SKILL.md](/Users/ozeron/code/claude-autoresearch/skills/autoresearch-create/SKILL.md)
- hook removal via [skills/autoresearch-uninstall/SKILL.md](/Users/ozeron/code/claude-autoresearch/skills/autoresearch-uninstall/SKILL.md)

## What Is Claude-Only

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `hooks/hooks.json`
- the Claude-specific `PostToolUse` matcher in [hooks/hooks.json](/Users/ozeron/code/claude-autoresearch/hooks/hooks.json), because current Codex `PostToolUse` is Bash-only

The hook scripts themselves are shared:

- [scripts/session-start.sh](/Users/ozeron/code/claude-autoresearch/scripts/session-start.sh)
- [scripts/stop-guard.sh](/Users/ozeron/code/claude-autoresearch/scripts/stop-guard.sh)

## Recommended Setup

Use the Codex plugin plus repo-local hooks.

That keeps the implementation surface small while preserving repo scoping:

- the plugin exposes bundled skills and MCP config
- the repo-local marketplace keeps install scope tied to this checkout
- the hook installer merges only autoresearch-managed entries into `.codex/hooks.json`
- Codex `SessionStart` and `Stop` are supported
- Codex `PostToolUse` is intentionally not installed because current Codex only emits Bash there
