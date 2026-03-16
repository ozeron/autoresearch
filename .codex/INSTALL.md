# Installing claude-autoresearch for Codex

Codex does not use the Claude plugin manifest. For Codex, this repository is exposed through:

- native skill discovery
- native MCP configuration

## Prerequisites

- OpenAI Codex CLI
- Node.js 18+
- Git

## Install

1. Clone this repository somewhere stable:

   ```bash
   git clone https://github.com/ozeron/claude-autoresearch.git ~/.codex/claude-autoresearch
   ```

2. Build the MCP server:

   ```bash
   cd ~/.codex/claude-autoresearch/servers/autoresearch
   npm install
   npm run build
   ```

3. Expose the skills to Codex:

   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/claude-autoresearch/skills ~/.agents/skills/claude-autoresearch
   ```

4. Register the MCP server in Codex config:

   Copy `.codex/config.toml.example` into your Codex config and replace the placeholder paths.

5. Restart Codex.

## Verify

Check the skill link:

```bash
ls -la ~/.agents/skills/claude-autoresearch
```

Check Codex MCP config:

```bash
codex mcp list
```

## Update

```bash
cd ~/.codex/claude-autoresearch
git pull
cd servers/autoresearch
npm install
npm run build
```

## Uninstall

```bash
rm ~/.agents/skills/claude-autoresearch
```

Then remove the MCP entry from your Codex config and optionally delete the clone.
