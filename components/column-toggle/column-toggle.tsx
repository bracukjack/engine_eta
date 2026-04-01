"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { OUTPUT_COLUMNS, type OutputRow } from "@/lib/types";
import { Columns3, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ColumnToggle() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const visibleColumns = useAppStore((s) => s.visibleColumns);
  const toggleColumn = useAppStore((s) => s.toggleColumn);
  const showAllColumns = useAppStore((s) => s.showAllColumns);
  const hideAllColumns = useAppStore((s) => s.hideAllColumns);

  const hiddenCount = OUTPUT_COLUMNS.length - visibleColumns.length;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative">
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
      >
        <Columns3 size={12} className="mr-1.5" />
        Columns
        {hiddenCount > 0 && (
          <span className="ml-1.5 bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
            {hiddenCount} hidden
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1"
        >
          {/* Select All / Clear All */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button
              onClick={showAllColumns}
              className="text-[11px] text-accent hover:underline cursor-pointer"
            >
              Select All
            </button>
            <span className="text-muted text-[11px]">·</span>
            <button
              onClick={hideAllColumns}
              className="text-[11px] text-accent hover:underline cursor-pointer"
            >
              Clear All
            </button>
          </div>

          {/* Column list */}
          <div className="max-h-72 overflow-y-auto py-1">
            {OUTPUT_COLUMNS.map((col) => {
              const checked = visibleColumns.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span
                    className={`flex items-center justify-center w-4 h-4 rounded border ${
                      checked
                        ? "bg-accent border-accent text-white"
                        : "border-edge bg-white"
                    }`}
                  >
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="ml-auto text-[10px] text-muted/60 truncate max-w-[100px]">{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
