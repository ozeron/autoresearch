# claude-autoresearch for Claude Code

Claude Code support uses the repository's Claude adapter files:

- [.claude-plugin/plugin.json](/Users/ozeron/code/claude-autoresearch/.claude-plugin/plugin.json)
- [.claude-plugin/marketplace.json](/Users/ozeron/code/claude-autoresearch/.claude-plugin/marketplace.json)
- [.mcp.json](/Users/ozeron/code/claude-autoresearch/.mcp.json)
- [hooks/hooks.json](/Users/ozeron/code/claude-autoresearch/hooks/hooks.json)

The shared core is the same as Codex:

- `servers/autoresearch/` is the MCP server
- `skills/autoresearch-create/` is the workflow skill

Claude Code adds plugin packaging and hook integration on top of that shared core.
