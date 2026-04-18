import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import * as api from "../lib/tauri";
import type { Commit, RepoStatus } from "../types";
import { firstLine, timeAgo, truncate } from "../lib/format";
import { useUiStore } from "../stores/uiStore";

interface Props {
  status: RepoStatus;
}

export function RepoLogPanel({ status }: Props) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const openDialog = useUiStore((s) => s.openDialog);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getRepoLog(status.id, 10)
      .then((c) => {
        if (!cancelled) setCommits(c);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status.id]);

  async function openShaUrl(sha: string) {
    try {
      await api.openCommit(status.id, sha);
    } catch (e) {
      openDialog({
        kind: "info",
        title: "Open commit failed",
        body: String(e),
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-surface-1 px-4 py-3 text-sm text-zinc-400">
        <Loader2 size={14} className="animate-spin" />
        Loading log…
      </div>
    );
  }
  if (error) {
    return (
      <div className="border-t border-border bg-surface-1 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    );
  }
  if (!commits || commits.length === 0) {
    return (
      <div className="border-t border-border bg-surface-1 px-4 py-3 text-sm text-zinc-400">
        No commits on HEAD.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface-1">
      <ul className="divide-y divide-border/70">
        {commits.map((c) => (
          <li key={c.sha} className="flex items-center gap-3 px-4 py-2 text-sm">
            <button
              className="font-mono text-xs text-blue-300 hover:text-blue-200 hover:underline"
              title={`Open ${c.sha} in browser`}
              onClick={() => openShaUrl(c.sha)}
            >
              {c.shaShort}
            </button>
            <span className="flex-1 truncate" title={c.message}>
              {truncate(firstLine(c.message), 120)}
            </span>
            <span
              className="whitespace-nowrap text-xs text-zinc-400"
              title={c.timestamp}
            >
              {timeAgo(c.timestamp)}
            </span>
            <span className="w-40 truncate text-right text-xs text-zinc-500" title={c.author}>
              {c.author}
            </span>
            <button
              className="text-zinc-500 hover:text-zinc-200"
              title="Open commit on remote"
              onClick={() => openShaUrl(c.sha)}
            >
              <ExternalLink size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
