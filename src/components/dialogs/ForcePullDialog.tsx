import { AlertOctagon, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import * as api from "../../lib/tauri";
import { useReposStore } from "../../stores/reposStore";
import { useUiStore } from "../../stores/uiStore";
import type { ForcePullPreview, ForcePullResult } from "../../types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

type UndoState = "idle" | "running" | "done" | "failed";

export function ForcePullDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const refreshOne = useReposStore((s) => s.refreshOne);

  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForcePullResult | null>(null);
  const [undoState, setUndoState] = useState<UndoState>("idle");
  const [undoError, setUndoError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ForcePullPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const open = dialog?.kind === "forcePull";
  const id = open ? dialog.id : null;
  const name = open ? dialog.name : "";
  const defaultBranch = open ? dialog.defaultBranch : "";

  function resetAll() {
    setAck(false);
    setError(null);
    setResult(null);
    setUndoState("idle");
    setUndoError(null);
    setPreview(null);
    setPreviewError(null);
  }

  useEffect(() => {
    if (!open || id === null) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    api
      .forcePullPreview(id)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setPreviewError(String(e));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, id]);

  async function confirm() {
    if (id === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.gitForcePull(id);
      await refreshOne(id);
      setResult(r);
      setAck(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (id === null) return;
    setUndoState("running");
    setUndoError(null);
    try {
      await api.undoLastAction(id);
      await refreshOne(id);
      setUndoState("done");
    } catch (e) {
      setUndoError(String(e));
      setUndoState("failed");
    }
  }

  // Reset the whole dialog state whenever it closes.
  if (!open && (ack || error || result || undoState !== "idle")) {
    queueMicrotask(resetAll);
  }

  // Post-action view: reflog rescue hint + Undo button + close.
  if (open && result) {
    const preShort = result.preHeadShort ?? "unknown";
    const discarded = result.discardedCount;
    return (
      <Dialog
        open={open}
        onClose={() => {
          resetAll();
          close();
        }}
        title="Force pull complete"
        footer={
          <Button
            variant="ghost"
            onClick={() => {
              resetAll();
              close();
            }}
          >
            Close
          </Button>
        }
      >
        <p className="text-zinc-200">
          {discarded > 0 ? (
            <>
              Discarded{" "}
              <span className="font-semibold text-red-300">
                {discarded} local commit{discarded === 1 ? "" : "s"}
              </span>{" "}
              on{" "}
              <span className="font-semibold text-zinc-100">{name}</span>.
            </>
          ) : (
            <>
              Reset{" "}
              <span className="font-semibold text-zinc-100">{name}</span> to{" "}
              <span className="font-mono">origin/{defaultBranch}</span>.
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Previous HEAD was{" "}
          <span className="font-mono text-zinc-200">{preShort}</span>. Recover
          with <code className="font-mono">git reflog</code> (kept ~90 days),
          or click Undo below to restore it now.
        </p>
        {undoState === "idle" && (
          <div className="mt-4">
            <Button variant="primary" onClick={undo}>
              <RotateCcw size={14} />
              Undo (restore {preShort})
            </Button>
            <p className="mt-2 text-xs text-zinc-500">
              Undo refuses if the working tree has new uncommitted changes.
            </p>
          </div>
        )}
        {undoState === "running" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 size={14} className="animate-spin" />
            Restoring {preShort}…
          </div>
        )}
        {undoState === "done" && (
          <div className="mt-4 text-sm text-emerald-300">
            Restored HEAD to {preShort}.
          </div>
        )}
        {undoState === "failed" && undoError && (
          <div className="mt-4 text-xs text-red-300">
            Undo failed: {undoError}
          </div>
        )}
        {result.message && (
          <details className="mt-4 text-xs text-zinc-400">
            <summary className="cursor-pointer text-zinc-500">
              Git output
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono">
              {result.message}
            </pre>
          </details>
        )}
      </Dialog>
    );
  }

  // Pre-action confirmation view.
  return (
    <Dialog
      open={open}
      onClose={() => {
        resetAll();
        close();
      }}
      title="Force pull (destructive)"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              resetAll();
              close();
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={!ack || busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <AlertOctagon size={14} />
            )}
            Force pull
          </Button>
        </>
      }
    >
      <p>
        This runs <code className="font-mono text-zinc-100">git fetch &amp;&amp; git reset --hard
        origin/{defaultBranch}</code> on{" "}
        <span className="font-semibold text-zinc-100">{name}</span>.
      </p>
      {previewLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 size={12} className="animate-spin" />
          Computing what will be discarded…
        </div>
      )}
      {previewError && !previewLoading && (
        <p className="mt-3 text-xs text-zinc-500">
          Preview unavailable ({previewError}). You can still proceed.
        </p>
      )}
      {preview && <PreviewPanel preview={preview} defaultBranch={defaultBranch} />}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.currentTarget.checked)}
          className="mt-1"
        />
        <span>
          I understand this will discard local changes on{" "}
          <span className="font-semibold">{name}</span>.
        </span>
      </label>
      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
    </Dialog>
  );
}

function PreviewPanel({
  preview,
  defaultBranch,
}: {
  preview: ForcePullPreview;
  defaultBranch: string;
}) {
  const { ahead, behind, dirty, unpushedCommits, remoteHeadShort } = preview;
  const dirtyTotal = dirty.staged + dirty.unstaged;
  const nothingDestroyed = ahead === 0 && dirtyTotal === 0;

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2">
        <div className="font-semibold text-red-200">This will discard:</div>
        {nothingDestroyed ? (
          <div className="text-zinc-300">
            Nothing — working tree is clean and no unpushed commits.
          </div>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-zinc-200">
            {ahead > 0 && (
              <li>
                <span className="font-semibold text-red-300">
                  {ahead} local commit{ahead === 1 ? "" : "s"}
                </span>{" "}
                not on <span className="font-mono">origin/{defaultBranch}</span>
              </li>
            )}
            {dirty.staged > 0 && (
              <li>
                {dirty.staged} staged file{dirty.staged === 1 ? "" : "s"}
              </li>
            )}
            {dirty.unstaged > 0 && (
              <li>
                {dirty.unstaged} unstaged file{dirty.unstaged === 1 ? "" : "s"}
              </li>
            )}
          </ul>
        )}
        {unpushedCommits.length > 0 && (
          <details className="mt-2 text-xs text-zinc-400">
            <summary className="cursor-pointer text-zinc-500">
              Show {unpushedCommits.length}
              {ahead > unpushedCommits.length ? ` of ${ahead}` : ""} commit
              {unpushedCommits.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-1 space-y-0.5 font-mono">
              {unpushedCommits.map((c) => (
                <li key={c.sha}>
                  <span className="text-zinc-300">{c.shaShort}</span>{" "}
                  <span className="text-zinc-400">
                    {c.message.split("\n")[0].slice(0, 80)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {dirty.untracked > 0 && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-zinc-300">
          <span className="font-semibold text-amber-200">
            {dirty.untracked} untracked file{dirty.untracked === 1 ? "" : "s"}
          </span>{" "}
          preserved (reset --hard does not remove untracked files).
        </div>
      )}

      {behind > 0 && (
        <div className="rounded-md border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-zinc-300">
          Fast-forwarding{" "}
          <span className="font-semibold text-zinc-100">
            {behind} commit{behind === 1 ? "" : "s"}
          </span>{" "}
          from <span className="font-mono">origin/{defaultBranch}</span>
          {remoteHeadShort && (
            <>
              {" "}
              (<span className="font-mono">{remoteHeadShort}</span>)
            </>
          )}
          .
        </div>
      )}
    </div>
  );
}
