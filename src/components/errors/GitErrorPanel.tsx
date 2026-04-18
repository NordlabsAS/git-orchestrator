import {
  AlertTriangle,
  Lock,
  Network,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import * as api from "../../lib/tauri";
import { classifyGitError, type ClassifiedGitError } from "../../lib/gitErrors";
import { Button } from "../ui/Button";

const CATEGORY_ICON: Record<ClassifiedGitError["category"], typeof AlertTriangle> = {
  auth_ssh: Lock,
  auth_https: Lock,
  cert_invalid: ShieldAlert,
  dirty_tree: AlertTriangle,
  not_ffable: AlertTriangle,
  network: Network,
  rate_limited: Network,
  refused: ShieldCheck,
  unknown: AlertTriangle,
};

interface Props {
  /** Raw error string (typically the caught `e` from an api call). */
  error: string;
  /** Repo to target when the user clicks "Open terminal" or "Diagnose". */
  repoId?: number;
}

export function GitErrorPanel({ error, repoId }: Props) {
  const classified = classifyGitError(error);
  const Icon = CATEGORY_ICON[classified.category];
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagOutput, setDiagOutput] = useState<string | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  async function diagnose() {
    if (repoId === undefined) return;
    setDiagBusy(true);
    setDiagError(null);
    setDiagOutput(null);
    try {
      const trace = await api.diagnoseAuth(repoId);
      setDiagOutput(trace);
    } catch (e) {
      setDiagError(String(e));
    } finally {
      setDiagBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Icon size={18} className="mt-0.5 shrink-0 text-red-400" />
        <div>
          <div className="font-semibold text-zinc-100">{classified.title}</div>
          <div className="mt-1 text-sm text-zinc-300">{classified.hint}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {repoId !== undefined && (
          <Button
            variant="default"
            onClick={() => void api.openTerminal(repoId)}
            icon={<Terminal size={14} />}
          >
            Open terminal
          </Button>
        )}
        {classified.diagnosable && repoId !== undefined && (
          <Button
            variant="default"
            onClick={() => void diagnose()}
            disabled={diagBusy}
            icon={<Search size={14} />}
          >
            {diagBusy ? "Tracing…" : "Diagnose auth"}
          </Button>
        )}
      </div>

      {diagError && (
        <div className="rounded border border-red-900/60 bg-red-950/20 px-2.5 py-2 text-xs text-red-300">
          Diagnose failed: {diagError}
        </div>
      )}
      {diagOutput && (
        <details open className="text-xs">
          <summary className="cursor-pointer text-zinc-400">
            Diagnostic trace (with <code>GIT_TRACE=1</code>)
          </summary>
          <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-surface-1 p-2 font-mono text-zinc-300">
            {diagOutput}
          </pre>
        </details>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-400">Raw output</summary>
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-surface-1 p-2 font-mono text-zinc-300">
          {classified.raw}
        </pre>
      </details>
    </div>
  );
}
