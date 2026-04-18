# Phase 3: Bulk operation UX polish

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** Medium
**Type:** feature
**Apps:** repo-dashboard
**Effort:** medium
**Parent:** git-workflow-safety/00-overview.md

## Scope

Two improvements to bulk fetch / bulk pull:

1. **Actionable result rows** — the current summary dialog shows "Skipped: 2
   (off branch, dirty)" with no path forward. Replace with a per-repo row
   that has contextual action buttons: "Open folder", "Open terminal",
   "Refresh", "Force pull" (only where legal — on default branch).
2. **Concurrency cap** — unbounded parallelism today. Add a
   `bulk_concurrency` setting (default 4, range 1–16) and gate both
   `git_fetch_all` and `git_pull_all_safe` with a `tokio::sync::Semaphore`
   so corporate VPNs / GCM popups don't get overwhelmed.

Reference: `mgitstatus --throttle`, `git-bulk`. Both prioritize "show me
which ones failed and why" over celebratory summary.

## Checklist

### Backend

- [ ] Add `bulk_concurrency` to the settings keyspace (default `"4"`).
      No schema change — settings are free-form k/v per `CLAUDE.md`.
- [ ] Wrap the per-repo task spawn in `git_fetch_all` / `git_pull_all_safe`
      with `Arc<Semaphore>` acquired per task. Cap comes from settings
      (fall back to 4 if unset or unparseable).
- [ ] Extend `BulkResult` / `BulkPullReport` with a `reason_code` enum so
      the frontend can render distinct actions per reason (OffDefault,
      Dirty(kind), PathMissing, FetchFailed, PullFailed). Today it's all
      free-form strings.
- [ ] Include each repo's `on_default` and `dirty` state in the result so
      the frontend knows which contextual actions to offer without extra
      round-trips.

### Frontend

- [ ] Add "Bulk concurrency" slider (1–16) to `SettingsDialog.tsx`.
- [ ] Replace the current summary-text dialog with a result panel that
      groups rows by outcome:
      - ✓ Updated (repo name + commit count fast-forwarded)
      - ⏭ Skipped (reason code → friendly label + action buttons)
      - ✗ Failed (error category + expand to see stderr)
- [ ] For each skipped/failed row, render the relevant action buttons:
      - OffDefault: "Open terminal here" (user switches branches manually)
      - Dirty: "Open folder", "Open terminal" (user resolves)
      - PathMissing: "Remove from dashboard" (with confirmation)
      - FetchFailed / PullFailed: "View error", "Retry" (re-runs just
        this repo)
- [ ] Keep the existing summary-count header for at-a-glance scanning.

### Tests

- [ ] Semaphore integration test: spawn 20 mock repos, assert at most N
      are running concurrently. (Mock the `run_git` call behind a trait
      or a feature flag so this doesn't require real repos.)

## Risk / open questions

- **Retry action:** running a single-repo fetch from inside the bulk
  result panel is fine — existing `git_fetch` / `git_pull_ff` commands
  work. Make sure the panel updates in place (row moves from "Failed" to
  "Updated").
- **Semaphore in the right place:** apply it in the bulk command, not
  globally. Single-repo operations should bypass it so the Fetch/Pull
  buttons on individual rows stay responsive during a bulk run.
- **Cancellation still not a goal:** bulk ops remain uncancellable in
  this phase. Add a future-V2 note if needed.

## Dependencies

None — independent of Phases 1/2.
