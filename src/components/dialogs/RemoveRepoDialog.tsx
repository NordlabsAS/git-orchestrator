import { useEffect, useState } from "react";
import * as api from "../../lib/tauri";
import { useReposStore } from "../../stores/reposStore";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export function RemoveRepoDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const remove = useReposStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [alsoIgnore, setAlsoIgnore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = dialog?.kind === "removeRepo";
  const id = open ? dialog.id : null;
  const name = open ? dialog.name : "";
  const path = open ? dialog.path : "";

  // Reset the "also ignore" choice each time — it's an explicit per-removal
  // decision. No "don't ask again" shortcut, in the same spirit as the force
  // pull acknowledgement.
  useEffect(() => {
    if (open) {
      setAlsoIgnore(false);
      setError(null);
    }
  }, [open]);

  async function confirm() {
    if (id === null) return;
    setBusy(true);
    setError(null);
    try {
      await remove(id);
      if (alsoIgnore && path) {
        try {
          await api.ignorePath(path);
        } catch (e) {
          // Repo is already gone; surface the ignore-list failure but don't
          // try to restore the repo row.
          setError(`Removed, but failed to ignore path: ${String(e)}`);
          setBusy(false);
          return;
        }
      }
      close();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Remove repo"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            Remove
          </Button>
        </>
      }
    >
      <p>
        Remove <span className="font-semibold text-zinc-100">{name}</span> from this dashboard?
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        This only removes the entry from the dashboard — the folder on disk is left untouched.
      </p>
      <label className="mt-3 flex items-start gap-2 rounded-md border border-border bg-surface-2 p-2.5 text-xs text-zinc-200">
        <input
          type="checkbox"
          checked={alsoIgnore}
          onChange={(e) => setAlsoIgnore(e.currentTarget.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 rounded border-border bg-surface-3"
        />
        <span>
          <span className="font-medium text-zinc-100">Also ignore this folder in future scans.</span>
          <span className="mt-0.5 block text-[11px] text-zinc-400">
            &quot;Scan folder…&quot; won&apos;t re-propose this path until you un-ignore it from Settings.
          </span>
        </span>
      </label>
      {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
    </Dialog>
  );
}
