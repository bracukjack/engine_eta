"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { MatrixCell, CategoryRule } from "@/lib/association-rules/types";
import { ArrowRight } from "lucide-react";

interface Props {
  itemGroupMatrix: MatrixCell[];
  subCategoryMatrix: MatrixCell[];
  crossCategoryRules: CategoryRule[];
}

function getHeatColor(lift: number): string {
  if (lift <= 1) return "bg-slate-50";
  if (lift < 1.3) return "bg-blue-50";
  if (lift < 1.6) return "bg-blue-100";
  if (lift < 2.0) return "bg-blue-200";
  if (lift < 2.5) return "bg-blue-300";
  if (lift < 3.0) return "bg-blue-400 text-white";
  return "bg-blue-600 text-white";
}

function HeatmapTable({
  title,
  cells,
  maxLabels,
}: {
  title: string;
  cells: MatrixCell[];
  maxLabels: number;
}) {
  const { labels, matrix } = useMemo(() => {
    // Collect all unique labels, sort by frequency
    const freq = new Map<string, number>();
    for (const c of cells) {
      freq.set(c.row, (freq.get(c.row) || 0) + c.count);
      freq.set(c.col, (freq.get(c.col) || 0) + c.count);
    }
    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxLabels)
      .map(([label]) => label);

    const labelSet = new Set(sorted);

    // Build matrix lookup
    const m = new Map<string, number>();
    for (const c of cells) {
      if (labelSet.has(c.row) && labelSet.has(c.col)) {
        m.set(`${c.row}\x00${c.col}`, c.lift);
      }
    }

    return { labels: sorted, matrix: m };
  }, [cells, maxLabels]);

  if (labels.length === 0) {
    return (
      <div className="text-xs text-muted text-center py-4">
        No data available
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-[11px] font-semibold text-primary mb-2">{title}</h4>
      <div className="overflow-auto">
        <table className="text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="p-1 text-left text-muted font-medium w-24" />
              {labels.map((col) => (
                <th
                  key={col}
                  className="p-1 text-center text-muted font-medium max-w-16 truncate"
                  title={col}
                >
                  {col.length > 8 ? col.slice(0, 7) + "\u2026" : col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((row) => (
              <tr key={row}>
                <td
                  className="p-1 text-muted font-medium truncate max-w-24"
                  title={row}
                >
                  {row.length > 12 ? row.slice(0, 11) + "\u2026" : row}
                </td>
                {labels.map((col) => {
                  const lift = matrix.get(`${row}\x00${col}`);
                  const isSelf = row === col;
                  return (
                    <td
                      key={col}
                      className={cn(
                        "p-1 text-center font-mono border border-edge/30 min-w-10",
                        isSelf
                          ? "bg-slate-100 text-slate-400"
                          : lift
                            ? getHeatColor(lift)
                            : "bg-white text-slate-300"
                      )}
                      title={
                        lift
                          ? `${row} \u2192 ${col}: lift ${lift.toFixed(2)}`
                          : undefined
                      }
                    >
                      {isSelf ? "\u2014" : lift ? lift.toFixed(1) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CategoryHeatmap({
  itemGroupMatrix,
  subCategoryMatrix,
  crossCategoryRules,
}: Props) {
  const igRules = crossCategoryRules.filter((r) => r.level === "itemGroup");
  const scRules = crossCategoryRules.filter((r) => r.level === "subCategory");
  const topRules = [...igRules, ...scRules]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Heatmaps side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <HeatmapTable
          title="Item Group Co-Purchase (Lift)"
          cells={itemGroupMatrix}
          maxLabels={12}
        />
        <HeatmapTable
          title="Sub-Category Co-Purchase (Lift, Top 15)"
          cells={subCategoryMatrix}
          maxLabels={15}
        />
      </div>

      {/* Top cross-category rules */}
      {topRules.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-primary mb-3">
            Top Cross-Category Rules
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {topRules.map((rule, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-edge bg-white hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary">
                    Customers who buy{" "}
                    <strong className="text-accent">{rule.antecedent}</strong>
                    {" "}also buy{" "}
                    <strong className="text-accent">{rule.consequent}</strong>
                  </p>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    {(rule.confidence * 100).toFixed(0)}% of the time
                    {" \u00B7 "}Lift: {rule.lift.toFixed(2)}
                  </p>
                </div>
                <ArrowRight size={14} className="text-muted shrink-0" />
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded",
                    rule.level === "itemGroup"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-purple-50 text-purple-600"
                  )}
                >
                  {rule.level === "itemGroup" ? "Group" : "Sub-cat"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {itemGroupMatrix.length === 0 && subCategoryMatrix.length === 0 && (
        <div className="flex items-center justify-center text-muted text-xs py-12">
          No category data available. Run analysis with 3 files to see insights.
        </div>
      )}
    </div>
  );
}
