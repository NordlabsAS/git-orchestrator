# Repo Dashboard — Project Specification

## Project Goal

Build a local desktop application for Windows (ARM64) that provides a persistent, interactive dashboard for managing multiple git repositories in parallel. The app solves the problem of manually opening and running git commands across 10+ projects by providing a single interface for monitoring repo state and executing common git operations.

## Problem Statement

Maintaining many repos in parallel currently requires:
- Opening each repo folder individually in Git Bash
- Running `git status`, `git fetch`, `git pull` manually per repo
- No unified view of which repos are behind origin, dirty, or need attention
- No fast way to jump between a repo's folder, its GitHub page, or a terminal scoped to it

This tool eliminates that friction by showing all registered repos in one view, with one-click actions for the most common operations and direct links into the terminal/filesystem/remote when manual work is needed.

## Non-Goals

- **Not a git GUI.** No staging, committing, branch management, merge conflict resolution. Use Git Bash, VS Code, or lazygit for real work.
- **Not a CI/CD dashboard.** No build status, PR tracking, or deployment integration.
- **Not cross-device sync.** Single-machine tool. Repo list lives in local SQLite.
- **Not multi-user.** Single-user, no auth, no sharing.
- **Not a replacement for Cadency/DevPulse.** Those track activity and productivity. This tracks sync state and provides quick actions.

## Target User

