import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

const base =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-sm font-medium border transition " +
  "disabled:opacity-50 disabled:cursor-not-allowed select-none";

const variants: Record<Variant, string> = {
  default:
    "bg-surface-3 border-border hover:bg-surface-4 hover:border-border-strong text-zinc-100",
  primary:
    "bg-blue-600 border-blue-500 hover:bg-blue-500 hover:border-blue-400 text-white",
  danger:
    "bg-red-600/20 border-red-600/40 hover:bg-red-600/30 hover:border-red-500 text-red-200",
  ghost:
    "bg-transparent border-transparent hover:bg-surface-3 text-zinc-300",
};

export function Button({ variant = "default", icon, className, children, ...rest }: Props) {
  return (
    <button className={clsx(base, variants[variant], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  tone?: "default" | "primary" | "danger";
}

export function IconButton({ title, tone = "default", className, children, ...rest }: IconButtonProps) {
  const toneClass =
    tone === "primary"
      ? "hover:bg-blue-600/20 hover:text-blue-300"
      : tone === "danger"
        ? "hover:bg-red-600/20 hover:text-red-300"
        : "hover:bg-surface-3 hover:text-zinc-100";
  return (
    <button
      title={title}
      aria-label={title}
      className={clsx(
        "inline-flex items-center justify-center rounded-md h-8 w-8 text-zinc-300 transition",
        "border border-transparent hover:border-border disabled:opacity-40 disabled:cursor-not-allowed",
        toneClass,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
