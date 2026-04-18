use crate::commands::repos::{canonical, default_display_name};
use crate::db;
use crate::git::runner::is_git_repo;
use crate::models::{IgnoredPath, Repo, ScanAddResult, ScanEntry, ScanResult, ScanSkip};
use crate::util::normalize_path;
use std::path::PathBuf;

const MAX_SCAN_ENTRIES: usize = 500;

/// Scan the direct children of `parent` and return every git working tree found,
/// each annotated with whether it is already in `repos` or on the ignore list.
///
/// Only direct children are inspected — we don't recurse. Rationale: keeps the
/// scan cheap (directories like `C:\Projects\` with 20 subdirs finish in
/// milliseconds), matches the "add all folders in a project" intent, and
/// avoids surprising the user by surfacing nested repos like a vendored git
/// subtree under `deps/`.
#[tauri::command]
pub async fn scan_folder(parent: String) -> Result<ScanResult, String> {
    let parent_path = canonical(&parent)?;
    if !parent_path.is_dir() {
        return Err(format!("{} is not a directory", parent_path.display()));
    }

    let parent_str = parent_path
        .to_str()
        .ok_or_else(|| "path contains non-utf8 characters".to_string())?
        .to_string();

    let mut entries: Vec<ScanEntry> = Vec::new();
    let mut children: Vec<PathBuf> = std::fs::read_dir(&parent_path)
        .map_err(|e| format!("failed to read {}: {}", parent_path.display(), e))?
        .filter_map(|r| r.ok())
        .filter_map(|d| {
            let ft = d.file_type().ok()?;
            if ft.is_dir() || ft.is_symlink() {
                Some(d.path())
            } else {
                None
            }
        })
        .collect();
    children.sort();

    // Cheap .git-existence prefilter before the more expensive `git rev-parse`
    // spawn — turns a 20-subfolder scan with 2 repos into 2 git spawns
    // instead of 20.
    let repo_candidates: Vec<PathBuf> = children
        .into_iter()
        .filter(|p| p.join(".git").exists())
        .collect();

    if repo_candidates.len() > MAX_SCAN_ENTRIES {
        return Err(format!(
            "too many candidates ({}), refusing to scan — pick a narrower folder",
            repo_candidates.len()
        ));
    }

    let existing_repos: Vec<Repo> = db::with_conn(|c| crate::db::queries::list_repos(c))?;
    let existing_set: std::collections::HashSet<String> = existing_repos
        .iter()
        .map(|r| normalize_path(&r.path))
        .collect();

    let ignored_paths: Vec<IgnoredPath> = db::with_conn(|c| crate::db::queries::list_ignored(c))?;
    let ignored_set: std::collections::HashSet<String> = ignored_paths
        .iter()
        .map(|i| normalize_path(&i.path))
        .collect();

    for child in repo_candidates {
        if !is_git_repo(&child) {
            continue;
        }
        let raw = match child.to_str() {
            Some(s) => s.to_string(),
            None => continue,
        };
        let norm = normalize_path(&raw);
        entries.push(ScanEntry {
            display_name: default_display_name(&child),
            already_added: existing_set.contains(&norm),
            ignored: ignored_set.contains(&norm),
            path: norm,
        });
    }

    Ok(ScanResult {
        parent: normalize_path(&parent_str),
        entries,
    })
}

/// Bulk-add repos from a scan. Each path runs through the same validation as
/// `add_repo` (canonical + is_git_repo + dedup + ignore-list filter) — if a
/// user hand-edits the selection to include a path that has since been
/// ignored, we skip it rather than silently un-ignoring.
#[tauri::command]
pub async fn add_scanned_repos(paths: Vec<String>) -> Result<ScanAddResult, String> {
    let mut added: Vec<Repo> = Vec::new();
    let mut skipped: Vec<ScanSkip> = Vec::new();

    for raw in paths {
        match try_add_one(&raw) {
            Ok(r) => added.push(r),
            Err(reason) => skipped.push(ScanSkip {
                path: normalize_path(&raw),
                reason,
            }),
        }
    }

    Ok(ScanAddResult { added, skipped })
}

fn try_add_one(raw: &str) -> Result<Repo, String> {
    let p = canonical(raw)?;
    if !is_git_repo(&p) {
        return Err(format!("{} is not a git repository", p.display()));
    }
    let raw_path = p
        .to_str()
        .ok_or_else(|| "path contains non-utf8 characters".to_string())?
        .to_string();
    let path_str = normalize_path(&raw_path);
    let name = default_display_name(&p);
    let added_at = chrono::Utc::now().to_rfc3339();

    // `with_conn_mut` closures must return `rusqlite::Error`, so we encode
    // the "already ignored / already added" reasons as fake constraint
    // errors and unpack them after the DB call.
    db::with_conn_mut(|c| {
        if crate::db::queries::is_path_ignored(c, &path_str)? {
            return Err(constraint_err("on ignore list"));
        }
        if let Some(existing) = crate::db::queries::find_repo_by_normalized_path(c, &path_str)? {
            return Err(constraint_err(&format!(
                "already added as \"{}\"",
                existing.name
            )));
        }
        let priority = crate::db::queries::next_priority(c)?;
        let id = crate::db::queries::insert_repo(c, &name, &path_str, priority, &added_at)?;
        crate::db::queries::find_repo(c, id)
    })
}

fn constraint_err(msg: &str) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT),
        Some(msg.to_string()),
    )
}

#[tauri::command]
pub async fn list_ignored_paths() -> Result<Vec<IgnoredPath>, String> {
    db::with_conn(|c| crate::db::queries::list_ignored(c))
}

#[tauri::command]
pub async fn ignore_path(path: String) -> Result<(), String> {
    let normalized = normalize_path(&path);
    if normalized.is_empty() {
        return Err("empty path".into());
    }
    let added_at = chrono::Utc::now().to_rfc3339();
    db::with_conn(|c| crate::db::queries::add_ignored_path(c, &normalized, &added_at))
}

#[tauri::command]
pub async fn unignore_path(path: String) -> Result<(), String> {
    let normalized = normalize_path(&path);
    db::with_conn(|c| crate::db::queries::remove_ignored_path(c, &normalized))
}
