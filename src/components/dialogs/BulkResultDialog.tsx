import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RefreshCcw,
  Terminal,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import * as api from "../../lib/tauri";
import { useReposStore } from "../../stores/reposStore";
import { useUiStore } from "../../stores/uiStore";
import type { BulkReason, BulkResult } from "../../types";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const REASON_LABEL: Record<BulkReason, string> = {
  ok: "updated",
  off_default: "not on default branch",
  dirty: "working tree dirty",
  path_missing: "repo path missing",
  fetch_failed: "fetch failed",
  pull_failed: "pull failed",
  status_failed: "status check failed",
};

export function BulkResultDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);

  const open =
    dialog?.kind === "bulkFetchResult" || dialog?.kind === "bulkPullResult";

  if (!open || !dialog) return null;

  if (dialog.kind === "bulkFetchResult") {
    const ok = dialog.results.filter((r) => r.ok);
    const failed = dialog.results.filter((r) => !r.ok);
    return (
      <Dialog
        open={open}
        onClose={close}
        title={dialog.title}
        wide
        footer={
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        }
      >
        <Summary counts={[
          { label: "fetched", n: ok.length, tone: "ok" },
          { label: "failed", n: failed.length, tone: "fail" },
        ]} />
        <ResultGroup title="Fetched" tone="ok" rows={ok} />
        <ResultGroup title="Failed" tone="fail" rows={failed} />
      </Dialog>
    );
  }

  const { report } = dialog;
  return (
    <Dialog
      open={open}
      onClose={close}
      title={dialog.title}
      wide
      footer={
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      }
    >
      <Summary counts={[
        { label: "updated", n: report.updated.length, tone: "ok" },
        { label: "skipped", n: report.skipped.length, tone: "warn" },
        { label: "blocked", n: report.blocked.length, tone: "fail" },
      ]} />
      <ResultGroup title="Updated" tone="ok" rows={report.updated} />
      <ResultGroup title="Skipped" tone="warn" rows={report.skipped} />
      <ResultGroup title="Blocked" tone="fail" rows={report.blocked} />
    </Dialog>
  );
}

function Summary({
  counts,
}: {
  counts: { label: string; n: number; tone: "ok" | "warn" | "fail" }[];
}) {
  return (
    <div className="mb-3 flex gap-2">
      {counts.map((c) => (
        <div
          key={c.label}
          className={
            "flex-1 rounded-md border px-2.5 py-1.5 text-sm " +
            (c.tone === "ok"
              ? "border-emerald-900/60 bg-emerald-950/20"
              : c.tone === "warn"
                ? "border-amber-900/60 bg-amber-950/20"
                : "border-red-900/60 bg-red-950/20")
          }
        >
          <div
            className={
              "font-semibold " +
              (c.tone === "ok"
                ? "text-emerald-200"
                : c.tone === "warn"
                  ? "text-amber-200"
                  : "text-red-200")
            }
          >
            {c.n}
          </div>
          <div className="text-[11px] text-zinc-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function ResultGroup({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "ok" | "warn" | "fail";
  rows: BulkResult[];
}) {
  if (rows.length === 0) return null;
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;
  const iconClass =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-red-400";
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        <Icon size={12} className={iconClass} /> {title} ({rows.length})
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface-2">
        {rows.map((r) => (
          <BulkRow key={r.id} result={r} tone={tone} />
        ))}
      </ul>
    </div>
  );
}

function BulkRow({ result, tone }: { result: BulkResult; tone: "ok" | "warn" | "fail" }) {
  const statuses = useReposStore((s) => s.statuses);
  const refreshOne = useReposStore((s) => s.refreshOne);
  const repo = statuses.find((s) => s.id === result.id);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryDone, setRetryDone] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reasonLabel =
    result.reason && result.reason !== "ok"
      ? REASON_LABEL[result.reason]
      : result.message || "ok";

  async function retry() {
    setRetryBusy(true);
    setRetryError(null);
    try {
      if (
        result.reason === "fetch_failed" ||
        result.reason === "pull_failed" ||
        result.reason === "status_failed"
      ) {
        // Best-guess retry: pull-ff for pull failures, fetch otherwise.
        if (result.reason === "pull_failed") await api.gitPullFf(result.id);
        else await api.gitFetch(result.id);
      } else {
        await api.gitFetch(result.id);
      }
      await refreshOne(result.id);
      setRetryDone(true);
    } catch (e) {
      setRetryError(String(e));
    } finally {
      setRetryBusy(false);
    }
  }

  const canRetry = tone === "fail";
  const canForcePull =
    tone === "warn" &&
    result.reason === "dirty" &&
    repo &&
    repo.branch === repo.defaultBranch;

  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate">
          <span className="font-semibold text-zinc-100">
            {repo?.name ?? `#${result.id}`}
          </span>
          <span className="ml-2 text-xs text-zinc-400">{reasonLabel}</span>
        </div>
        {repo && (
          <>
            <IconButton
              title="Open folder"
              onClick={() => void api.openFolder(repo.id)}
              className="h-7 w-7"
            >
              <FolderOpen size={12} />
            </IconButton>
            <IconButton
              title="Open terminal"
              onClick={() => void api.openTerminal(repo.id)}
              className="h-7 w-7"
            >
              <Terminal size={12} />
            </IconButton>
          </>
        )}
        {canRetry && !retryDone && (
          <IconButton
            title="Retry"
            onClick={() => void retry()}
            disabled={retryBusy}
            className="h-7 w-7"
          >
            {retryBusy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCcw size={12} />
            )}
          </IconButton>
        )}
        {canForcePull && (
          <Button
            variant="danger"
            className="h-7 px-2 text-xs"
            onClick={() =>
              useUiStore.getState().openDialog({
                kind: "forcePull",
                id: repo!.id,
                name: repo!.name,
                defaultBranch: repo!.defaultBranch,
              })
            }
          >
            Force pull
          </Button>
        )}
        {result.message && tone !== "ok" && (
          <button
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "hide" : "details"}
          </button>
        )}
      </div>
      {expanded && result.message && (
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-surface-1 p-2 font-mono text-xs text-zinc-300">
          {result.message}
        </pre>
      )}
      {retryDone && (
        <div className="text-xs text-emerald-300">Retried successfully.</div>
      )}
      {retryError && (
        <div className="text-xs text-red-300">Retry failed: {retryError}</div>
      )}
    </li>
  );
}
