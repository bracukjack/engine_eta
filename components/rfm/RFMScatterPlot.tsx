"use client";

/**
 * RFMScatterPlot — Pure SVG scatter plot.
 *   X-axis: Recency Norm (right = more recent / better)
 *   Y-axis: Frequency Norm (up = more frequent / better)
 *   Dot size: proportional to Monetary Norm
 *   Dot colour: segment colour
 *   Hover tooltip: customer details
 */

import { useState } from "react";
import type { CustomerRFM, SegmentLabel } from "@/lib/rfm-types";
import { SEGMENT_META } from "@/lib/rfm-types";
import { formatInteger } from "@/lib/utils";

const W = 520, H = 360;
const ML = 44, MR = 20, MT = 20, MB = 48;
const PW = W - ML - MR;
const PH = H - MT - MB;
const R_MIN = 4, R_MAX = 14;

interface Tooltip {
  customer: CustomerRFM;
  x: number;
  y: number;
}

export function RFMScatterPlot({
  customers,
  activeSegment,
}: {
  customers: CustomerRFM[];
  activeSegment: SegmentLabel | "all";
}) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  if (customers.length === 0) return null;

  const cx = (r: number) => ML + r * PW;
  const cy = (f: number) => MT + (1 - f) * PH;
  const cr = (m: number) => R_MIN + m * (R_MAX - R_MIN);

  // Axis grid ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const dim = (c: CustomerRFM) =>
    activeSegment !== "all" && c.segmentLabel !== activeSegment;

  // Unique segments present
  const presentSegments = Array.from(
    new Set(customers.map((c) => c.segmentLabel))
  ) as SegmentLabel[];

  return (
    <div className="w-full select-none">
      <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
        RFM Scatter — Recency vs Frequency (size = Monetary)
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 360 }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={cx(t)} y1={MT} x2={cx(t)} y2={MT + PH} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={ML} y1={cy(t)} x2={ML + PW} y2={cy(t)} stroke="#e2e8f0" strokeWidth="1" />
          </g>
        ))}

        {/* X-axis labels */}
        {ticks.map((t) => (
          <text key={t} x={cx(t)} y={MT + PH + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {t === 0 ? "Stale" : t === 1 ? "Recent" : t.toFixed(2)}
          </text>
        ))}
        <text x={ML + PW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
          Recency (→ more recent)
        </text>

        {/* Y-axis labels */}
        {ticks.map((t) => (
          <text key={t} x={ML - 6} y={cy(t)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#94a3b8">
            {t === 0 ? "Low" : t === 1 ? "High" : t.toFixed(2)}
          </text>
        ))}

        {/* Dots — dimmed segments first, active on top */}
        {[true, false].map((dimmed) =>
          customers
            .filter((c) => dim(c) === dimmed)
            .map((c, i) => (
              <circle
                key={`${c.code}-${i}`}
                cx={cx(c.recencyNorm)}
                cy={cy(c.frequencyNorm)}
                r={cr(c.monetaryNorm)}
                fill={c.segmentColor}
                fillOpacity={dimmed ? 0.12 : 0.7}
                stroke={c.segmentColor}
                strokeOpacity={dimmed ? 0.2 : 1}
                strokeWidth="1"
                style={{ cursor: "pointer" }}
                onMouseEnter={(ev) => {
                  const svg = (ev.currentTarget as SVGCircleElement).closest("svg")!;
                  const rect = svg.getBoundingClientRect();
                  const svgX = +ev.currentTarget.getAttribute("cx")!;
                  const svgY = +ev.currentTarget.getAttribute("cy")!;
                  const scaleX = rect.width / W;
                  const scaleY = rect.height / H;
                  setTooltip({
                    customer: c,
                    x: svgX * scaleX,
                    y: svgY * scaleY,
                  });
                }}
              />
            ))
        )}

        {/* Axes borders */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + PH} stroke="#cbd5e1" strokeWidth="1.5" />
        <line x1={ML} y1={MT + PH} x2={ML + PW} y2={MT + PH} stroke="#cbd5e1" strokeWidth="1.5" />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-2">
        {presentSegments.map((seg) => {
          const meta = SEGMENT_META[seg];
          const isActive = activeSegment === "all" || activeSegment === seg;
          return (
            <div
              key={seg}
              className="flex items-center gap-1.5 text-[11px]"
              style={{ opacity: isActive ? 1 : 0.35 }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: meta.color }}
              />
              <span className="text-muted">{meta.label}</span>
            </div>
          );
        })}
      </div>

      {/* Tooltip (positioned relative to parent) */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 bg-white border border-edge rounded-lg shadow-lg px-3 py-2 text-[11px] space-y-0.5"
          style={{ top: tooltip.y + 16, left: tooltip.x + 16, maxWidth: 220 }}
        >
          <div className="font-semibold text-primary truncate">{tooltip.customer.name}</div>
          <div className="text-muted font-mono">{tooltip.customer.code}</div>
          <div className="border-t border-edge mt-1 pt-1 space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted">Recency</span>
              <span className="font-mono font-medium">{tooltip.customer.recency}d</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted">Frequency</span>
              <span className="font-mono font-medium">{tooltip.customer.frequency}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted">Monetary</span>
              <span className="font-mono font-medium">€{formatInteger(tooltip.customer.monetary)}</span>
            </div>
          </div>
          <div
            className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
            style={{ background: tooltip.customer.segmentColor }}
          >
            {SEGMENT_META[tooltip.customer.segmentLabel].emoji} {tooltip.customer.segmentLabel}
          </div>
        </div>
      )}
    </div>
  );
}
