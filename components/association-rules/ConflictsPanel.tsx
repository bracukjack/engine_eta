"use client";

import { useState } from "react";
import type { NegativeRule, CannibalizationPair } from "@/lib/association-rules/types";
import { Ban, ArrowDownRight } from "lucide-react";

interface Props {
  negativeRules: NegativeRule[];
  cannibalizationPairs: CannibalizationPair[];
}

export function ConflictsPanel({ negativeRules, cannibalizationPairs }: Props) {
  const [tab, setTab] = useState<"negative" | "cannibalization">("negative");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub tabs */}
      <div className="shrink-0 flex items-center gap-0 border-b border-edge bg-surface/50">
        <button
          onClick={() => setTab("negative")}
          className={`px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
            tab === "negative" ? "text-accent border-accent" : "text-muted border-transparent hover:text-primary"
          }`}
        >
          <span className="flex items-center gap-1"><Ban size={11} /> Negative Rules ({negativeRules.length})</span>
        </button>
        <button
          onClick={() => setTab("cannibalization")}
          className={`px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
            tab === "cannibalization" ? "text-accent border-accent" : "text-muted border-transparent hover:text-primary"
          }`}
        >
          <span className="flex items-center gap-1"><ArrowDownRight size={11} /> Cannibalization ({cannibalizationPairs.length})</span>
        </button>
      </div>

      {tab === "negative" ? (
        <div className="flex-1 overflow-auto">
          {negativeRules.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted text-xs">
              No negative rules detected
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-[11px] text-muted bg-red-50/50 border-b border-edge">
                Items that repel each other — customers who buy one rarely buy the other. Avoid bundling these together.
              </div>
              <div className="sticky top-0 z-10 flex items-center h-8 border-b border-edge bg-surface px-4 text-[10px] font-semibold text-muted uppercase tracking-wider">
                <div className="w-[200px] shrink-0">Item A</div>
                <div className="w-7 shrink-0" />
                <div className="w-[200px] shrink-0">Item B</div>
                <div className="w-[90px] shrink-0 text-center">Lift</div>
                <div className="w-[100px] shrink-0 text-center">Observed</div>
                <div className="w-[100px] shrink-0 text-center">Expected</div>
                <div className="flex-1">Groups</div>
              </div>
              {negativeRules.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center px-4 py-2 border-b border-edge/50 text-xs hover:bg-surface-hover transition-colors"
                >
                  <div className="w-[200px] shrink-0 truncate">
                    <span className="font-mono text-[11px]">{r.itemA}</span>
                    <br />
                    <span className="text-[10px] text-muted">{r.nameA}</span>
                  </div>
                  <div className="w-7 shrink-0 flex items-center justify-center">
                    <Ban size={10} className="text-red-400" />
                  </div>
                  <div className="w-[200px] shrink-0 truncate">
                    <span className="font-mono text-[11px]">{r.itemB}</span>
                    <br />
                    <span className="text-[10px] text-muted">{r.nameB}</span>
                  </div>
                  <div className="w-[90px] shrink-0 text-center font-mono font-semibold text-red-600">
                    {r.lift.toFixed(3)}
                  </div>
                  <div className="w-[100px] shrink-0 text-center font-mono">
                    {(r.observedSupport * 100).toFixed(3)}%
                  </div>
                  <div className="w-[100px] shrink-0 text-center font-mono">
                    {(r.expectedSupport * 100).toFixed(3)}%
                  </div>
                  <div className="flex-1 flex gap-1">
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{r.itemGroupA || "—"}</span>
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{r.itemGroupB || "—"}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {cannibalizationPairs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted text-xs">
              No cannibalization detected
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-[11px] text-muted bg-orange-50/50 border-b border-edge">
                Items in the same sub-category with similar prices that rarely appear together — potential cannibalization.
              </div>
              <div className="sticky top-0 z-10 flex items-center h-8 border-b border-edge bg-surface px-4 text-[10px] font-semibold text-muted uppercase tracking-wider">
                <div className="w-[200px] shrink-0">Item A</div>
                <div className="w-7 shrink-0" />
                <div className="w-[200px] shrink-0">Item B</div>
                <div className="w-[120px] shrink-0">Sub-Category</div>
                <div className="w-[80px] shrink-0 text-center">Price A</div>
                <div className="w-[80px] shrink-0 text-center">Price B</div>
                <div className="w-[80px] shrink-0 text-center">Co-Rate</div>
                <div className="w-[70px] shrink-0 text-center">Solo A</div>
                <div className="w-[70px] shrink-0 text-center">Solo B</div>
              </div>
              {cannibalizationPairs.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center px-4 py-2 border-b border-edge/50 text-xs hover:bg-surface-hover transition-colors"
                >
                  <div className="w-[200px] shrink-0 truncate">
                    <span className="font-mono text-[11px]">{p.itemA}</span>
                    <br />
                    <span className="text-[10px] text-muted">{p.nameA}</span>
                  </div>
                  <div className="w-7 shrink-0 flex items-center justify-center">
                    <ArrowDownRight size={10} className="text-orange-400" />
                  </div>
                  <div className="w-[200px] shrink-0 truncate">
                    <span className="font-mono text-[11px]">{p.itemB}</span>
                    <br />
                    <span className="text-[10px] text-muted">{p.nameB}</span>
                  </div>
                  <div className="w-[120px] shrink-0 text-[10px] truncate">{p.subCategory}</div>
                  <div className="w-[80px] shrink-0 text-center font-mono">&euro;{p.priceA.toFixed(0)}</div>
                  <div className="w-[80px] shrink-0 text-center font-mono">&euro;{p.priceB.toFixed(0)}</div>
                  <div className="w-[80px] shrink-0 text-center font-mono font-semibold text-orange-600">
                    {(p.coOccurrenceRate * 100).toFixed(1)}%
                  </div>
                  <div className="w-[70px] shrink-0 text-center font-mono">{(p.soloRateA * 100).toFixed(0)}%</div>
                  <div className="w-[70px] shrink-0 text-center font-mono">{(p.soloRateB * 100).toFixed(0)}%</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
