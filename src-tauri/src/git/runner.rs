use std::path::Path;
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("git spawn failed: {0}")]
    Spawn(String),
    #[error("git exited with code {code}: {stderr}")]
    Exit { code: i32, stderr: String },
    #[error("invalid repo path: {0}")]
    InvalidPath(String),
    #[error("output not utf-8: {0}")]
    Utf8(String),
}

impl From<GitError> for String {
    fn from(e: GitError) -> Self {
        e.to_string()
    }
}

/// Per-invocation config overrides that neutralise known RCE vectors exposed
/// through a hostile `.git/config` in a watched repo. Applied to every git
/// call this app makes so that polling a malicious repo on the refresh timer
/// cannot trigger arbitrary-binary execution.
///
/// - `core.fsmonitor=` — empty string disables the fsmonitor hook that would
///   otherwise run on every `git status` / index refresh.
/// - `protocol.ext.allow=never` — blocks `ext::<cmd>` remote helpers on
///   fetch/pull (CVE-2017-1000117 class).
///
/// These are `-c` flags, not env vars, so they only apply to this process.
/// A user's own `git` usage in a terminal is unaffected. Aliases and
/// `core.sshCommand` are NOT neutralised here — see `docs/security.md`.
const HARDENING_FLAGS: &[&str] = &[
    "-c", "core.fsmonitor=",
    "-c", "protocol.ext.allow=never",
];

fn build_command(repo_path: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    for flag in HARDENING_FLAGS {
        cmd.arg(flag);
    }
    cmd.arg("-C").arg(repo_path);
    for a in args {
        cmd.arg(a);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Run `git -C <repo_path> <args...>` capturing stdout/stderr.
/// Returns `Err(GitError::Exit{..})` on non-zero exit, otherwise `Ok(GitOutput)`.
/// NOTE: this is the ONLY place in the app that shells out to git.
pub fn run_git(repo_path: &Path, args: &[&str]) -> Result<GitOutput, GitError> {
    if !repo_path.exists() {
        return Err(GitError::InvalidPath(format!(
            "{} does not exist",
            repo_path.display()
        )));
    }

    let mut cmd = build_command(repo_path, args);
    let output = cmd
        .output()
        .map_err(|e| GitError::Spawn(format!("{} ({})", e, repo_path.display())))?;

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| GitError::Utf8(e.to_string()))?;
    let stderr = String::from_utf8(output.stderr)
        .map_err(|e| GitError::Utf8(e.to_string()))?;
    let code = output.status.code().unwrap_or(-1);

    if !output.status.success() {
        return Err(GitError::Exit { code, stderr });
    }

    Ok(GitOutput {
        stdout,
        stderr,
        code,
    })
}

/// Run git and always return the output, even on non-zero exit (used for `status` etc. that never really fail).
pub fn run_git_raw(repo_path: &Path, args: &[&str]) -> Result<GitOutput, GitError> {
    if !repo_path.exists() {
        return Err(GitError::InvalidPath(format!(
            "{} does not exist",
            repo_path.display()
        )));
    }

    let mut cmd = build_command(repo_path, args);
    let output = cmd
        .output()
        .map_err(|e| GitError::Spawn(format!("{} ({})", e, repo_path.display())))?;

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| GitError::Utf8(e.to_string()))?;
    let stderr = String::from_utf8(output.stderr)
        .map_err(|e| GitError::Utf8(e.to_string()))?;
    let code = output.status.code().unwrap_or(-1);

    Ok(GitOutput { stdout, stderr, code })
}

/// Run git with `GIT_TRACE=1` + `GIT_TRACE_CURL=1` to capture auth/network
/// diagnostics. Returns the combined stdout+stderr+exit-code trace as a
/// single string, truncated to ~32KB. Used by the `diagnose_auth` command
/// — never in the hot path.
pub fn run_git_traced(repo_path: &Path, args: &[&str]) -> Result<String, GitError> {
    if !repo_path.exists() {
        return Err(GitError::InvalidPath(format!(
            "{} does not exist",
            repo_path.display()
        )));
    }

    let mut cmd = build_command(repo_path, args);
    cmd.env("GIT_TRACE", "1");
    cmd.env("GIT_TRACE_CURL", "1");
    cmd.env("GIT_TRACE_SETUP", "1");
    // Force git-credential-manager into non-interactive mode where possible
    // so a hung modal can't block the trace.
    cmd.env("GCM_INTERACTIVE", "Never");

    let output = cmd
        .output()
        .map_err(|e| GitError::Spawn(format!("{} ({})", e, repo_path.display())))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let code = output.status.code().unwrap_or(-1);

    let mut combined = format!("$ git {}\nexit: {}\n\n", args.join(" "), code);
    if !stdout.is_empty() {
        combined.push_str("--- stdout ---\n");
        combined.push_str(&stdout);
        combined.push('\n');
    }
    if !stderr.is_empty() {
        combined.push_str("--- stderr + trace ---\n");
        combined.push_str(&stderr);
    }

    const MAX: usize = 32_000;
    if combined.len() > MAX {
        combined.truncate(MAX);
        combined.push_str("\n… (truncated)");
    }
    Ok(combined)
}

/// Verify `path` is a git working tree (not a bare repo, not a random folder).
pub fn is_git_repo(repo_path: &Path) -> bool {
    match run_git_raw(repo_path, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(out) if out.code == 0 => out.stdout.trim() == "true",
        _ => false,
    }
}
