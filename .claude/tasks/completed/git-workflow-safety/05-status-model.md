# Phase 5: Status model extensions

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** Medium
**Type:** feature
**Apps:** repo-dashboard
**Effort:** small
**Parent:** git-workflow-safety/00-overview.md

## Scope

Three status-pill additions for conditions the dashboard silently ignores today:

1. **Submodule awareness** — repos containing `.gitmodules` get a "has
   submodules" pill. Today `dirty_from_porcelain` doesn't distinguish
   submodule-dirty from regular file-dirty, so a parent on clean with a
   submodule on detached HEAD looks safe when it isn't. Match Tower's
   submodule badge (gold standard per the research).
2. **Diverged branches** — if `ahead > 0 AND behind > 0`, show a red
   "diverged" pill with a tooltip explaining `pull --ff-only` will refuse.
   Today the two pills are shown independently; users don't realize the
   combination blocks the pull action.
3. **Unpushed-no-upstream** — when `has_upstream = false` but HEAD has
   commits not on any tracked remote, show an "unpushed" pill. Currently
   the ahead/behind pills are hidden entirely when there's no upstream,
   which hides the single most-requested multi-repo-dashboard feature
   (per `multi-git-status` / `mgitstatus`): "show me what I haven't
   pushed yet."

## Checklist

### Backend

- [ ] Extend `RepoStatus` in `models.rs`:
      - `has_submodules: bool` (exists-check on `<repo>/.gitmodules`)
      - `diverged: bool` (derived: `ahead > 0 && behind > 0`)
      - `unpushed_no_upstream: Option<u32>` (Some(N) if no upstream but
        HEAD has commits beyond `origin/<default>`; None otherwise)
- [ ] `git/status.rs::has_submodules(path)` — stat check, no git call.
- [ ] For `unpushed_no_upstream`: when `ahead_behind` reports
      `has_upstream = false` but an `origin/<default>` ref exists, run
      `git rev-list --count origin/<default>..HEAD`. Cache-friendly,
      local-only.
- [ ] Update `commands/status.rs::get_repo_status` to populate the new
      fields. No additional git calls except the unpushed count (and
      even that only when no upstream).

### Frontend

- [ ] Extend the `RepoStatus` type in `src/types.ts` to match.
- [ ] Add three pills to `RepoRow.tsx`:
      - Purple "submodules" pill with branch icon (next to the branch pill)
      - Red "diverged" pill with split-arrow icon (replaces the separate
        ahead/behind pills when both > 0; tooltip: "Cannot fast-forward.
        Open terminal to merge/rebase manually.")
      - Orange "N unpushed" pill when `unpushed_no_upstream != null`
- [ ] Update `trayTooltip.ts` to include diverged + unpushed counts in
      the summary text.

### Tests

- [ ] Unit tests for `has_submodules` (temp dir fixture with/without
      `.gitmodules`).
- [ ] Unit test for `diverged` derivation.

## Risk / open questions

- **Submodule dirty detection is deeper than this phase attempts.**
  Actually classifying submodule state (ahead/behind/dirty per submodule)
  needs `git submodule status` parsing, which is a project of its own.
  The pill in this phase is informational only ("this repo has submodules,
  the dashboard's view is partial"). Full submodule awareness is V2.
- **Performance:** `rev-list --count` on every `get_all_statuses` call
  for every repo with no upstream could be slow if many repos have no
  upstream. Benchmark; if it's >5% of refresh time, make it lazy
  (compute on row expand).

## Dependencies

None — independent.
