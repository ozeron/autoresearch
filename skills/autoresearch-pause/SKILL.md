---
name: autoresearch-pause
description: Pause the autoresearch loop so you can do normal dev work. Creates .autoresearch-paused in the project directory — all hooks become no-ops until autoresearch-create is run again.
---

# Pause Autoresearch

1. Run: `touch .autoresearch-paused`
2. Confirm: "Autoresearch paused. All hooks disabled. Run `/autoresearch:autoresearch-create` to resume the loop."

That's it. The experiment state (autoresearch.jsonl, autoresearch.md) is preserved — nothing is deleted.
