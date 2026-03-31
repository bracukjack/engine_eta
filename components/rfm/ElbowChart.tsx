"use client";

/**
 * ElbowChart — Pure SVG line chart of WCSS vs K.
 * The optimal K is highlighted with an accent marker and annotation.
 */

import type { ElbowPoint } from "@/lib/rfm-types";

const W = 480, H = 200;
const ML = 56, MR = 24, MT = 16, MB = 44;
const PW = W - ML - MR;
const PH = H - MT - MB;

export function ElbowChart({ data, optimalK }: { data: ElbowPoint[]; optimalK: number }) {
  if (data.length === 0) return null;

  const kMin  = data[0].k;
  const kMax  = data[data.length - 1].k;
  const wMin  = Math.min(...data.map((d) => d.wcss));
  const wMax  = Math.max(...data.map((d) => d.wcss));
  const wPad  = (wMax - wMin) * 0.1;
  const wLo   = wMin - wPad;
  const wHi   = wMax + wPad;

  const xOf = (k: number) => ML + ((k - kMin) / Math.max(kMax - kMin, 1)) * PW;
  const yOf = (w: number) => MT + (1 - (w - wLo) / (wHi - wLo)) * PH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xOf(d.k).toFixed(1)},${yOf(d.wcss).toFixed(1)}`)
    .join(" ");

  // Y-axis ticks
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) =>
    wLo + ((wHi - wLo) * i) / yTicks
  );

  const fmtWcss = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(2);

  return (
    <div className="w-full">
      <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
        Elbow Method — WCSS vs K
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {yTickVals.map((v, i) => (
          <line
            key={i}
            x1={ML} y1={yOf(v).toFixed(1)}
            x2={ML + PW} y2={yOf(v).toFixed(1)}
            stroke="#e2e8f0" strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {yTickVals.map((v, i) => (
          <text
            key={i}
            x={ML - 6} y={yOf(v)}
            textAnchor="end" dominantBaseline="middle"
            fontSize="9" fill="#94a3b8"
          >
            {fmtWcss(v)}
          </text>
        ))}

        {/* X-axis labels */}
        {data.map((d) => (
          <text
            key={d.k}
            x={xOf(d.k)} y={MT + PH + 16}
            textAnchor="middle" fontSize="10"
            fill={d.k === optimalK ? "#2563eb" : "#94a3b8"}
            fontWeight={d.k === optimalK ? "700" : "400"}
          >
            {d.k}
          </text>
        ))}

        {/* X-axis title */}
        <text x={ML + PW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
          Number of clusters (K)
        </text>

        {/* Main WCSS line */}
        <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />

        {/* All data points */}
        {data.map((d) => (
          <circle
            key={d.k}
            cx={xOf(d.k)} cy={yOf(d.wcss)}
            r={d.k === optimalK ? 6 : 4}
            fill={d.k === optimalK ? "#2563eb" : "#fff"}
            stroke={d.k === optimalK ? "#2563eb" : "#94a3b8"}
            strokeWidth="2"
          />
        ))}

        {/* Optimal K annotation */}
        {(() => {
          const opt = data.find((d) => d.k === optimalK);
          if (!opt) return null;
          const cx = xOf(opt.k);
          const cy = yOf(opt.wcss);
          const flip = cy < MT + 36;
          const ay = flip ? cy + 28 : cy - 28;
          return (
            <g>
              <line x1={cx} y1={cy} x2={cx} y2={ay} stroke="#2563eb" strokeWidth="1" strokeDasharray="3,2" />
              <rect x={cx - 34} y={ay - (flip ? 0 : 16)} width={68} height={16} rx={4} fill="#eff6ff" stroke="#2563eb" strokeWidth="1" />
              <text x={cx} y={ay - (flip ? 0 : 16) + 11} textAnchor="middle" fontSize="9" fill="#2563eb" fontWeight="700">
                K={optimalK} optimal
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
