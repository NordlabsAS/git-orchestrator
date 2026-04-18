/** Convert an ISO timestamp into "just now / 3m ago / 2h ago / 5d ago / 2026-04-18". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const now = Date.now();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 0) return "just now";
  if (diff < 30) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  const date = new Date(t);
  return date.toISOString().slice(0, 10);
}

/** Truncate to at most `n` characters, with an ellipsis. */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/** First line of a commit message. */
export function firstLine(msg: string): string {
  const nl = msg.indexOf("\n");
  return nl === -1 ? msg : msg.slice(0, nl);
}