One user: a developer with 10+ local git repos who works primarily in Git Bash on Windows and wants a lightweight always-available view of repo state.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Tauri 2.x | Small binary (~5MB), secure IPC, native ARM64 build |
| Backend | Rust | Tauri default; shells out to `git` CLI rather than using `git2` crate (simpler, matches user's git behavior exactly) |
| Frontend | React 18 + TypeScript + Vite | Familiar stack |
| Styling | Tailwind CSS | Fast iteration, no CSS file sprawl |
| State | Zustand | Simpler than Redux for this scope |
| Storage | SQLite via `rusqlite` | File-based, zero-config, lives in `%APPDATA%\RepoDashboard\` |
| Icons | Lucide React | Clean, matches modern app aesthetics |

## Platform

- Primary: Windows 11 ARM64 (user's Surface)
- Should build for Windows x64 as well without changes
- macOS/Linux not required but Tauri supports them if wanted later

---

## Core Features (MVP)

### 1. Repo Registry
- Add repo by browsing to a local folder (Tauri dialog plugin)
- Remove repo (with confirmation)
- Rename repo (display name only; path is immutable)
- Reorder repos by priority (drag-and-drop)
- Persist list in SQLite

### 2. Repo Status Display
For each registered repo, show:
- Display name + path
- Current branch
- Ahead/behind counts vs upstream
- Dirty state: clean / unstaged changes / staged changes / untracked files
- Default branch (main/master, detected)
- Last fetch timestamp
- Latest commit: SHA (short), message (first line), author, relative time
- Link indicator if remote is GitHub/GitLab/Azure DevOps

### 3. Per-Repo Actions
Each row has buttons for:
- **Fetch** — `git fetch --all --prune`
- **Pull (ff-only)** — safe pull, fails if not fast-forward
- **Force pull** — `git fetch && git reset --hard origin/<default_branch>` — **requires confirmation dialog**, only enabled when on default branch
- **Open folder** — opens folder in Windows Explorer
- **Open terminal** — opens Windows Terminal (preferred) or Git Bash, scoped to that folder
- **Open remote** — opens repo URL in default browser (GitHub/GitLab/etc., parsed from `origin` remote)
- **Open latest commit** — opens commit URL in browser
- **View log** — expands an inline panel showing last 10 commits with message, author, time, SHA

### 4. Bulk Actions
- **Fetch all** — fetch every repo in parallel, show progress
- **Pull all clean repos on default branch** — safe bulk pull with summary of what was updated/skipped/blocked
- **Refresh all** — re-read status for all repos without fetching

### 5. Auto-refresh
- Configurable interval (default: 5 minutes) for background fetch + status refresh
- Manual refresh button always available
- Visual indicator when a refresh is in progress

### 6. Settings
- Default terminal: Windows Terminal / Git Bash / custom command
- Auto-refresh interval
- Default repos directory (for "Add repo" starting point)
- Theme: light/dark/system

---

## Features Deferred to V2

- Run history log (what commands ran when, exit codes, output)
- Notifications on new commits to watched branches
- Grouping/tagging repos (e.g., "Work", "Personal", "HELP")
- Filter/search the repo list
- Custom git command runner (whitelist of allowed commands beyond the built-ins)
- Streaming command output panel for long-running commands
- Import repo list from a directory scan (find all `.git` folders under a root)

---

## Data Model

### SQLite Schema

```sql
CREATE TABLE repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                    -- display name
    path TEXT NOT NULL UNIQUE,             -- absolute path to repo
    priority INTEGER NOT NULL DEFAULT 0,   -- lower = higher in list
    added_at TEXT NOT NULL                 -- ISO8601
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX idx_repos_priority ON repos(priority);
```

### Runtime Status (not persisted)

```typescript
interface RepoStatus {
  id: number;
  name: string;
  path: string;
  branch: string;
  defaultBranch: string;
  ahead: number;
  behind: number;
  dirty: 'clean' | 'unstaged' | 'staged' | 'untracked' | 'mixed';
  lastFetch: string | null;      // ISO timestamp
  latestCommit: {
    sha: string;
    shaShort: string;
    message: string;
    author: string;
    timestamp: string;
  } | null;
  remoteUrl: string | null;      // https URL to repo web UI
  error: string | null;          // populated if git command failed
}
```

---

## Backend (Rust / Tauri) — Command Surface

All commands exposed via `#[tauri::command]` and callable from the frontend through Tauri's IPC.

### Repo management
```rust
async fn list_repos() -> Result<Vec<Repo>, String>
async fn add_repo(path: String, name: Option<String>) -> Result<Repo, String>
async fn remove_repo(id: i64) -> Result<(), String>
async fn rename_repo(id: i64, new_name: String) -> Result<(), String>
async fn reorder_repos(ordered_ids: Vec<i64>) -> Result<(), String>
```

### Status
```rust
async fn get_repo_status(id: i64) -> Result<RepoStatus, String>
async fn get_all_statuses() -> Result<Vec<RepoStatus>, String>
async fn get_repo_log(id: i64, count: u32) -> Result<Vec<Commit>, String>
```

### Git operations
```rust
async fn git_fetch(id: i64) -> Result<String, String>
async fn git_pull_ff(id: i64) -> Result<String, String>
async fn git_force_pull(id: i64) -> Result<String, String>
async fn git_fetch_all() -> Result<Vec<(i64, Result<String, String>)>, String>
async fn git_pull_all_safe() -> Result<BulkPullReport, String>
```

### System integration
```rust
async fn open_folder(id: i64) -> Result<(), String>
async fn open_terminal(id: i64) -> Result<(), String>
async fn open_remote(id: i64) -> Result<(), String>
async fn open_commit(id: i64, sha: String) -> Result<(), String>
```

### Settings
```rust
async fn get_setting(key: String) -> Result<Option<String>, String>
async fn set_setting(key: String, value: String) -> Result<(), String>
```

### Implementation notes for the Rust side
- Use `std::process::Command` to shell out to `git`. Don't use `git2` crate — avoids libgit2 behavior differences vs user's installed git
- All git calls go through a helper: `run_git(repo_path, args) -> Result<String, GitError>` — captures stdout/stderr/exit code
- For "open terminal": detect `wt.exe` in PATH first, fall back to `C:\Program Files\Git\git-bash.exe --cd=<path>`, finally fall back to `cmd /c start cmd /K "cd /d <path>"`
- For "open folder": `std::process::Command::new("explorer").arg(path)`
- For "open URL in browser": use Tauri's `shell` plugin with `open` scoped to https URLs
- Parse remote URL to web URL: handle `git@github.com:org/repo.git`, `https://github.com/org/repo.git`, Azure DevOps SSH, GitLab — strip `.git`, normalize to `https://host/path`
- Default branch detection: `git symbolic-ref refs/remotes/origin/HEAD`, fall back to checking for `main` then `master`
- Dirty detection: `git status --porcelain=v1` → parse first two columns per line

---

## Frontend — Component Tree

```
App
├── Sidebar
│   ├── AddRepoButton
│   ├── BulkActionsMenu (Fetch all, Pull all safe, Refresh all)
│   ├── SettingsButton
│   └── AutoRefreshIndicator
├── RepoList (drag-drop sortable)
│   └── RepoRow (for each repo)
│       ├── RepoHeader (name, branch, status pills)
│       ├── RepoStats (ahead/behind, dirty state, last fetch)
│       ├── RepoLatestCommit (message, author, sha, time, link)
│       ├── RepoActions (Fetch, Pull, Force pull, Open folder, Open terminal, Open remote)
│       └── RepoLogPanel (expandable; last 10 commits)
├── AddRepoDialog
├── RemoveRepoConfirmDialog
├── ForcePullConfirmDialog
└── SettingsDialog
```

### State management (Zustand stores)
- `useReposStore` — repo list, statuses, CRUD actions, refresh logic
- `useSettingsStore` — settings with persistence
- `useUIStore` — expanded rows, open dialogs, refresh-in-progress flags

### Styling rules
- Dark theme first, light theme supported
- Dense but readable: one repo per row, ~60–80px tall collapsed
- Color coding: green (clean/up-to-date), yellow (behind/untracked), red (dirty/diverged/error)
- Use Lucide icons for all actions; show tooltips on hover

---

## Security Considerations

- No network server. All IPC is Tauri's internal channel — not exposed to the network.
- No arbitrary shell execution from frontend. Backend exposes a fixed set of git operations; frontend passes repo IDs, never raw command strings.
- "Force pull" requires explicit confirmation dialog every time. No "don't ask again" option.
- URL opening uses Tauri's `shell` plugin with an allowlist restricted to `http://` and `https://` schemes.
- SQLite DB stored in `%APPDATA%\RepoDashboard\` — standard user-scope location, no elevation needed.

---

## Project Structure

```
repo-dashboard/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri app entry
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── repos.rs          # add/remove/list/rename/reorder
│   │   │   ├── status.rs         # status + log
│   │   │   ├── git_ops.rs        # fetch, pull, force pull
│   │   │   ├── system.rs         # open folder/terminal/url
│   │   │   └── settings.rs
│   │   ├── git/
│   │   │   ├── mod.rs
│   │   │   ├── runner.rs         # run_git helper
│   │   │   ├── status.rs         # parse porcelain output
│   │   │   ├── log.rs            # parse log output
│   │   │   └── remote.rs         # parse remote URLs → web URLs
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs         # migrations
│   │   │   └── queries.rs
│   │   └── models.rs             # Repo, RepoStatus, Commit structs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
├── src/                          # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── RepoList.tsx
│   │   ├── RepoRow.tsx
│   │   ├── RepoActions.tsx
│   │   ├── RepoLogPanel.tsx
│   │   ├── dialogs/
│   │   │   ├── AddRepoDialog.tsx
│   │   │   ├── RemoveRepoDialog.tsx
│   │   │   ├── ForcePullDialog.tsx
│   │   │   └── SettingsDialog.tsx
│   │   └── ui/                   # generic primitives (Button, Dialog, etc.)
│   ├── stores/
│   │   ├── reposStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts
│   ├── lib/
│   │   ├── tauri.ts              # typed wrappers for all invoke() calls
│   │   └── format.ts             # time ago, commit formatting helpers
│   ├── types.ts
│   └── index.css                 # Tailwind entry
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
├── CLAUDE.md                     # Claude Code guidance
└── README.md
```

---

## CLAUDE.md Outline

The project should ship with a `CLAUDE.md` covering:
- Project purpose (paste the "Goal" and "Problem Statement" sections)
- Tech stack summary
- How to run: `npm install`, `npm run tauri dev`
- How to build: `npm run tauri build`
- Rust command pattern (where to add new commands, how they're registered in `main.rs`)
- Frontend invoke pattern (always go through `lib/tauri.ts`, never call `invoke()` directly from components)
- Git command conventions (always through `git/runner.rs`, never raw `Command::new("git")` in handlers)
- Testing approach (V2 concern; MVP can be manual)

---

## Build & Run

### Prerequisites
- Node.js 20+
- Rust (stable, via rustup)
- Tauri prerequisites for Windows: Microsoft C++ Build Tools, WebView2 (preinstalled on Win11)

### Scaffold command
```bash
npm create tauri-app@latest repo-dashboard -- --template react-ts
cd repo-dashboard
npm install
npm install zustand lucide-react @dnd-kit/core @dnd-kit/sortable
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Rust dependencies to add to `src-tauri/Cargo.toml`:
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1", features = ["full"] }
```

Tauri plugins to add:
```bash
cargo tauri add dialog
cargo tauri add shell
```

### Dev loop
```bash
npm run tauri dev      # hot-reload frontend, Rust rebuilds on change
npm run tauri build    # produces installer in src-tauri/target/release/bundle/
```

---

## Implementation Order (for Claude Code sessions)

1. **Scaffold + DB**: project init, SQLite setup, migrations, repos table CRUD via Rust commands
2. **Add/remove/list repos**: frontend UI for managing the repo list, no git yet
3. **Status reading**: `git/runner.rs`, `git/status.rs`, display branch/dirty/ahead/behind per row
4. **Latest commit + remote URL parsing**: `git/log.rs`, `git/remote.rs`, render in row
5. **Per-repo actions**: fetch, pull ff-only, open folder, open terminal, open remote
6. **Force pull with confirmation dialog**
7. **Log panel**: expandable per-row, last 10 commits
8. **Bulk actions**: fetch all, pull all safe, refresh all
9. **Auto-refresh**: configurable interval, background refresh
10. **Settings dialog**: terminal preference, refresh interval, theme
11. **Drag-drop reordering**
12. **Polish**: empty states, error handling, loading indicators, keyboard shortcuts

Each step should be a clean, committable unit.

---

## One flag for you

This spec assumes a single-window always-on desktop app. Consider whether you also want a **system tray icon** with "Fetch all" / "Show window" / quick status. Adds ~1 hour of work and makes the app feel more native. If yes, add Tauri's `tray-icon` feature now; retrofitting later is a minor but real pain. Want this in MVP, V2, or skipped?