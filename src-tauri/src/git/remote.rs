use super::runner::{run_git_raw, GitError};
use std::path::Path;

/// Return the `origin` remote URL, or None if not configured.
pub fn origin_url(repo_path: &Path) -> Result<Option<String>, GitError> {
    let out = run_git_raw(repo_path, &["remote", "get-url", "origin"])?;
    if out.code != 0 {
        return Ok(None);
    }
    let s = out.stdout.trim().to_string();
    if s.is_empty() {
        Ok(None)
    } else {
        Ok(Some(s))
    }
}

/// Convert a git remote URL to an https web URL for the repo. Returns None if
/// the URL doesn't look like something we know how to map.
///
/// Handles:
///   - ssh: `git@github.com:org/repo.git` -> `https://github.com/org/repo`
///   - ssh url: `ssh://git@github.com/org/repo.git` -> `https://github.com/org/repo`
///   - https: `https://github.com/org/repo.git` -> `https://github.com/org/repo`
///   - azure devops ssh: `git@ssh.dev.azure.com:v3/org/project/repo` -> `https://dev.azure.com/org/project/_git/repo`
///   - azure devops https: `https://org@dev.azure.com/org/project/_git/repo` -> same (strip user)
///   - gitlab subgroups: `git@gitlab.com:group/sub/repo.git` -> `https://gitlab.com/group/sub/repo`
pub fn to_web_url(remote: &str) -> Option<String> {
    let remote = remote.trim();
    if remote.is_empty() {
        return None;
    }

    // Azure DevOps SSH v3 scheme: git@ssh.dev.azure.com:v3/<org>/<project>/<repo>
    if remote.starts_with("git@ssh.dev.azure.com:") || remote.starts_with("ssh://git@ssh.dev.azure.com/") {
        let tail = remote
            .trim_start_matches("git@ssh.dev.azure.com:")
            .trim_start_matches("ssh://git@ssh.dev.azure.com/")
            .trim_start_matches("v3/");
        let parts: Vec<&str> = tail.split('/').collect();
        if parts.len() >= 3 {
            let org = parts[0];
            let project = parts[1];
            let repo = parts[2].trim_end_matches(".git");
            return Some(format!(
                "https://dev.azure.com/{org}/{project}/_git/{repo}"
            ));
        }
    }

    // Plain SCP-like SSH: user@host:path — NOT an URL.
    if let Some((pre, path)) = scp_split(remote) {
        let host = pre.split('@').next_back().unwrap_or(pre);
        let path = path.trim_start_matches('/').trim_end_matches(".git");
        if host.is_empty() || path.is_empty() {
            return None;
        }
        return Some(format!("https://{host}/{path}"));
    }

    // URL form — try to parse.
    if let Ok(u) = url::Url::parse(remote) {
        let host = u.host_str()?;
        let mut path = u.path().trim_start_matches('/').to_string();
        if let Some(stripped) = path.strip_suffix(".git") {
            path = stripped.to_string();
        }
        if path.is_empty() {
            return None;
        }
        return Some(format!("https://{host}/{path}"));
    }

    None
}

fn scp_split(remote: &str) -> Option<(&str, &str)> {
    // Only count `user@host:path` form (no `://`). Colon must come before the first `/`.
    if remote.contains("://") {
        return None;
    }
    let colon = remote.find(':')?;
    let first_slash = remote.find('/').unwrap_or(remote.len());
    if colon > first_slash {
        return None;
    }
    Some((&remote[..colon], &remote[colon + 1..]))
}

/// Convert a remote URL + commit sha to a commit web URL, best-effort.
/// github/gitlab/azure paths differ for commits.
pub fn commit_web_url(remote: &str, sha: &str) -> Option<String> {
    let web = to_web_url(remote)?;
    if web.contains("dev.azure.com") {
        Some(format!("{web}/commit/{sha}"))
    } else if web.contains("gitlab.") {
        Some(format!("{web}/-/commit/{sha}"))
    } else if web.contains("bitbucket.") {
        Some(format!("{web}/commits/{sha}"))
    } else {
        // github + unknown — default to github-style
        Some(format!("{web}/commit/{sha}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_ssh() {
        assert_eq!(
            to_web_url("git@github.com:org/repo.git").as_deref(),
            Some("https://github.com/org/repo")
        );
    }

    #[test]
    fn github_https() {
        assert_eq!(
            to_web_url("https://github.com/org/repo.git").as_deref(),
            Some("https://github.com/org/repo")
        );
    }

    #[test]
    fn github_https_no_suffix() {
        assert_eq!(
            to_web_url("https://github.com/org/repo").as_deref(),
            Some("https://github.com/org/repo")
        );
    }

    #[test]
    fn gitlab_subgroup_ssh() {
        assert_eq!(
            to_web_url("git@gitlab.com:group/sub/repo.git").as_deref(),
            Some("https://gitlab.com/group/sub/repo")
        );
    }

    #[test]
    fn azure_ssh_v3() {
        assert_eq!(
            to_web_url("git@ssh.dev.azure.com:v3/MyOrg/MyProj/MyRepo").as_deref(),
            Some("https://dev.azure.com/MyOrg/MyProj/_git/MyRepo")
        );
    }

    #[test]
    fn azure_https() {
        assert_eq!(
            to_web_url("https://MyOrg@dev.azure.com/MyOrg/MyProj/_git/MyRepo").as_deref(),
            Some("https://dev.azure.com/MyOrg/MyProj/_git/MyRepo")
        );
    }

    #[test]
    fn ssh_url_form() {
        assert_eq!(
            to_web_url("ssh://git@github.com/org/repo.git").as_deref(),
            Some("https://github.com/org/repo")
        );
    }

    #[test]
    fn garbage_returns_none() {
        assert_eq!(to_web_url("not a url at all"), None);
        assert_eq!(to_web_url(""), None);
    }

    #[test]
    fn commit_urls() {
        assert_eq!(
            commit_web_url("git@github.com:org/repo.git", "abc123").as_deref(),
            Some("https://github.com/org/repo/commit/abc123")
        );
        assert_eq!(
            commit_web_url("git@gitlab.com:org/repo.git", "abc123").as_deref(),
            Some("https://gitlab.com/org/repo/-/commit/abc123")
        );
        assert_eq!(
            commit_web_url("git@ssh.dev.azure.com:v3/o/p/r", "abc123").as_deref(),
            Some("https://dev.azure.com/o/p/_git/r/commit/abc123")
        );
    }
}
