# Debugging guide

## Where things live on disk

| Purpose | Path |
|---|---|
| SQLite DB | `%APPDATA%\RepoDashboard\repo-dashboard.sqlite` |
| Rust build artefacts | `src-tauri/target/` (dev: `debug/`, release: `release/`) |
| Frontend bundle | `dist/` |
| Installer output | `src-tauri/target/release/bundle/{msi,nsis}/` |
| Tauri-downloaded WiX/NSIS | `src-tauri/target/release/{wix,nsis}/` |
| Node deps | `node_modules/` |
| Cargo deps | `~/.cargo/registry/`, `~/.cargo/git/` |

`%APPDATA%` is usually `C:\Users\<you>\AppData\Roaming\`. The app creates the
`RepoDashboard` directory on first launch via `db::init`.

## Viewing logs

### In `npm run tauri dev`
- **Frontend logs (console.log, errors)**: the WebView2 devtools window. Right-
  click anywhere in the app → "Inspect Element", or press `F12`.
- **Rust logs (println!, eprintln!, panics)**: the terminal where you ran
  `npm run tauri dev`. Cargo's compile output is also there.
- **Git subprocess output**: captured into Rust via `run_git_raw`, routed back
  to the frontend. On failure, the frontend shows it in `InfoDialog`.

### In a release build
The release build uses `windows_subsystem = "windows"` so there is no console.
For debugging a release-only issue:
1. Temporarily comment out that attribute in `src-tauri/src/main.rs`:
   ```rust
   // #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
   ```
2. Rebuild and re-run. A console window will attach to the process and print
   anything Rust writes to stdout/stderr.
3. Revert before committing.

For persistent logs, add `tracing` + `tracing-subscriber` with a file appender
and wire it up in `lib.rs`. Not currently done — keep in mind for V2.

## Resetting state

### Clear all repos + settings (nuclear option)
```powershell
Remove-Item "$env:APPDATA\RepoDashboard\repo-dashboard.sqlite"
```
Next launch will recreate the DB empty.

### Clear just the settings
```powershell
sqlite3 "$env:APPDATA\RepoDashboard\repo-dashboard.sqlite" "DELETE FROM settings;"
```

### Inspect the DB
Any SQLite browser works. From CLI:
```powershell
sqlite3 "$env:APPDATA\RepoDashboard\repo-dashboard.sqlite"
sqlite> .tables
sqlite> .schema repos
sqlite> SELECT * FROM repos;
sqlite> SELECT * FROM settings;
sqlite> SELECT * FROM ignored_paths;     -- paths suppressed from "Scan folder…"
sqlite> SELECT * FROM action_log;        -- destructive-op history (force_pull etc.)
sqlite> SELECT * FROM schema_migrations;
```

### Clear just the ignore list
```powershell
sqlite3 "$env:APPDATA\RepoDashboard\repo-dashboard.sqlite" "DELETE FROM ignored_paths;"
```
Equivalent to un-ignoring every entry from Settings → Ignored paths.

### Remove build artefacts (force clean rebuild)
```bash
cargo clean                  # from src-tauri/
rm -rf node_modules dist
npm install
npm run tauri build
```

## Common issues

### "path is not a git repository" when adding a repo
`add_repo` calls `git rev-parse --is-inside-work-tree` in that folder. Causes:
- The folder is a bare repo — not supported.
- You're pointing at a subfolder of a repo rather than the repo root — pick
  the root directory that contains `.git/`.
- `git` is not on PATH — install Git for Windows and restart the app.

### Tray icon doesn't appear
- Check Windows' "hidden tray icons" overflow — the OS may have auto-hidden it.
- Drag it from the overflow into the main tray to pin it.
- If the tray is completely broken (e.g. `Explorer.exe` crashed), restart
  Explorer: `taskkill /F /IM explorer.exe && start explorer.exe`.

### Force pull button is disabled on a repo I own
Force pull is only enabled when the repo is checked out to its detected
default branch. If you're on a feature branch, check out `main`/`master` first
(outside the app — this tool intentionally doesn't do checkouts). If the
detection is wrong, verify `git symbolic-ref refs/remotes/origin/HEAD` outputs
what you expect; if not, fix it with:
```bash
git remote set-head origin --auto
```

### `git_pull_ff` fails with "not possible to fast-forward"
Your branch has diverged. Either resolve manually (rebase / merge) or use
Force pull on the default branch.

### Ahead/behind shows 0/0 even though I know there's activity on origin
The counts are against your configured **upstream**, not origin/main directly.
Check `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` — if it's
empty, the branch has no tracking. The app shows a "no upstream" pill in that
case.

### Terminal opens but in the wrong directory
The three launchers use different flags — `wt.exe -d`, `git-bash.exe --cd=`,
`cmd /c start cmd /K "cd /d <path>"`. If wt.exe is on PATH but old (pre-
tabbed Terminal), the `-d` flag may be ignored. Upgrade Windows Terminal, or
switch to Git Bash in Settings.

### Auto-refresh stopped running
Two causes:
- `bulkInProgress` got stuck on `true` (a bulk action crashed without clearing
  the flag). Restart the app.
- The settings' `refreshIntervalSec` was set below 30 — clamped to 30 in the
  interval math, but the flag may still reflect the stored value.

### The frontend shows stale data after changing a repo's state externally
Auto-refresh interval defaults to 5 minutes. Hit "Refresh all" in the sidebar
or the per-row refresh button for an instant re-read.

### "Scan folder…" isn't proposing a repo I know is there
Two likely causes:
1. **It's already in the dashboard.** The scan annotates each candidate with
   `already added` and disables its checkbox. Scroll the list — the repo is
   there, just not addable again.
2. **It's on the ignore list.** If you previously removed the repo with
   "also ignore this folder" checked, the scan entry shows an `ignored`
   badge with an inline **un-ignore** link. Click it and the entry flips to
   a regular checked candidate. You can also un-ignore from Settings → Ignored
   paths, or directly:
   ```powershell
   sqlite3 "$env:APPDATA\RepoDashboard\repo-dashboard.sqlite" "DELETE FROM ignored_paths WHERE path LIKE '%my-repo%';"
   ```
3. **It's a nested repo.** The scan only inspects **direct children** of the
   parent folder. A repo under `C:\Projects\category\repo\` won't surface
   when scanning `C:\Projects\`. Scan `C:\Projects\category\` instead, or
   use "Add repo" to point at the exact folder.

### "add_repo: already in dashboard" when the repo clearly isn't
Dedup is case/slash-insensitive via `util::normalize_path`. If you added
the repo as `C:\Projects\foo` and are now trying `c:/Projects/foo/`, those
collapse to the same normalized path. Check `SELECT name, path FROM repos`
— the existing row may have different casing than you typed.

### Removing a repo re-appears in the next scan
You didn't tick the "also ignore this folder" checkbox on the remove
dialog. The checkbox is per-removal by design (no "always ignore" toggle).
Re-tick it next time, or manually add to the ignore list:
```powershell
sqlite3 "$env:APPDATA\RepoDashboard\repo-dashboard.sqlite" "INSERT INTO ignored_paths VALUES ('C:\Projects\foo', datetime('now'));"
```
(Path must be pre-normalized: uppercase drive letter, backslashes, no trailing `\`.)

### `npm run tauri build` fails with WiX / NSIS download errors
On first build, Tauri downloads WiX 3.14 and NSIS 3.11. If your network blocks
GitHub releases, either:
- Pre-download the archives into `src-tauri/target/release/wix/` and `nsis/`.
- Or configure `bundle.targets` in `src-tauri/tauri.conf.json` to skip one.
  E.g., `"targets": ["msi"]` to skip NSIS.

### `cargo check` is slow on first run
~100 dependencies compile on the first build. Incremental builds after a
one-line Rust change take 5-15 seconds. If it's recompiling everything,
something probably changed in `Cargo.toml`; that invalidates the cache.

### HMR broken / blank screen in dev
1. Kill the `tauri dev` process.
2. `rm -rf dist node_modules/.vite`.
3. `npm run tauri dev` again.

## Dev-loop tips

- **Rust-only iteration**: `cd src-tauri && cargo check` is much faster than
  `npm run tauri dev` for catching type/borrow errors.
- **Frontend-only iteration**: `npm run dev` (without Tauri) works if the
  feature under test doesn't use `invoke`. Pair with a stub for
  `src/lib/tauri.ts`.
- **Unit tests**: `cd src-tauri && cargo test --lib` runs only the pure
  parser tests (remote URL, commit log). They complete in <1 second.
- **Type check alone**: `npx tsc -p . --noEmit`.
- **Lint check**: not configured — add ESLint in a later pass if you want.

## Diagnostic checklist for "my git command behaves weirdly"

1. Run the exact command in a terminal inside the repo:
   - `git -C <path> fetch --all --prune`
   - `git -C <path> status --porcelain=v1 -z`
   - `git -C <path> rev-list --left-right --count HEAD...@{upstream}`
   - etc.
2. If the terminal works but the app doesn't, compare the `PATH` env var:
   the app inherits it from the launching process. A terminal with a `.bashrc`
   that adds to PATH won't affect the app when launched via Explorer.
3. Check `%APPDATA%\RepoDashboard\repo-dashboard.sqlite` — the `repos.path`
   column has the exact path the backend passes to `git -C`. If it points at
   a moved/renamed directory, remove + re-add the repo.

## When force-pull goes wrong

If a user force-pulled and wants their work back, in order:

1. **Undo button in the success dialog** — one click, restores the captured
   pre-HEAD via `git reset --hard <pre-head-sha>`. Refuses if the working
   tree is dirty (new changes would be destroyed). Only available for the
   current session.
2. **`git reflog`** in the repo — every `reset --hard` leaves a reflog
   entry that survives ~90 days. `git reset --hard HEAD@{1}` typically
   restores to just before the force-pull.
3. **Audit log** — query the `action_log` table in the SQLite DB (or call
   the `get_action_log` backend command from the dev console) to find
   the exact pre-HEAD SHA captured at the time, then
   `git reset --hard <sha>` manually.
4. **`git fsck --lost-found`** — last resort, finds dangling commit objects
   that are still in `.git/objects` for ~2 weeks.

Full details and the rationale for why we don't auto-stash or `git clean`
are in `docs/safety-model.md`.

## Auth / network failures

The app's error dialogs classify git stderr into categories (SSH auth,
HTTPS auth, TLS cert, dirty tree, network, rate limit) with a
friendly hint. If the classifier returns "unknown" or the hint is wrong,
click **Diagnose auth** on the error dialog: it re-runs `git fetch
--dry-run` with `GIT_TRACE=1 GIT_TRACE_CURL=1 GIT_TRACE_SETUP=1
GCM_INTERACTIVE=Never` and shows the combined trace. Tokens and URL
user prefixes are sanitized before display.

If you want to replicate the diagnosis manually:

```bash
GIT_TRACE=1 GIT_TRACE_CURL=1 GIT_TRACE_SETUP=1 \
  git -C <repo> fetch --dry-run --prune origin
```
