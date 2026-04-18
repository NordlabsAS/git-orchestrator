# Phase 1: Destructive action audit trail

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** High
**Type:** feature
**Apps:** repo-dashboard
**Effort:** medium
**Parent:** git-workflow-safety/00-overview.md

## Scope

Capture pre-operation HEAD before any destructive git action runs, log the
full action (repo, command, pre-HEAD, post-HEAD, stderr) to a new SQLite
`action_log` table, and surface both in the UI: reflog rescue hint in the
success toast, plus a one-click "Undo" button that restores the captured HEAD
via `git reset --hard <pre-head-sha>` for the remainder of the session.

Today's single destructive op is `git_force_pull`. Design the infrastructure
so future destructive ops (push --force-with-lease, clean -fd, reset --hard
arbitrary) plug in without schema or UI rework.

## Why this first

Reflog rescue is the single highest-leverage low-effort win from the audit —
one `rev-parse HEAD` before `reset --hard` plus a toast line transforms the
user experience after an unintended force-pull. Wrapping it in a proper audit
log at the same time costs one migration and unlocks Phase 6's CLAUDE.md
invariant 10 ("destructive ops must log pre-HEAD before execution").

## Checklist

### Backend

- [ ] Add `action_log` migration to `src-tauri/src/db/schema.rs::MIGRATIONS`
      with columns: `id`, `repo_id`, `action` (force_pull|reset|future...),
      `pre_head_sha`, `post_head_sha`, `exit_code`, `stderr_excerpt`,
      `started_at`, `duration_ms`.
- [ ] Add `db::queries::insert_action_log` + `recent_actions_for_repo(id, limit)`.
- [ ] Modify `commands/git_ops.rs::git_force_pull` to:
      1. Capture pre-HEAD via `status::current_head_sha()` (new helper in
         `git/status.rs` using `git rev-parse HEAD`).
      2. Execute the fetch + reset pair.
      3. Capture post-HEAD.
      4. Insert one row into `action_log`.
      5. Return a richer response struct `ForcePullResult { pre_head, post_head,
         discarded_commit_count, stderr }` instead of bare `String`.
- [ ] Add `undo_last_action(repo_id)` command that reads the latest
      `action_log` row for that repo, runs `git reset --hard <pre_head_sha>`,
      and logs *itself* as an `undo` action (so undo is also recoverable).
      Refuse if working tree is dirty (user has made new changes since).
- [ ] Extend the `ErrorClassifier` enum in `models.rs` if needed.

### Frontend

- [ ] Update `src/lib/tauri.ts` with the new `ForcePullResult` type and
      `undoLastAction(id)` wrapper.
- [ ] Update `src/types.ts` to mirror the new result struct.
- [ ] Update `ForcePullDialog.tsx` result panel to render:
      - "Discarded N commits on <repo>. Previous HEAD was `<pre-head-short>`."
      - "Recover via `git reflog` within 90 days, or click Undo below."
      - A prominent "Undo (restore `<pre-head-short>`)" button that calls
        `undoLastAction(id)`.
- [ ] Undo button transitions to disabled state after the session ends
      (page reload) — Undo is best-effort, not a persistent affordance.
- [ ] Show a toast/info dialog on undo success with the restored SHA.

### Tests

- [ ] Rust unit tests for the new `ForcePullResult` shape (pre/post capture).
- [ ] Integration test: force-pull a test repo with a committed local change,
      then undo, assert commit is back. (Gated behind `cargo test --features
      integration` so it's opt-in — the existing test suite is pure parsers.)

## Risk / open questions

- **Undo on dirty tree:** if the user edited files after force-pull but before
  clicking Undo, we can't safely restore without losing the new work. Refuse
  with a clear message; do not auto-stash.
- **Multiple force-pulls in sequence:** Undo always restores the most recent
  action's `pre_head_sha` — so undoing after a second force-pull restores to
  the state *before the second one*, not the original. Make this explicit in
  the Undo button tooltip: "Undo last action".
- **Retention:** action_log grows unbounded. Add a `PRAGMA` or periodic VACUUM
  later — for MVP, one row per force-pull is fine (users will force-pull
  tens of times per year, not thousands).

## Dependencies

None. This is the foundation phase.
