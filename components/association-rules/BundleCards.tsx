"use client";

import type { Rule, DiscountZone } from "@/lib/association-rules/types";
import { ZONE_CONFIG } from "@/lib/association-rules/types";
import { ZoneDot } from "./DiscountDecisionBadge";
import { ArrowRight, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

interface Props {
  rules: Rule[];
}

const ZONE_ORDER: DiscountZone[] = ["green", "yellow", "purple", "gray"];

const ZONE_SECTION_COLORS: Record<DiscountZone, string> = {
  green: "border-emerald-200 bg-emerald-50/50",
  yellow: "border-amber-200 bg-amber-50/50",
  purple: "border-purple-200 bg-purple-50/50",
  gray: "border-zinc-200 bg-zinc-50",
};

export function BundleCards({ rules }: Props) {
  const grouped = ZONE_ORDER.map((zone) => ({
    zone,
    rules: rules.filter((r) => r.zone === zone).slice(0, 50),
  })).filter((g) => g.rules.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm p-8">
        <p className="text-xs">No bundle suggestions yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {grouped.map(({ zone, rules: zoneRules }) => (
        <div key={zone}>
          <div className="flex items-center gap-2 mb-3">
            <ZoneDot zone={zone} />
            <h3 className="text-sm font-semibold text-primary">
              {ZONE_CONFIG[zone].label}
            </h3>
            <span className="text-[11px] text-muted font-mono">
              {zoneRules.length} bundles
            </span>
          </div>
          <p className="text-[11px] text-muted mb-3">
            {ZONE_CONFIG[zone].action}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {zoneRules.map((rule, i) => (
              <BundleCard key={i} rule={rule} zone={zone} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BundleCard({ rule, zone }: { rule: Rule; zone: DiscountZone }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = `${rule.antecedent.join(",")} → ${rule.consequent.join(",")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rule]);

  return (
    <div
      className={`rounded-lg border p-3 ${ZONE_SECTION_COLORS[zone]} transition-shadow hover:shadow-sm`}
    >
      <div className="flex items-start gap-2">
        {/* Antecedent */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono font-semibold text-primary truncate">
            {rule.antecedent.join(", ")}
          </p>
          <p className="text-[10px] text-muted truncate">
            {rule.antecedentNames.join(", ")}
          </p>
        </div>
        <ArrowRight size={14} className="text-muted shrink-0 mt-1" />
        {/* Consequent */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono font-semibold text-primary truncate">
            {rule.consequent.join(", ")}
          </p>
          <p className="text-[10px] text-muted truncate">
            {rule.consequentNames.join(", ")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-edge/50">
        <span className="text-[10px] text-muted">
          Conf:{" "}
          <strong className="text-primary">
            {(rule.confidence * 100).toFixed(0)}%
          </strong>
        </span>
        <span className="text-[10px] text-muted">
          Lift:{" "}
          <strong className="text-primary">{rule.lift.toFixed(2)}</strong>
        </span>
        <span className="text-[10px] text-muted">
          Count: <strong className="text-primary">{rule.count}</strong>
        </span>
        {rule.recommendedDiscountPct > 0 && (
          <span className="text-[10px] text-muted">
            Disc:{" "}
            <strong className="text-primary">
              {rule.recommendedDiscountPct}%
            </strong>
          </span>
        )}
        <button
          onClick={handleCopy}
          className="ml-auto p-1 rounded text-muted hover:text-accent transition-colors"
          title="Copy rule"
        >
          {copied ? (
            <Check size={12} className="text-emerald-500" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      </div>
    </div>
  );
}
