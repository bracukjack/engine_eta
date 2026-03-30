"use client";

import { useState, useCallback } from "react";
import type { Bundle } from "@/lib/association-rules/types";
import { StockBadge } from "./StockBadge";
import { Copy, Check } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  bundles: Bundle[];
}

function BundleCard({ bundle }: { bundle: Bundle }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const codes = bundle.items.map((i) => i.code).join(", ");
    navigator.clipboard.writeText(codes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bundle]);

  const completePct = Math.round(bundle.stockCompleteness * 100);

  return (
    <div className="rounded-lg border border-edge bg-white p-4 hover:shadow-sm hover:border-accent/30 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-xs font-semibold text-primary">
            {bundle.name}
          </h4>
          <p className="text-[10px] text-muted font-mono mt-0.5">
            {bundle.categories.join(" + ")}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded border border-edge text-muted hover:text-accent hover:border-accent/30 transition-colors shrink-0"
          title="Copy item codes to clipboard"
        >
          {copied ? (
            <Check size={12} className="text-emerald-500" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      </div>

      {/* Items */}
      <div className="space-y-1.5 mb-3">
        {bundle.items.map((item) => (
          <div
            key={item.code}
            className="flex items-center gap-2 text-[11px]"
          >
            <span className="font-mono text-muted w-20 truncate shrink-0">
              {item.code}
            </span>
            <span className="flex-1 truncate text-primary">{item.name}</span>
            <StockBadge stock={item.stock} />
          </div>
        ))}
      </div>

      {/* Stock completeness bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted">Bundle completeness</span>
          <span
            className={cn(
              "font-mono font-semibold",
              completePct === 100
                ? "text-emerald-600"
                : completePct >= 50
                  ? "text-amber-600"
                  : "text-red-500"
            )}
          >
            {completePct}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              completePct === 100
                ? "bg-emerald-500"
                : completePct >= 50
                  ? "bg-amber-500"
                  : "bg-red-400"
            )}
            style={{ width: `${completePct}%` }}
          />
        </div>
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 pt-2 border-t border-edge/50 text-[10px] text-muted">
        <span>
          Value:{" "}
          <strong className="text-primary font-mono">
            &euro; {formatPrice(bundle.totalValue)}
          </strong>
        </span>
        <span>
          Frequency:{" "}
          <strong className="text-primary font-mono">
            {bundle.frequency}
          </strong>
        </span>
        <span>
          Support:{" "}
          <strong className="text-primary font-mono">
            {(bundle.support * 100).toFixed(1)}%
          </strong>
        </span>
      </div>
    </div>
  );
}

export function BundleGrid({ bundles }: Props) {
  if (bundles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-xs p-8">
        No bundles detected. Bundles require 3+ items spanning 2+ categories in
        the same order.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {bundles.map((bundle) => (
          <BundleCard key={bundle.id} bundle={bundle} />
        ))}
      </div>
    </div>
  );
}
