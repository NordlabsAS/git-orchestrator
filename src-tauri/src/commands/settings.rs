use crate::db;

/// Allowlist of setting keys the frontend may read/write. Must stay in sync
/// with `KEY_MAP` in `src/stores/settingsStore.ts`. Keeping this server-side
/// means a compromised renderer can't stuff arbitrary garbage into the
/// settings table.
const ALLOWED_KEYS: &[&str] = &[
    "terminal",
    "refresh_interval_sec",
    "default_repos_dir",
    "theme",
];

fn ensure_allowed(key: &str) -> Result<(), String> {
    if ALLOWED_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(format!("refused: unknown setting key '{key}'"))
    }
}

#[tauri::command]
pub async fn get_setting(key: String) -> Result<Option<String>, String> {
    ensure_allowed(&key)?;
    db::with_conn(|c| crate::db::queries::get_setting(c, &key))
}

#[tauri::command]
pub async fn set_setting(key: String, value: String) -> Result<(), String> {
    ensure_allowed(&key)?;
    db::with_conn(|c| crate::db::queries::set_setting(c, &key, &value))
}

