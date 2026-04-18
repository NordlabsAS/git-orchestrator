# Phase 6: Safety invariants & documentation

**Status:** ✅ Completed
**Completed:** 2026-04-18
**Priority:** Medium
**Type:** docs
**Apps:** repo-dashboard
**Effort:** small
**Parent:** git-workflow-safety/00-overview.md
**Dependencies:** git-workflow-safety/01-audit-trail.md, git-workflow-safety/04-error-classifier.md

## Scope

Codify the safety model introduced by phases 1–5 so future-you doesn't
regress it. Three deliverables:

1. New `CLAUDE.md` invariants:
   - **Invariant 10**: Destructive ops must capture pre-operation HEAD
     before execution and log a row to `action_log`.
   - **Invariant 11**: Any future force-push must use `--force-with-lease
     --force-if-includes`, never bare `--force`. (Locks in the research
     finding from microsoft/vscode#144635 — auto-fetch breaks naive
     `--force-with-lease`.)
2. New `docs/safety-model.md` explaining the consent tiers:
   - Tier 0: No guard (fetch, status, log — read-only)
   - Tier 1: Disabled button + tooltip (pull while busy, force-pull off-default)
   - Tier 2: Checkbox dialog with disclosure (force-pull)
   - Tier 3: Typed confirmation (reserved for future irreversible ops —
     not used yet)
3. In-app explainer link in `SettingsDialog` and `ForcePullDialog`: "What
   does force pull do?" opens a short markdown page in a dialog (or
   just `openUrl` to the repo's `docs/safety-model.md` on GitHub if the
   repo is public — TBD).

## Checklist

- [ ] Edit `CLAUDE.md` §"Architectural invariants" — add invariants 10
      and 11 with the phrasing above. Reference the phases that
      implement them.
- [ ] Create `docs/safety-model.md` with:
      - The consent-tier table
      - A "What's protected and how" section covering force-pull's
        double-gate (backend branch check + frontend disable + checkbox
        + disclosure + audit log + reflog rescue)
      - A "Recovery procedures" section linking `git reflog`, the Undo
        button, and manual recovery steps
      - A "Future destructive ops" checklist anyone adding a new
        destructive command must walk through
- [ ] Update `docs/architecture.md` to cross-reference `safety-model.md`.
- [ ] Update `docs/debugging.md` with a "When force-pull goes wrong"
      section pointing at reflog + Undo + action_log.
- [ ] Update `docs/contributing.md` — "how to add a command" must now
      call out: "if destructive, read `safety-model.md` first."
- [ ] Add a "Safety & recovery" section to `SettingsDialog.tsx` (or a
      new `InfoDialog.tsx` tab) with:
      - A one-paragraph summary of what force-pull does
      - A link/button to view the action_log for the currently-selected
        repo (read-only table of recent destructive actions)

## Dependencies

Blocked on Phases 1 and 4 because the docs describe the invariants they
introduce. Fine to draft the prose in parallel, but don't merge until the
described behavior exists in code — stale invariants are worse than no
invariants.

## Risk / open questions

- **In-app markdown rendering:** the app has no markdown renderer today.
  Either add a minimal one (react-markdown — small) or punt by opening
  the GitHub-rendered page via `openUrl`. Decide based on whether the
  repo is public at the time this phase ships.
- **Invariant 11 is hypothetical** — the app doesn't push. Document it
  anyway so when someone adds push, the default is safe. Cite the
  research (microsoft/vscode#144635) inline.
