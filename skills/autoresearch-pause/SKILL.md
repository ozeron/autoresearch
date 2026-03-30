---
name: autoresearch-pause
description: Pause the autoresearch loop so you can do normal dev work. Creates .autoresearch-paused in the project directory — all hooks become no-ops until autoresearch-create is run again.
---

# Pause Autoresearch

1. Run: `touch .autoresearch-paused`
2. Confirm: "Autoresearch paused. All hooks disabled for loop behavior until resume. Run `/autoresearch:autoresearch-create` to resume the loop."

If you want to remove the repo-local autoresearch hook wiring from this checkout entirely, use `autoresearch-uninstall` instead of pause.

That's it. The experiment state (autoresearch.jsonl, autoresearch.md) is preserved — nothing is deleted.
