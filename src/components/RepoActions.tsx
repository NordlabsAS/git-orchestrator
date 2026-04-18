import {
  Download,
  ArrowDownToLine,
  AlertOctagon,
  FolderOpen,
  TerminalSquare,
  Globe,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import * as api from "../lib/tauri";
import { useReposStore } from "../stores/reposStore";
import { useUiStore } from "../stores/uiStore";
import type { RepoStatus } from "../types";
import { IconButton } from "./ui/Button";

interface Props {
  status: RepoStatus;
}

export function RepoActions({ status }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const refreshOne = useReposStore((s) => s.refreshOne);
  const openDialog = useUiStore((s) => s.openDialog);
  const toggleExpanded = useUiStore((s) => s.toggleExpanded);
  const isExpanded = useUiStore((s) => s.expandedIds.has(status.id));

  const onDefault = status.branch === status.defaultBranch;

  async function run(
    name: string,
    fn: () => Promise<unknown>,
    opts?: { refresh?: boolean; errorTitle?: string; gitError?: boolean },
  ) {
    setBusy(name);
    try {
      await fn();
      if (opts?.refresh !== false) await refreshOne(status.id);
    } catch (e) {
      if (opts?.gitError !== false) {
        openDialog({
          kind: "gitError",
          title: opts?.errorTitle ?? `${name} failed`,
          error: String(e),
          repoId: status.id,
        });
      } else {
        openDialog({
          kind: "info",
          title: opts?.errorTitle ?? `${name} failed`,
          body: String(e),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <IconButton
        title="Fetch"
        onClick={() => run("Fetch", () => api.gitFetch(status.id))}
        disabled={!!busy}
      >
        {busy === "Fetch" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </IconButton>

      <IconButton
        title="Pull (ff-only)"
        tone="primary"
        onClick={() => run("Pull", () => api.gitPullFf(status.id))}
        disabled={!!busy}
      >
        {busy === "Pull" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ArrowDownToLine size={16} />
        )}
      </IconButton>

      <IconButton
        title={
          onDefault
            ? "Force pull — reset hard to origin/default"
            : `Force pull disabled — not on default branch (${status.defaultBranch})`
        }
        tone="danger"
        disabled={!onDefault || !!busy}
        onClick={() =>
          openDialog({
            kind: "forcePull",
            id: status.id,
            name: status.name,
            defaultBranch: status.defaultBranch,
          })
        }
      >
        <AlertOctagon size={16} />
      </IconButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <IconButton
        title="Open folder"
        onClick={() =>
          run("Open folder", () => api.openFolder(status.id), {
            refresh: false,
            gitError: false,
          })
        }
      >
        <FolderOpen size={16} />
      </IconButton>

      <IconButton
        title="Open terminal"
        onClick={() =>
          run("Open terminal", () => api.openTerminal(status.id), {
            refresh: false,
            gitError: false,
          })
        }
      >
        <TerminalSquare size={16} />
      </IconButton>

      <IconButton
        title={status.remoteUrl ? `Open ${status.remoteUrl}` : "No remote URL"}
        disabled={!status.remoteUrl}
        onClick={() =>
          run("Open remote", () => api.openRemote(status.id), {
            refresh: false,
            gitError: false,
          })
        }
      >
        <Globe size={16} />
      </IconButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <IconButton
        title={isExpanded ? "Hide log" : "Show last 10 commits"}
        onClick={() => toggleExpanded(status.id)}
      >
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </IconButton>
    </div>
  );
}
