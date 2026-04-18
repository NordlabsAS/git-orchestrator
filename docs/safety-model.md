# Safety model

This document captures how Repo Dashboard protects users from destructive
git actions, and how to keep it that way when adding new commands. It's
the canonical reference for CLAUDE.md invariants 15 and 16.

## Consent tiers

Every user-facing action falls into one of four tiers. Pick the minimum
sufficient tier — over-guarding is as bad for trust as under-guarding.

| Tier | Gate | When to use | Examples |
|------|------|-------------|----------|
| 0 — None | No guard | Read-only ops, idempotent fetch, opening folders | `git_fetch`, `get_repo_status`, `open_folder`, `open_remote` |
| 1 — Disabled button | Button grays out, tooltip explains why | Action is meaningless or unsafe in current state | Pull button while a fetch is in flight; Force pull off default branch |
| 2 — Checkbox dialog + disclosure | Modal lists exactly what will be lost; user must tick "I understand"; no "don't ask again" | Irreversible ops that discard data | `git_force_pull` |
| 3 — Typed confirmation | User types a canonical token (repo name) to proceed | Catastrophic, rarely-needed ops | **Reserved.** Not used today. |

Tier 2 dialogs must re-request the checkbox every time. Offering "don't
ask again" is tempting but banned — the consent-fatigue cure is worse
than the disease, and the research convinced us (see `/audit-2026-04-18`
notes: GitKraken's `forcePushSkipSecondWarning` is specifically what we
did not want to replicate).

## What force-pull protects

Force-pull is the only Tier 2 action today. Six layers of defense:

1. **Backend branch guard** — `commands/git_ops.rs::git_force_pull` refuses
   unless `current_branch == default_branch`. Frontend can't bypass this.
2. **Frontend button disable** — `RepoActions.tsx` disables the button
   off-default with an explanatory tooltip.
3. **Checkbox dialog** — `ForcePullDialog.tsx` requires the user to tick
   "I understand this will discard local changes on X" every time.
4. **Pre-action disclosure** — `force_pull_preview` fetches and renders
   the exact number of unpushed commits, dirty file counts, and a note
   that untracked files are preserved. User sees what will be destroyed
   before confirming.
5. **Pre-HEAD capture + audit log** — before `reset --hard` runs, we
   record `rev-parse HEAD` and insert a row into `action_log` (migration
   `003_action_log`). This powers both the reflog-rescue hint in the
   success toast and the in-session Undo button.
6. **Session Undo button** — `undo_last_action` restores the captured
   pre-HEAD via `reset --hard <sha>`, but refuses if the working tree is
   dirty (new changes would be destroyed). The undo itself is logged
   as its own `action_log` row, so it's recoverable too.

## Recovery procedures

### User clicked force-pull and wants it back

1. If the success dialog is still open → click **Undo**. One click.
2. If the dialog was dismissed → `git reflog` in the repo terminal.
   Every `reset --hard` shows as `HEAD@{N}` with a commit SHA. Pick the
   one just before the force-pull and `git reset --hard HEAD@{N}`. The
   reflog survives at least 90 days by default.
3. If reflog was cleaned (rare) → git objects are still in `.git/objects`
   for ~2 weeks; use `git fsck --lost-found`.

### User can't remember what changed

Open the force-pull success dialog for the repo (the state persists
for the current session). Otherwise query the audit log via the
`get_action_log(id)` command — it carries pre-HEAD SHA, timestamp,
and a stderr excerpt for every destructive action.

### User wants to see what the dashboard has done on a repo

Call `get_action_log(id, 20)` from the console (future: surface as a
"Recent actions" panel in Settings — see the safety docs task).

## Future destructive ops

Before adding a new destructive command, walk this checklist:

1. **Can we avoid it?** Is there a non-destructive alternative? If yes,
   do that instead. Force-pull exists because `git pull --ff-only`
   refuses and the alternative was "user drops to a terminal."
