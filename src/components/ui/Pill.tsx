import clsx from "clsx";
import type { ReactNode } from "react";

type Tone = "neutral" | "green" | "yellow" | "red" | "blue";

interface Props {
  tone?: Tone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-zinc-300 border-border",
  green: "bg-emerald-600/15 text-emerald-300 border-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  red: "bg-red-600/15 text-red-300 border-red-500/40",
  blue: "bg-blue-500/15 text-blue-200 border-blue-500/30",
};

export function Pill({ tone = "neutral", icon, title, children }: Props) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}
