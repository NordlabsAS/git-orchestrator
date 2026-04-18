# Phase 4: Error classification & auth diagnostics

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** Medium
**Type:** feature
**Apps:** repo-dashboard
**Effort:** medium
**Parent:** git-workflow-safety/00-overview.md

## Scope

Pattern-match git stderr into categorized errors with friendly next-step
messages, replacing the current "raw stderr in a red box" behavior. Focus
on the failure modes most common on Windows + corporate environments:

| Category      | Triggers                                                          | Suggested action                                        |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| AuthSSH       | `Permission denied (publickey)`, `Host key verification failed`   | "Open terminal to run `ssh -T git@<host>` and accept"   |
| AuthHTTPS     | `fatal: could not read Username`, `Authentication failed`         | "Git Credential Manager popup may be blocked"           |
| CertInvalid   | `SSL certificate problem`, `unable to get local issuer`           | "Your network may use a corporate CA — see settings"    |
| DirtyTree     | `Your local changes to the following files would be overwritten`  | "Commit or stash your changes first. Open terminal?"    |
| NotFFable     | `Not possible to fast-forward`, `fatal: Need to specify how`      | "Your branch has diverged. Open terminal to resolve"    |
| NetworkFailed | `Could not resolve host`, `Connection timed out`, `early EOF`     | "Check network; retry."                                 |
| RateLimited   | `429`, `rate limit exceeded`                                      | "Wait and retry."                                       |
| UnknownGit    | anything else                                                     | Raw stderr (expand-on-click)                            |

Add an optional "Diagnose auth" button that re-runs the last failed command
with `GIT_TRACE=1 GIT_TRACE_CURL=1`, sanitizes (redact tokens), and shows
the captured trace in an info dialog.

## Why this matters

Per the audit research:

- OpenSSH askpass silently hangs from GUIs (no TTY) — users see "it's taking
  a long time" instead of "SSH passphrase prompt needed."
- GCM popups during bulk operations can stack and be dismissed by accident.
- Self-signed corporate certs produce unhelpful raw errors.
- Stale proxy env from when the GUI launched is invisible.

These are all pattern-matchable. This is the Nordlabs `ErrorClassifier`
convention (from global `CLAUDE.md` → Error Handling Convention) applied to
git subprocess stderr.

## Checklist

### Backend

- [ ] New module `src-tauri/src/git/errors.rs` with:
      - `GitErrorCategory` enum (the table above)
      - `classify(stderr: &str) -> GitErrorCategory` (pure, regex-free
        string matching, unit-testable)
      - `sanitize(stderr: &str) -> String` (redact tokens, user@host in
        URLs, PAT-looking strings)
- [ ] Wrap `runner::run_git` / `run_git_raw` output: return
      `Result<Output, ClassifiedGitError>` where `ClassifiedGitError`
      carries `{ category, raw_stderr, sanitized, command }`.
- [ ] Plumb the new error type through `commands/git_ops.rs`. Update the
      IPC error shape (or wrap at the `#[tauri::command]` boundary) so
      the frontend receives `{ category, message, hint, raw? }`.
- [ ] New command `diagnose_last_error(repo_id)` that re-runs the last
      failed operation for that repo (held in a session `HashMap`) with
      `GIT_TRACE` env vars. Gate behind a "Diagnose auth" button.

### Frontend

- [ ] Update `src/lib/tauri.ts` types: the invoke wrapper now throws a
      `ClassifiedError` object, not a string.
- [ ] New component `components/errors/GitErrorPanel.tsx` rendering the
      category icon + friendly hint + "Show raw stderr" expander +
      "Diagnose auth" button (only for Auth*/Cert categories).
- [ ] Replace error dialogs across `App.tsx`, `Sidebar.tsx`, `RepoActions.tsx`
      with the new `GitErrorPanel`.
- [ ] For `DirtyTree` errors during pull: surface the "Open terminal
      here" button inline, since that's the primary fix path.

### Tests

- [ ] Unit tests for `classify()` against a corpus of real git stderr
      (drop into `src-tauri/src/git/errors.rs::tests`):
      - SSH permission denied (two variants)
      - GCM auth failure
      - Self-signed cert error
      - Dirty-tree overwrite
      - Diverged branches (`pull --ff-only` failure)
      - DNS resolution failure
- [ ] Unit tests for `sanitize()` — assert PAT-looking strings and
      `user@host` prefixes are redacted.

## Risk / open questions

- **Sanitization correctness:** don't over-redact and hide the actual
  error. Test against the corpus before each release.
- **Last-failed-command tracking:** the "Diagnose" button needs access
  to the *original* args. Store a `HashMap<i64, LastCommand>` keyed by
  repo_id, with TTL ~5 min. Don't persist to disk.
- **`GIT_TRACE` noise:** trace output can be 10-100KB. Truncate to
  10KB head + tail with a "..." in the middle before display.
- **Scheduled tasks vs interactive:** this app is always interactive,
  so no `trigger_type` variation needed — unlike the server-side
  Sentinel convention.

## Dependencies

None — independent of other phases.
