---
name: autoresearch-uninstall
description: Remove repo-local autoresearch Codex hooks from the current checkout so the loop no longer auto-resumes or blocks stop in this repo.
---

# Uninstall Autoresearch Hooks

1. Find the repo root:

   ```bash
   git rev-parse --show-toplevel
   ```

2. Run the bundled uninstaller against that repo root:

   ```bash
   REPO_ROOT=$(git rev-parse --show-toplevel)
   ../autoresearch-create/scripts/uninstall-codex-hooks.sh "$REPO_ROOT"
   ```

3. Confirm in one sentence that only repo-local autoresearch-managed hooks were removed and unrelated hooks were preserved.
