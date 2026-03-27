"use client";

import type { MiningStats } from "@/lib/association-rules/types";
import { ShoppingCart, Package, GitBranch, Sparkles } from "lucide-react";

interface Props {
  stats: MiningStats | null;
}

export function MetricsSummary({ stats }: Props) {
  if (!stats) return null;

  const cards = [
    {
      label: "Total Orders",
      value: stats.totalOrders.toLocaleString(),
      icon: ShoppingCart,
    },
    {
      label: "Baskets ≥2 items",
      value: stats.basketsUsed.toLocaleString(),
      icon: Package,
    },
    {
      label: "Rules Found",
      value: stats.rulesFound.toLocaleString(),
      icon: GitBranch,
    },
    {
      label: "Strong Bundles",
      value: stats.strongBundles.toLocaleString(),
      icon: Sparkles,
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-edge shadow-sm"
          >
            <Icon size={14} className="text-accent shrink-0" />
            <div>
              <p className="text-[11px] text-muted leading-none">{card.label}</p>
              <p className="text-sm font-mono font-semibold text-primary leading-tight">
                {card.value}
              </p>
            </div>
          </div>
        );
      })}
      <span className="text-[11px] text-muted font-mono ml-auto">
        {(stats.computeTimeMs / 1000).toFixed(1)}s
      </span>
    </div>
  );
}
