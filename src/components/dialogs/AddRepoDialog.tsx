import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useReposStore } from "../../stores/reposStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export function AddRepoDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const add = useReposStore((s) => s.add);
  const defaultDir = useSettingsStore((s) => s.settings.defaultReposDir);
  const open = dialog?.kind === "addRepo";

  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPath("");
      setName("");
      setError(null);
    }
  }, [open]);

  async function browse() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: defaultDir ?? undefined,
        title: "Pick a git repository",
      });
      if (typeof selected === "string") {
        setPath(selected);
        if (!name) {
          const seg = selected.split(/[\\/]/).filter(Boolean).pop();
          if (seg) setName(seg);
        }
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function submit() {
    if (!path.trim()) {
      setError("Pick a folder first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await add(path.trim(), name.trim() || undefined);
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
      title="Add repo"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={busy || !path.trim()}
            icon={busy ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">Folder</span>
          <div className="flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              placeholder="C:\\Projects\\my-repo"
              className="flex-1 rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-zinc-100 focus:border-blue-400 focus:outline-none"
            />
            <Button icon={<FolderOpen size={14} />} onClick={browse} disabled={busy}>
              Browse
            </Button>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">
            Display name <span className="text-zinc-500">(optional — defaults to folder name)</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="my-repo"
            className="rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-zinc-100 focus:border-blue-400 focus:outline-none"
          />
        </label>
        {error && <div className="text-xs text-red-300">{error}</div>}
        <div className="text-[11px] text-zinc-500">
          The folder must already be a git working tree. The app never clones or initialises repos.
        </div>
      </div>
    </Dialog>
  );
}
