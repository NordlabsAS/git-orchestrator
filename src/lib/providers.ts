/**
 * Pure host → provider label mapping, used to render "Sign in to GitHub"
 * instead of "Sign in" on the auth-error panel. Parsing is deliberately
 * client-side: the remote URL is already on the RepoStatus the frontend
 * holds, and a new round-trip just to learn the provider label would be
 * wasteful.
 *
 * Host detection is fuzzy (substring match) rather than exact so enterprise
 * subdomains like `github.mycorp.com` still resolve to "GitHub" — the brand
 * name helps the user, the subdomain doesn't.
 */

export type Provider = "github" | "gitlab" | "azure" | "bitbucket" | "other";

export interface RemoteInfo {
  provider: Provider;
  label: string;
  host: string | null;
  isSsh: boolean;
}

export function parseRemote(remoteUrl: string | null): RemoteInfo {
  if (!remoteUrl || !remoteUrl.trim()) {
    return { provider: "other", label: "remote", host: null, isSsh: false };
  }
  const raw = remoteUrl.trim();

  // SCP-like ssh: user@host:path. No ://.
  let host: string | null = null;
  let isSsh = false;

  if (!raw.includes("://")) {
    const colon = raw.indexOf(":");
    const firstSlash = raw.indexOf("/");
    if (colon > 0 && (firstSlash === -1 || colon < firstSlash)) {
      const pre = raw.slice(0, colon);
      const at = pre.lastIndexOf("@");
      host = at >= 0 ? pre.slice(at + 1) : pre;
      isSsh = true;
    }
  } else {
    try {
      const u = new URL(raw);
      host = u.hostname;
      isSsh = u.protocol === "ssh:" || u.protocol === "git+ssh:";
    } catch {
      // Leave host null; falls through to "other".
    }
  }

  const lower = (host ?? "").toLowerCase();
  if (lower.includes("github")) {
    return { provider: "github", label: "GitHub", host, isSsh };
  }
  if (lower.includes("gitlab")) {
    return { provider: "gitlab", label: "GitLab", host, isSsh };
  }
  if (lower.includes("dev.azure.com") || lower.includes("visualstudio.com")) {
    return { provider: "azure", label: "Azure DevOps", host, isSsh };
  }
  if (lower.includes("bitbucket")) {
    return { provider: "bitbucket", label: "Bitbucket", host, isSsh };
  }
  return {
    provider: "other",
    label: host ?? "remote",
    host,
    isSsh,
  };
}

/**
 * Docs link for setting up SSH keys with a given provider. SSH auth is
 * outside GCM's reach (keys, not tokens), so on ssh failures we point
 * users at the vendor's own setup guide instead of auto-triggering anything.
 */
export function sshDocsUrl(provider: Provider): string | null {
  switch (provider) {
    case "github":
      return "https://docs.github.com/en/authentication/connecting-to-github-with-ssh";
    case "gitlab":
      return "https://docs.gitlab.com/ee/user/ssh.html";
    case "azure":
      return "https://learn.microsoft.com/en-us/azure/devops/repos/git/use-ssh-keys-to-authenticate";
    case "bitbucket":
      return "https://support.atlassian.com/bitbucket-cloud/docs/set-up-an-ssh-key/";
    default:
      return null;
  }
}
