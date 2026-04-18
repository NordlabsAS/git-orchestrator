/// Normalize a filesystem path for storage / comparison.
///
/// Windows-only rules (this app is Windows-only — see `CLAUDE.md`):
///   - trim surrounding whitespace
///   - convert forward slashes to backslashes
///   - collapse runs of backslashes (`\\\\` → `\\`), except at the very start
///     so UNC prefixes like `\\server\share` survive
///   - strip trailing separators (but keep `C:\` intact)
///   - uppercase the drive letter so `c:\x` and `C:\x` collide in dedup
///
/// The result is stable for equal paths under Windows semantics and is what we
/// store in `repos.path` and `ignored_paths.path` so that the UNIQUE / PK
/// constraints actually catch case/slash variants.
pub fn normalize_path(input: &str) -> String {
    let mut s = input.trim().replace('/', "\\");

    // Collapse repeated backslashes while preserving a leading `\\` (UNC).
    let leading_unc = s.starts_with("\\\\");
    let prefix_len = if leading_unc { 2 } else { 0 };
    if s.len() > prefix_len {
        let (prefix, rest) = s.split_at(prefix_len);
        let mut collapsed = String::with_capacity(s.len());
        collapsed.push_str(prefix);
        let mut prev_bs = false;
        for ch in rest.chars() {
            if ch == '\\' {
                if !prev_bs {
                    collapsed.push(ch);
                }
                prev_bs = true;
            } else {
                collapsed.push(ch);
                prev_bs = false;
            }
        }
        s = collapsed;
    }

    // Uppercase drive letter (e.g. "c:\foo" → "C:\foo").
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        let mut bytes = s.into_bytes();
        bytes[0] = bytes[0].to_ascii_uppercase();
        s = String::from_utf8(bytes).unwrap_or_default();
    }

    // Strip trailing separators, but keep "C:\" and "\\" intact.
    while s.len() > 3 && s.ends_with('\\') {
        s.pop();
    }

    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uppercases_drive_letter() {
        assert_eq!(normalize_path("c:\\projects\\foo"), "C:\\projects\\foo");
    }

    #[test]
    fn converts_forward_slashes() {
        assert_eq!(normalize_path("C:/Projects/foo"), "C:\\Projects\\foo");
    }

    #[test]
    fn strips_trailing_separators() {
        assert_eq!(normalize_path("C:\\Projects\\foo\\"), "C:\\Projects\\foo");
        assert_eq!(normalize_path("C:\\Projects\\foo\\\\"), "C:\\Projects\\foo");
    }

    #[test]
    fn keeps_drive_root() {
        assert_eq!(normalize_path("C:\\"), "C:\\");
        assert_eq!(normalize_path("c:/"), "C:\\");
    }

    #[test]
    fn collapses_internal_double_backslashes() {
        assert_eq!(normalize_path("C:\\\\Projects\\\\foo"), "C:\\Projects\\foo");
    }

    #[test]
    fn preserves_unc_prefix() {
        assert_eq!(
            normalize_path("\\\\server\\share\\repo"),
            "\\\\server\\share\\repo"
        );
    }

    #[test]
    fn trims_whitespace() {
        assert_eq!(normalize_path("  C:\\foo  "), "C:\\foo");
    }

    #[test]
    fn idempotent() {
        let once = normalize_path("c:/Projects//foo/");
        let twice = normalize_path(&once);
        assert_eq!(once, twice);
    }
}
