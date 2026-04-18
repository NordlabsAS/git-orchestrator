import { AlertCircle, ExternalLink, RefreshCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import * as api from "../lib/tauri";
import type { GitSetupStatus } from "../types";

/**
 * First-run nudge for users who haven't finished setting up Git on their
 * machine. Appears when:
 *   - `git` isn't on PATH, OR
 *   - `user.name` / `user.email` / `credential.helper` are unset globally.
 *
 * The banner is dismissable for the current session. A "Check again" button
 * re-probes so users can install Git, complete the wizard, and clear the
 * banner without restarting the app.
 */
export function GitSetupBanner() {
  const [status, setStatus] = useState<GitSetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void check();
    // Intentionally only runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check() {
    setChecking(true);
    try {
      const s = await api.gitSetupStatus();
      setStatus(s);
    } catch {
      // If the probe itself failed, treat as "something's off" but don't
      // block the whole UI on it.
      setStatus({
        installed: false,
        version: null,
        userNameSet: false,
        userEmailSet: false,
        credentialHelperSet: false,
      });
    } finally {
      setChecking(false);
    }
  }

  if (dismissed || !status) return null;

  const needsInstall = !status.installed;
  const needsConfig =
    status.installed &&
    (!status.userNameSet ||
      !status.userEmailSet ||
      !status.credentialHelperSet);

  if (!needsInstall && !needsConfig) return null;

  const title = needsInstall
    ? "Git isn't installed"
    : "Finish setting up Git";

  const body = needsInstall
    ? "This app shells out to the system `git` binary for everything. Install Git for Windows to use the fetch, pull, and sign-in features."
    : buildConfigMessage(status);

  return (
    <div className="mx-3 mt-3 rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-xs text-amber-100">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="flex-1">
          <div className="font-semibold text-amber-100">{title}</div>
          <div className="mt-1 text-amber-200/90">{body}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {needsInstall && (
              <a
                href="https://git-scm.com/download/win"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-amber-700/60 bg-amber-900/40 px-2 py-1 hover:bg-amber-900/60"
              >
                <ExternalLink size={12} />
                Download Git
              </a>
            )}
            <button
              onClick={() => void check()}
              disabled={checking}
              className="inline-flex items-center gap-1 rounded border border-amber-700/60 bg-amber-900/40 px-2 py-1 hover:bg-amber-900/60 disabled:opacity-50"
            >
              <RefreshCcw size={12} />
              {checking ? "Checking…" : "Check again"}
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          title="Dismiss for this session"
          className="shrink-0 rounded p-1 text-amber-300 hover:bg-amber-900/40"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function buildConfigMessage(s: GitSetupStatus): string {
  const missing: string[] = [];
  if (!s.userNameSet) missing.push("user.name");
  if (!s.userEmailSet) missing.push("user.email");
  if (!s.credentialHelperSet) missing.push("credential.helper");

  if (missing.includes("credential.helper") && missing.length === 1) {
    return "No credential helper is configured — signing in to remotes won't persist your credentials. On Windows, reinstall Git for Windows and pick the Git Credential Manager option during setup.";
  }
  return `Your global git config is missing: ${missing.join(", ")}. Open a terminal and run \`git config --global user.name "Your Name"\` and \`git config --global user.email "you@example.com"\` to fix it.`;
}
