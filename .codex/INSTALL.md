# Installing claude-autoresearch for Codex

Codex support in this repo uses:

- [.codex-plugin/plugin.json](/Users/ozeron/code/claude-autoresearch/.codex-plugin/plugin.json)
- [.agents/plugins/marketplace.json](/Users/ozeron/code/claude-autoresearch/.agents/plugins/marketplace.json)
- repo-local hook maintenance scripts, bundled with the autoresearch skill
- the shared MCP server in [.mcp.json](/Users/ozeron/code/claude-autoresearch/.mcp.json)

## Prerequisites

- OpenAI Codex CLI
- Node.js 18+
- Git
- Codex hooks feature enabled if you want stop/session hooks

## Install

1. Clone this repository somewhere stable and build the MCP server:

   ```bash
   git clone https://github.com/ozeron/claude-autoresearch.git ~/.codex/claude-autoresearch
   cd ~/.codex/claude-autoresearch/servers/autoresearch
   npm install
   npm run build
   ```

2. Enable hooks in your Codex config if you want the stop guard and resume context:

   ```bash
   # ~/.codex/config.toml
   [features]
   codex_hooks = true
   ```

3. Install the repo-local hooks for this checkout:

   ```bash
   cd ~/.codex/claude-autoresearch
   ./scripts/install-codex-hooks.sh
   ```

   This creates or updates `.codex/hooks.json` in the repo and preserves unrelated hook entries that already exist there.
   The same behavior is bundled under `skills/autoresearch-create/scripts/` so `autoresearch-create` can install hooks automatically.

4. Open the repo in Codex and install the local plugin from the repo marketplace defined in `.agents/plugins/marketplace.json`.

5. Restart Codex if the plugin or hooks are not detected immediately.

## Verify

Check that the plugin manifest exists:

```bash
ls -la .codex-plugin/plugin.json .agents/plugins/marketplace.json
```

Check that repo-local hooks were merged:

```bash
cat .codex/hooks.json
```

## Update

```bash
cd ~/.codex/claude-autoresearch
git pull
cd servers/autoresearch
npm install
npm run build
./scripts/install-codex-hooks.sh
```

## Uninstall

```bash
./scripts/uninstall-codex-hooks.sh
```

This removes only autoresearch-managed entries from `.codex/hooks.json` and leaves unrelated repo-local hooks alone.
The same removal flow is exposed in the `autoresearch-uninstall` skill.
