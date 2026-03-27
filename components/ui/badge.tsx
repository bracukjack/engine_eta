"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "active" | "draft" | "continue" | "deny" | "accent" | "muted";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded transition-all duration-200",
        variant === "default" && "bg-slate-100 border border-slate-200 text-primary",
        variant === "active" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
        variant === "draft" && "bg-zinc-100 text-zinc-600 border border-zinc-200",
        variant === "continue" && "bg-amber-50 text-amber-700 border border-amber-200",
        variant === "deny" && "bg-zinc-100 text-zinc-500 border border-zinc-200",
        variant === "accent" && "bg-blue-50 text-accent border border-blue-200",
        variant === "muted" && "bg-slate-50 text-muted border border-slate-200",
        className
      )}
    >
      {children}
    </span>
  );
}
