# Phase 2: Force-pull preview & disclosure

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** High
**Type:** feature
**Apps:** repo-dashboard
**Effort:** medium
**Parent:** git-workflow-safety/00-overview.md
**Dependencies:** git-workflow-safety/01-audit-trail.md

## Scope

Before the user ticks the confirmation checkbox in `ForcePullDialog`, compute
and display exactly what `git reset --hard origin/<default>` will discard:

1. **N unpushed commits** — commits reachable from HEAD but not from
   `origin/<default>`. Already computed by `status::ahead_behind`; surface
   the count + short SHA list of the top N.
2. **Dirty file summary** — the same porcelain data already parsed by
   `dirty_from_porcelain`, but broken down by category with counts:
   "3 staged, 1 unstaged, 2 untracked".
3. **Untracked collision preview** — run `git clean -n -d` (dry-run) against
   what `reset --hard` would overwrite. Actually this is a subtle one: `reset
   --hard` does NOT remove untracked files, but it *will* overwrite tracked
   files. Clarify in the dialog that untracked files are preserved.

Tower's "we found N unmerged commits, here's the warning" pattern is the
reference. Match that disclosure density — raw numbers, no prose bloat.

## Checklist

### Backend

- [ ] New command `force_pull_preview(repo_id)` in `commands/git_ops.rs` that
      returns a `ForcePullPreview` struct:
      ```rust
      struct ForcePullPreview {
          current_branch: String,
          default_branch: String,
          on_default: bool,
          ahead: u32,                          // will be discarded
          behind: u32,                         // will be fast-forwarded
          unpushed_commits: Vec<Commit>,       // up to 10 for display
          dirty: DirtyBreakdown,               // counts per category
          remote_head_sha: Option<String>,     // what HEAD will become
      }
      ```
- [ ] Add `DirtyBreakdown { staged: u32, unstaged: u32, untracked: u32 }` to
      `git/status.rs`. Derive from the existing porcelain parser — no new
      git calls.
- [ ] New git helper `unpushed_commits(path, default_branch, limit)` that
      runs `git log origin/<default>..HEAD --pretty=... -n<limit>` and reuses
      `parse_log()`.
- [ ] Do NOT pre-fetch inside the preview. Preview reflects the *currently
      known* remote state; stale is fine and honest. If the user wants
      freshness, they fetch first. (This is different from the force-pull
      operation itself, which DOES fetch first.)

### Frontend

- [ ] Modify `ForcePullDialog.tsx` to call `forcePullPreview(id)` when
      opened and render the preview while the checkbox stays unchecked.
- [ ] Display sections (collapsed-by-default if empty):
      - Header: "Force pull `<repo>` — resetting `<branch>` to
        `origin/<branch>`"
      - Red box: "This will discard:"
        - "N local commits" (expandable list of short SHAs + messages)
        - "N staged / N unstaged file changes"
      - Yellow box: "Untracked files are preserved" (with count)
      - Gray box: "Fast-forward N new commits from remote" (if `behind > 0`)
- [ ] If `on_default === false`, render the existing refusal message
      (preview skips the heavy work). Backend should return early with a
      minimal preview in that case.
- [ ] Loading state: spinner while preview loads; show "Preview
      unavailable (<err>)" if the command fails, but still allow the user
      to proceed via the existing checkbox (fail-open — don't block the
      user from force-pulling because preview broke).

### Tests

- [ ] Unit test for `DirtyBreakdown` against sample porcelain output.
- [ ] Unit test for `unpushed_commits` parser against sample git output.

## Risk / open questions

- **Cost of the preview call:** one `rev-list` + one `log` + one `status`,
  all local, all fast. Should be <100ms even on large repos. Measure; if
  it's not, add a spinner with a 1s delay before showing.
- **Stale remote state:** preview might understate discarded commits if a
  fetch ran during the preview. Acceptable — the force-pull itself fetches
  fresh, and the user will see the actual discard count in the Phase 1
  result toast.
- **Very large unpushed lists:** cap at 10 in the display; if `ahead > 10`,
  show "N unpushed commits (showing latest 10)".

## Dependencies

Phase 1 (`01-audit-trail.md`) — the result toast from Phase 1 renders the
*actual* discarded commits after the fact. Phase 2 shows the *expected* ones
before. They share display patterns; keep them visually consistent.
