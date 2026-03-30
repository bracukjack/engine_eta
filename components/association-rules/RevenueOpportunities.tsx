"use client";

import { useMemo, useState } from "react";
import type { ItemRule } from "@/lib/association-rules/types";
import { StockBadge } from "./StockBadge";
import { ArrowRight, TrendingUp } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface Props {
  rules: ItemRule[];
  salespersons: string[];
  salespersonItems: Record<string, string[]>;
}

function generateUpsellScript(rule: ItemRule): string {
  const anteName =
    rule.antecedentNames[0] || rule.antecedent[0];
  const consName =
    rule.consequentNames[0] || rule.consequent[0];
  const pct = Math.round(rule.confidence * 100);
  return `"Since you're looking at ${anteName}, you might also love ${consName} \u2014 ${pct}% of customers pair them together."`;
}

export function RevenueOpportunities({
  rules,
  salespersons,
  salespersonItems,
}: Props) {
  const [selectedSP, setSelectedSP] = useState<string>("");

  const topRules = useMemo(() => {
    let data = [...rules]
      .filter((r) => r.consequentStock.status !== "out_of_stock")
      .sort((a, b) => b.revenueLift - a.revenueLift);

    // Filter by salesperson: show rules where antecedent items are in this salesperson's portfolio
    if (selectedSP && salespersonItems[selectedSP]) {
      const spItems = new Set(salespersonItems[selectedSP]);
      data = data.filter((r) =>
        r.antecedent.some((item) => spItems.has(item))
      );
    }

    return data.slice(0, 20);
  }, [rules, selectedSP, salespersonItems]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Salesperson filter */}
      {salespersons.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted font-medium">
            Filter by salesperson:
          </span>
          <select
            value={selectedSP}
            onChange={(e) => setSelectedSP(e.target.value)}
            className="bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 max-w-64"
          >
            <option value="">All salespersons</option>
            {salespersons.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Revenue cards */}
      {topRules.length === 0 ? (
        <div className="flex items-center justify-center text-muted text-xs py-12">
          No revenue opportunities found. Try adjusting filters or loading more
          data.
        </div>
      ) : (
        <div className="space-y-3">
          {topRules.map((rule, i) => {
            const estRevenue = rule.support * rule.consequentAvgPrice * 100;

            return (
              <div
                key={i}
                className="rounded-lg border border-edge bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {/* Rank */}
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-accent">
                      #{i + 1}
                    </span>
                  </div>

                  {/* Rule details */}
                  <div className="flex-1 min-w-0">
                    {/* Rule */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-primary">
                        {rule.antecedentNames.join(", ")}
                      </span>
                      <ArrowRight size={12} className="text-muted shrink-0" />
                      <span className="text-xs font-semibold text-accent">
                        {rule.consequentNames.join(", ")}
                      </span>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 mt-1.5 text-[11px] text-muted">
                      <span>
                        Confidence:{" "}
                        <strong className="text-primary">
                          {(rule.confidence * 100).toFixed(0)}%
                        </strong>
                      </span>
                      <span>
                        Lift:{" "}
                        <strong className="text-primary">
                          {rule.lift.toFixed(2)}
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp size={10} className="text-emerald-500" />
                        Revenue Lift:{" "}
                        <strong className="text-emerald-600">
                          {rule.revenueLift.toFixed(0)}
                        </strong>
                      </span>
                    </div>

                    {/* Estimated revenue */}
                    <div className="mt-2 px-3 py-1.5 rounded bg-emerald-50 border border-emerald-100 inline-block">
                      <p className="text-[11px] text-emerald-700">
                        Est. additional revenue per 100 orders:{" "}
                        <strong className="font-mono">
                          &euro; {formatPrice(estRevenue)}
                        </strong>
                      </p>
                    </div>

                    {/* Upsell script */}
                    <p className="mt-2 text-[11px] text-muted italic leading-relaxed">
                      {generateUpsellScript(rule)}
                    </p>
                  </div>

                  {/* Stock badge */}
                  <div className="shrink-0">
                    <StockBadge stock={rule.consequentStock} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