2. **Backend guard.** What repo state must hold for this action to be
   safe? Enforce it in Rust — the frontend cannot be trusted.
3. **Pre-HEAD capture.** Before the mutation, record `rev-parse HEAD`
   via `status::current_head_sha`.
4. **Log to `action_log`.** Use `log_action` in `commands/git_ops.rs`,
   with a distinct `action` string (`"clean"`, `"reset"`, `"force_push"`,
   …). Carry pre-HEAD, post-HEAD, exit code, stderr excerpt, timestamp.
5. **Preview the damage.** A Tier 2 action needs a preview command
   that tells the user exactly what will be lost (files, commits, refs).
6. **Checkbox dialog.** No silent destruction. Tier 2 minimum.
7. **Undo plan.** Is the action recoverable from `reflog`? If yes,
   state so in the success toast. If no, require Tier 3 confirmation.

### Push-force is the next probable destructive op

Do NOT add a bare `--force`. Invariant 16: use both
`--force-with-lease` AND `--force-if-includes` (Git 2.30+). Here's why:

- `--force-with-lease=<ref>:<expected-remote-sha>` refuses if the
  remote moved since we last saw it. Classic safety.
- Our auto-refresh loop silently runs `git fetch` in the background.
  That fetch *updates* the lease's expected value to the current remote
  — which nullifies the check (microsoft/vscode#144635). If the user
  holds the force-push button open while a background fetch fires, the
  lease no longer matches what the user was reasoning about.
- `--force-if-includes` checks that the pushed commit includes (has as
  an ancestor) the ref the client last fetched. This survives background
  fetches because the *client's* view is the anchor, not the remote's.

So the correct command is:

```text
git push --force-with-lease --force-if-includes <remote> <branch>
```

And the backend must refuse if git is older than 2.30 (we can check
this once at startup).

## Why we don't auto-stash before pull

GitHub Desktop and Tower both auto-stash-and-pop around pull when the
tree is dirty. Tower made it the default; users love it. GitHub Desktop
has two open bugs (desktop/desktop#10956, #16577) where the stash is
silently overwritten or lost on aborted follow-up actions. We chose the
Sourcetree stance: surface a `DirtyTree` classified error via the
`GitErrorPanel` with an "Open terminal" button. The user stashes manually
and retains control. One fewer moving part, one fewer class of bug.

## Why we don't `git clean -fd` during force-pull

`git reset --hard` does not remove untracked files. That's by design in
git and across every mature GUI (Tower, GitKraken, Fork, Sublime Merge)
— untracked files are the user's escape hatch. A half-finished patch
sitting as a `.txt` scratchpad should survive a misclicked force-pull.
The `DirtyBreakdown` in the preview dialog is explicit: "N untracked
files preserved."

## Why type-to-confirm isn't used

Tier 3 (type the branch name to confirm) is reserved but not deployed.
Reasoning:

- Tier 2 + disclosure is enough for force-pull. The six layers above
  make accidental firing nearly impossible.
- Type-to-confirm is high-friction. NN/g research cites it as
  appropriate "sparingly, in very critical deletion operations." GitHub's
  web UI uses it for repo deletion; no mature git GUI uses it for
  day-to-day ops.
- If we ever add `git gc --aggressive --prune=now` or something
  reflog-unsafe, Tier 3 is the right level. Not before.

## Related files

- `src-tauri/src/commands/git_ops.rs` — the only file that runs
  destructive git ops. All of them go through `log_action`.
- `src-tauri/src/db/schema.rs` migration `003_action_log` — the table.
- `src-tauri/src/db/queries.rs::last_undoable_action` — what Undo reads.
- `src/components/dialogs/ForcePullDialog.tsx` — the Tier 2 dialog.
- `src/lib/gitErrors.ts` — classifier that renders `DirtyTree`,
  `AuthSSH`, `CertInvalid`, etc. as friendly hints instead of raw
  stderr.
- `docs/security.md` — the related, orthogonal hardening model (hostile
  `.git/config`, UNC paths, etc.).
