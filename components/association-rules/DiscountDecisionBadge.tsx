"use client";

import type { DiscountZone } from "@/lib/association-rules/types";
import { ZONE_CONFIG } from "@/lib/association-rules/types";
import { cn } from "@/lib/utils";

const ZONE_COLORS: Record<DiscountZone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  gray: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

export function DiscountDecisionBadge({ zone }: { zone: DiscountZone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border",
        ZONE_COLORS[zone]
      )}
    >
      {ZONE_CONFIG[zone].label}
    </span>
  );
}

export function ZoneDot({ zone }: { zone: DiscountZone }) {
  const dotColor: Record<DiscountZone, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    purple: "bg-purple-500",
    gray: "bg-zinc-400",
  };
  return <div className={cn("w-2.5 h-2.5 rounded-full", dotColor[zone])} />;
}
