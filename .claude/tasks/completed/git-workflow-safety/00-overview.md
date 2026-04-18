# Git workflow safety improvements

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** High
**Type:** feature
**Apps:** repo-dashboard
**Effort:** large

## Overview

Audit of the current git workflow surface (fetch, pull-ff, force-pull, bulk ops,
status, log) against industry practice (GitKraken, Tower, Lazygit, Sublime Merge,
GitHub Desktop, multi-git-status, mgitstatus) identified a cluster of safety,
transparency, and diagnostic gaps worth closing.

The app's foundations are strong — single `Command::new("git")` entry point,
`--ff-only` as the only pull mode, double-gated force-pull, URL allowlist — so
this epic focuses on **post-action trust** (reflog rescue, undo, audit log),
**pre-action disclosure** (what will actually be lost), and **error legibility**
(auth failures, dirty-tree pulls, bulk op results).

Nothing in this epic adds new destructive git operations. The threat model stays
the same; we're making existing destructive ops safer to live with and existing
errors easier to resolve.

## Background

Full audit in the session transcript dated 2026-04-18. Key findings:

- **Above industry baseline today:** single git entry point, `--ff-only` pull,
  double-gated force-pull, URL allowlist, bulk-pull categorization.
- **Gaps closed by this epic:** no reflog rescue hint after `reset --hard`,
  no disclosure of what force-pull will lose, no audit trail, bulk failures
  show raw stderr, no concurrency cap, no submodule awareness, no auth error
  classification.
- **Explicitly not in scope:** reflog browser, interactive rebase, stash UI,
  branch ops, push, `git clean`, auto-stash-on-pull. These push into git-GUI
  territory and violate the "monitor, don't edit" thesis in `CLAUDE.md`
  non-goals.

## Phases

- [x] Phase 1: Destructive action audit trail → `completed/01-audit-trail.md`
- [x] Phase 2: Force-pull preview & disclosure → `completed/02-force-pull-preview.md`
- [x] Phase 3: Bulk operation UX polish → `completed/03-bulk-ux.md`
- [x] Phase 4: Error classification & auth diagnostics → `completed/04-error-classifier.md`
- [x] Phase 5: Status model extensions → `completed/05-status-model.md`
- [x] Phase 6: Safety invariants & documentation → `completed/06-docs-invariants.md`

## Acceptance criteria for the epic

- Every destructive action (today: force-pull; future: any `reset --hard`,
  `clean -fd`, push --force) captures pre-operation HEAD before it runs and
  logs to a new `action_log` SQLite table.
- Force-pull success toast shows previous HEAD short SHA + one-click Undo
  button for the session.
- Force-pull confirmation dialog discloses unpushed commit count, dirty-file
  summary, and untracked files that would be overwritten.
- Bulk fetch/pull reports show per-repo actionable rows (open folder,
  force-pull where legal) instead of opaque "skipped: dirty" lines.
- Bulk ops respect a configurable concurrency cap (default 4–6) to avoid
  GCM popup storms and VPN rate limiting.
- Git command failures are classified (auth / dirty-tree / network / unknown)
  with friendly next-step messages, not raw stderr.
- Submodule-containing repos carry a distinct pill so users know the
  dashboard's "clean" state may be partial.
- `CLAUDE.md` invariants 10–11 codify the new safety model. `docs/safety-model.md`
  explains consent tiers.

## Non-goals (reject scope creep)

- Reflog browser / walk-back UI (Lazygit's territory)
- Auto-stash-and-pop during pull (GitHub Desktop's stash-clobber bugs show
  the cost; match Sourcetree's "tell the user, let them stash" stance)
- `git clean -fd` as part of force-pull (untracked files are the user's
  escape hatch — Tower/GitKraken/Fork all preserve them)
- Interactive rebase, cherry-pick, branch ops, push (all in `CLAUDE.md` non-goals)
