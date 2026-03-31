"use client";

/**
 * SegmentDashboard — one card per cluster/segment.
 * Shows: label, emoji, count, avg R/F/M, recommendation, % of total.
 * Clicking a card sets the active segment filter.
 */

import { cn } from "@/lib/utils";
import { formatInteger } from "@/lib/utils";
import type { ClusterCentroid, SegmentLabel } from "@/lib/rfm-types";
import { SEGMENT_META } from "@/lib/rfm-types";

interface SegmentCard {
  label: SegmentLabel;
  color: string;
  count: number;
  avgRecency: number;
  avgFrequency: number;
  avgMonetary: number;
  pct: number;
}

function buildCards(
  centroids: import("@/lib/rfm-types").ClusterCentroid[],
  total: number
): SegmentCard[] {
  // Group centroids that share the same segment label (they get the same label)
  const map = new Map<SegmentLabel, SegmentCard>();

  for (const c of centroids) {
    const meta = SEGMENT_META[c.id as unknown as SegmentLabel]; // fallback
    // We need to know the label — we don't store it on centroid directly.
    // The parent passes centroids which only have IDs; use a prop instead.
    void meta; void c; // handled by parent
  }
  return []; // unused — parent passes pre-built cards
}
void buildCards; // suppress unused

export function SegmentDashboard({
  centroids,
  segmentLabels,
  total,
  activeSegment,
  onSelect,
}: {
  centroids: ClusterCentroid[];
  segmentLabels: Record<number, SegmentLabel>;
  total: number;
  activeSegment: SegmentLabel | "all";
  onSelect: (s: SegmentLabel | "all") => void;
}) {
  // Build one card per unique segment label (merge clusters with same label)
  const grouped = new Map<
    SegmentLabel,
    { count: number; sumR: number; sumF: number; sumM: number; color: string }
  >();

  for (const c of centroids) {
    const label = segmentLabels[c.id];
    if (!label) continue;
    const meta  = SEGMENT_META[label];
    const entry = grouped.get(label) ?? { count: 0, sumR: 0, sumF: 0, sumM: 0, color: meta.color };
    entry.count  += c.count;
    entry.sumR   += c.avgRecency   * c.count;
    entry.sumF   += c.avgFrequency * c.count;
    entry.sumM   += c.avgMonetary  * c.count;
    grouped.set(label, entry);
  }

  const cards: SegmentCard[] = Array.from(grouped.entries()).map(([label, g]) => ({
    label,
    color:       g.color,
    count:       g.count,
    avgRecency:  g.count ? g.sumR / g.count : 0,
    avgFrequency: g.count ? g.sumF / g.count : 0,
    avgMonetary: g.count ? g.sumM / g.count : 0,
    pct:         total > 0 ? (g.count / total) * 100 : 0,
  }));

  // Sort by count desc
  cards.sort((a, b) => b.count - a.count);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      {cards.map((card) => {
        const meta     = SEGMENT_META[card.label];
        const isActive = activeSegment === "all" || activeSegment === card.label;
        const isSelected = activeSegment === card.label;

        return (
          <button
            key={card.label}
            onClick={() => onSelect(isSelected ? "all" : card.label)}
            className={cn(
              "text-left p-3 rounded-xl border-2 transition-all cursor-pointer",
              isSelected
                ? "border-current shadow-md"
                : "border-edge hover:border-slate-300 hover:shadow-sm",
              !isActive && "opacity-40"
            )}
            style={isSelected ? { borderColor: card.color } : undefined}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg leading-none">{meta.emoji}</span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-primary truncate">{card.label}</div>
                <div className="text-[10px] text-muted font-mono">
                  {card.count} customers · {card.pct.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Mini bar (% of total) */}
            <div className="h-1.5 rounded-full bg-slate-100 mb-2.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${card.pct}%`, background: card.color }}
              />
            </div>

            {/* RFM stats */}
            <div className="grid grid-cols-3 gap-1 text-center mb-2">
              {[
                { label: "Rec", value: `${Math.round(card.avgRecency)}d` },
                { label: "Freq", value: card.avgFrequency.toFixed(1) },
                { label: "Mon", value: `€${formatInteger(card.avgMonetary)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-slate-50 px-1 py-1">
                  <div className="text-[9px] text-muted uppercase tracking-wide">{s.label}</div>
                  <div className="text-[11px] font-mono font-semibold text-primary truncate">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Recommendation */}
            <p className="text-[10px] text-muted leading-tight line-clamp-2">
              {meta.recommendation}
            </p>

            {/* Colour chip */}
            <div
              className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
              style={{ background: card.color }}
            >
              {card.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
