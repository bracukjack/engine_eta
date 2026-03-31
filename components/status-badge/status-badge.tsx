"use client";

import { Badge } from "@/components/ui/badge";

type StatusType = "active" | "draft" | "archived";
type PolicyType = "continue" | "deny";

export function StatusBadge({ status }: { status: StatusType }) {
  if (status === "archived") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-500 capitalize">
        archived
      </span>
    );
  }
  return <Badge variant={status}>{status}</Badge>;
}

export function PolicyBadge({ policy }: { policy: PolicyType }) {
  return <Badge variant={policy}>{policy}</Badge>;
}

export function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-edge shadow-sm">
      <span className="text-[11px] text-muted">{label}</span>
      <span
        className={`text-xs font-mono font-semibold ${accent ? "text-accent" : "text-primary"}`}
      >
        {value}
      </span>
    </div>
  );
}
