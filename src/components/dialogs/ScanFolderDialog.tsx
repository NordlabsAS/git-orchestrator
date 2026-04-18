import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderSearch, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as api from "../../lib/tauri";
import { useReposStore } from "../../stores/reposStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import type { ScanEntry, ScanResult } from "../../types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/**
 * "Scan folder" — one-click onboarding for a projects directory like
 * `C:\Projects`. Lists every direct child that is a git working tree,
 * with each entry annotated:
 *
 *   - already in dashboard (checkbox disabled)
 *   - on ignore list (disabled, with an inline un-ignore action)
 *   - new (checkbox on by default)
 *
 * Re-running the scan later will NOT re-propose repos the user
 * previously ignored — they stay suppressed until the user explicitly
 * un-ignores them here or in Settings. See `src-tauri/src/commands/scan.rs`.
 */
export function ScanFolderDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const openNextDialog = useUiStore((s) => s.openDialog);
  const addMany = useReposStore((s) => s.addMany);
  const defaultDir = useSettingsStore((s) => s.settings.defaultReposDir);
  const open = dialog?.kind === "scanFolder";

  const [parent, setParent] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setParent(defaultDir ?? "");
      setScan(null);
      setSelected(new Set());
      setError(null);
    }
  }, [open, defaultDir]);

  async function browse() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: parent || defaultDir || undefined,
        title: "Pick a folder to scan for git repositories",
      });
      if (typeof picked === "string") {
        setParent(picked);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function runScan() {
    if (!parent.trim()) {
      setError("Pick a folder first");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const result = await api.scanFolder(parent.trim());
      setScan(result);
      const initial = new Set<string>();
      for (const e of result.entries) {
        if (!e.alreadyAdded && !e.ignored) initial.add(e.path);
      }
      setSelected(initial);
    } catch (e) {
      setError(String(e));
      setScan(null);
    } finally {
      setScanning(false);
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function unignoreEntry(entry: ScanEntry) {
    try {
      await api.unignorePath(entry.path);
      // Re-run scan so the entry flips from "ignored" → "new" and gets checked.
      setScan((prev) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e) =>
                e.path === entry.path ? { ...e, ignored: false } : e,
              ),
            }
          : prev,
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(entry.path);
        return next;
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);
    try {
      const result = await addMany(Array.from(selected));
      close();
      openNextDialog({
        kind: "info",
        title: "Scan complete",
        body:
          `Added ${result.added.length} repo${result.added.length === 1 ? "" : "s"}.` +
          (result.skipped.length > 0
            ? `\n\nSkipped ${result.skipped.length}:\n` +
              result.skipped.map((s) => `  ${s.path} — ${s.reason}`).join("\n")
            : ""),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }

  const { newCount, addedCount, ignoredCount } = useMemo(() => {
    if (!scan) return { newCount: 0, addedCount: 0, ignoredCount: 0 };
    let n = 0;
    let a = 0;
    let i = 0;
    for (const e of scan.entries) {
      if (e.alreadyAdded) a++;
      else if (e.ignored) i++;
      else n++;
    }
    return { newCount: n, addedCount: a, ignoredCount: i };
  }, [scan]);

  const busy = scanning || adding;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Scan folder for repos"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={addSelected}
            disabled={busy || selected.size === 0}
            icon={adding ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            Add {selected.size > 0 ? `${selected.size} selected` : "selected"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">Parent folder</span>
          <div className="flex gap-2">
            <input
              value={parent}
              onChange={(e) => setParent(e.currentTarget.value)}
              placeholder="C:\\Projects"
              className="flex-1 rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-zinc-100 focus:border-blue-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void runScan();
              }}
            />
            <Button icon={<FolderOpen size={14} />} onClick={browse} disabled={busy}>
              Browse
            </Button>
            <Button
              variant="primary"
              icon={scanning ? <Loader2 size={14} className="animate-spin" /> : <FolderSearch size={14} />}
              onClick={runScan}
              disabled={busy || !parent.trim()}
            >
              Scan
            </Button>
          </div>
          <div className="text-[11px] text-zinc-500">
            Only direct children are inspected. Each subfolder that looks like a git working
            tree becomes a candidate.
          </div>
        </label>

        {error && <div className="text-xs text-red-300">{error}</div>}

        {scan && (
          <>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span>
                <span className="font-semibold text-zinc-200">{newCount}</span> new
              </span>
              <span>
                <span className="font-semibold text-zinc-200">{addedCount}</span> already
                added
              </span>
              <span>
                <span className="font-semibold text-zinc-200">{ignoredCount}</span> ignored
              </span>
            </div>

            {scan.entries.length === 0 ? (
              <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-zinc-400">
                No git repositories found in <code>{scan.parent}</code>.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-surface-2">
                <ul className="divide-y divide-border">
                  {scan.entries.map((entry) => {
                    const disabled = entry.alreadyAdded || entry.ignored;
                    const isChecked = selected.has(entry.path) && !disabled;
                    return (
                      <li
                        key={entry.path}
                        className="flex items-center gap-2 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={disabled || busy}
                          onChange={() => toggle(entry.path)}
                          className="h-4 w-4 rounded border-border bg-surface-3"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium text-zinc-100">
                            {entry.displayName}
                          </span>
                          <span className="truncate text-[11px] text-zinc-500">
                            {entry.path}
                          </span>
                        </div>
                        {entry.alreadyAdded && (
                          <span className="shrink-0 rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                            already added
                          </span>
                        )}
                        {entry.ignored && !entry.alreadyAdded && (
                          <>
                            <span className="shrink-0 rounded bg-amber-700/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
                              ignored
                            </span>
                            <button
                              onClick={() => void unignoreEntry(entry)}
                              disabled={busy}
                              className="shrink-0 text-[11px] text-blue-300 hover:text-blue-200 disabled:opacity-50"
                            >
                              un-ignore
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
