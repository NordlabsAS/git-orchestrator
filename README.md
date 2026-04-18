# Repo Dashboard

A local desktop app for monitoring and syncing many git repositories from one
always-on window. Instead of opening each repo in Git Bash and running `git
status` / `git fetch` / `git pull`, you see every registered repo in one
dashboard with live status and one-click actions.

Built with Tauri 2 + Rust + React 19 + TypeScript. Shells out to the system
`git` CLI (not `git2`/libgit2) so behaviour matches your terminal exactly.

## Screenshots

_(Not included in the repo. Run the app to see it.)_

## Features

- **Per-repo status** — current branch, default branch, ahead/behind counts,
  dirty state (clean/unstaged/staged/untracked/mixed), last fetch time, latest
  commit (SHA/message/author/time), remote URL.
- **Per-repo actions** — Fetch, Pull (ff-only), Force pull (guarded), Open
  folder, Open terminal, Open remote, Open commit, Expand last-10-commits log.
- **Bulk actions** — Fetch all in parallel, Pull all safe (only clean repos on
  default branch), Refresh all.
- **Drag-drop reorder**, inline rename, remove-from-dashboard.
- **Auto-refresh** every N minutes (configurable), with manual refresh available
  at any time.
- **System tray** — minimise-to-tray on close, right-click menu with Show
  Window / Fetch All / Quit, tooltip shows live status summary (behind/dirty/
  error counts).
- **Settings** — terminal preference (Windows Terminal → Git Bash → cmd), auto-
  refresh interval, default browse directory, theme (dark/light/system).

## Quick start

```bash
# prerequisites: Node 20+, Rust stable, MSVC Build Tools (Windows)
npm install
npm run tauri dev             # hot-reload dev (frontend + Rust)
npm run tauri build           # MSI + NSIS installers under src-tauri/target/release/bundle/
```

Rust tests:
```bash
cd src-tauri && cargo test --lib
```

## Project layout

| Path | Purpose |
|---|---|
| `src-tauri/src/lib.rs` | Tauri builder — plugins, tray, window events, command handler registration |
| `src-tauri/src/commands/` | `#[tauri::command]` handlers — one file per domain |
| `src-tauri/src/git/` | Pure git parsers (porcelain, log, remote URL) + the single `Command::new("git")` |
| `src-tauri/src/db/` | SQLite schema + migrations + queries (rusqlite, bundled) |
| `src-tauri/src/tray.rs` | Tray icon, menu, tooltip, close-to-tray |
| `src/lib/tauri.ts` | Single typed IPC wrapper — the only place `invoke` is imported |
| `src/stores/` | Zustand stores (repos, settings, ui) |
| `src/components/` | React UI — Sidebar, RepoList, RepoRow, RepoActions, RepoLogPanel, dialogs |

See [`CLAUDE.md`](./CLAUDE.md) for architectural invariants and [`docs/`](./docs/)
for deeper architecture notes and debugging guides.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architectural invariants, build commands, code layout
- [`docs/architecture.md`](./docs/architecture.md) — data flow, concurrency model, file responsibility map
- [`docs/debugging.md`](./docs/debugging.md) — log locations, DB reset, troubleshooting
- [`docs/contributing.md`](./docs/contributing.md) — how to add a command, component, migration, or parser
- [`project-requirements.md`](./project-requirements.md) — original design spec

## License

Not published externally — single-user internal tool.
