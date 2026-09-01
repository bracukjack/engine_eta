"use client";

/**
 * VirtualDataTable — reusable, virtualized data table.
 *
 * Built on TanStack Table (column model) + TanStack Virtual (row virtualization)
 * using a real <table> with `display:grid`. The header is sticky and shares one
 * scroll container with the body, so columns line up precisely and the header
 * follows horizontal scrolling automatically — no manual scroll syncing.
 *
 * It owns only the hard parts (virtualization, sticky header, precise horizontal
 * scroll, fixed column widths, sort indicators, optional sticky row-number
 * column, copy-on-double-click). Sorting/filtering/paging stay with the caller,
 * which passes already-prepared `data` and the sort state.
 */

import { useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { showCopiedToast } from "@/components/ui/data-tooltip";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

/** Per-column extras, read from `ColumnDef.meta`. */
export interface VDTColumnMeta {
  /** Extra classes on the header cell (e.g. highlight). */
  headerClassName?: string;
  /** Extra classes on every body cell of this column. */
  cellClassName?: string;
  /** Set false to disable sorting for this column (default: sortable). */
  sortable?: boolean;
  /** `title` attribute for the header cell (hover tooltip). Defaults to the label. */
  headerTitle?: string;
}

export interface VirtualDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];

  /** Fixed row height in px. */
  rowHeight: number;
  /** Body cell font-size, e.g. "13px". */
  fontSize?: string;
  /** Body cell padding, e.g. "8px 12px". */
  cellPadding?: string;
  /** Header row height (default 36). */
  headerHeight?: number;
  /** Header cell padding, e.g. "0 12px" (default "0 8px"). */
  headerPadding?: string;
  overscan?: number;

  /** Draw vertical borders between columns (default false). */
  bordered?: boolean;

  /**
   * Make the table fill its container instead of stopping at the sum of the
   * column sizes: the named column absorbs the leftover width (its `size`
   * becomes a minimum, its `maxSize` — if set — a cap), and the table still
   * scrolls horizontally when the container is narrower than that sum. Omit for
   * fixed-width columns.
   */
  stretchColumnId?: string;

  /** Controlled sorting (caller owns the cycle). `columnId` is the column's id. */
  sortColumnId?: string | null;
  sortDir?: "asc" | "desc";
  onSort?: (columnId: string) => void;

  /** Per-row className — alternating bg, status colours, etc. */
  getRowClassName?: (row: T, index: number) => string | undefined;

  /** Sticky leading "#" column showing the 1-based row number. */
  rowNumber?: boolean;
  rowNumberWidth?: number;

  /** Copy a cell's text on double-click (reads the nearest [data-tip]). */
  enableCopy?: boolean;
  /** data-tip value per cell — return the string to copy, or undefined. */
  getCellTip?: (row: T, columnId: string) => string | undefined;

  /** Enable a pagination footer (page-size select + prev/next). */
  pagination?: boolean;
  /** Initial page size when pagination is enabled (default 50). */
  pageSize?: number;
  /** Page-size choices in the footer (default [50, 100, 200, 500]). */
  pageSizeOptions?: number[];
  /** Offer an "All" page-size option (default true). */
  allowAllPageSize?: boolean;
  /** Extra content rendered at the left of the pagination footer. */
  footerLeft?: React.ReactNode;

  /** Shown below the header when there are no rows. */
  empty?: React.ReactNode;
  /** className for the outer wrapper. */
  className?: string;
  /**
   * Cap the scroll area height (e.g. 500 or "60vh"). Use this when the table
   * lives in a content-driven container (not a height-bounded flex layout).
   * When omitted, the table fills its parent (flex-1).
   */
  maxHeight?: number | string;
}

export function VirtualDataTable<T>({
  data,
  columns,
  rowHeight,
  fontSize,
  cellPadding,
  headerHeight = 36,
  headerPadding = "0 8px",
  overscan = 10,
  bordered = false,
  stretchColumnId,
  sortColumnId = null,
  sortDir = "asc",
  onSort,
  getRowClassName,
  rowNumber = false,
  rowNumberWidth = 44,
  enableCopy = false,
  getCellTip,
  pagination = false,
  pageSize = 50,
  pageSizeOptions = [50, 100, 200, 500],
  allowAllPageSize = true,
  footerLeft,
  empty,
  className,
  maxHeight,
}: VirtualDataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fillHeight = maxHeight === undefined;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(pagination
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageIndex: 0, pageSize } },
        }
      : {}),
  });

  // `rows` is the current page slice when pagination is on, otherwise all rows.
  const { rows } = table.getRowModel();

  const pageState = table.getState().pagination;
  const rowOffset = pagination ? pageState.pageIndex * pageState.pageSize : 0;
  const pageCount = table.getPageCount();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  // Re-measure when the row height changes (e.g. table size toggle).
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  // Scroll back to the top whenever the page changes.
  useEffect(() => {
    if (pagination) scrollRef.current?.scrollTo({ top: 0 });
  }, [pagination, pageState.pageIndex]);

  const leadWidth = rowNumber ? rowNumberWidth : 0;
  const totalWidth = leadWidth + table.getTotalSize();
  const virtualRows = rowVirtualizer.getVirtualItems();
  const border = bordered ? "border-r border-edge" : "";

  return (
    <div className={cn(fillHeight ? "flex-1 flex flex-col min-h-0" : "flex flex-col", className)}>
      {/* Single scroll container: sticky header + virtualized body share one
          scroll, so columns always line up and the header follows horizontally. */}
      <div
        ref={scrollRef}
        className={cn("overflow-auto", fillHeight && "flex-1 min-h-0")}
        style={maxHeight === undefined ? undefined : { maxHeight }}
        onDoubleClick={
          enableCopy
            ? (e) => {
                const el = (e.target as HTMLElement).closest("[data-tip]");
                if (!el) return;
                const text = (el.getAttribute("data-tip") ?? "").trim();
                if (!text) return;
                navigator.clipboard.writeText(text);
                showCopiedToast(e.clientX, e.clientY);
              }
            : undefined
        }
      >
        <table
          className="grid"
          style={
            stretchColumnId
              ? { width: "100%", minWidth: totalWidth }
              : { width: totalWidth }
          }
        >
          <thead className="grid sticky top-0 z-20 bg-surface border-b border-edge">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="flex w-full" style={{ height: headerHeight }}>
                {rowNumber && (
                  <th
                    className="shrink-0 sticky left-0 z-30 bg-slate-100 border-r border-edge flex items-center justify-center text-[10px] font-bold text-muted"
                    style={{ width: rowNumberWidth }}
                  >
                    #
                  </th>
                )}
                {hg.headers.map((header) => {
                  const id = header.column.id;
                  const meta = header.column.columnDef.meta as VDTColumnMeta | undefined;
                  const sortable = meta?.sortable !== false && !!onSort;
                  const isSorted = sortColumnId === id;
                  const label = header.column.columnDef.header;
                  return (
                    <th
                      key={header.id}
                      onClick={sortable ? () => onSort!(id) : undefined}
                      className={cn(
                        "shrink-0 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors truncate",
                        border,
                        sortable && "cursor-pointer",
                        isSorted ? "text-amber-600" : "text-muted hover:text-primary",
                        meta?.headerClassName
                      )}
                      style={{
                        width: header.getSize(),
                        padding: headerPadding,
                        ...(stretchColumnId === id
                          ? {
                              flexGrow: 1,
                              maxWidth: header.column.columnDef.maxSize,
                            }
                          : null),
                      }}
                      title={meta?.headerTitle ?? (typeof label === "string" ? label : id)}
                    >
                      <span className="truncate flex-1 text-left">
                        {flexRender(label, header.getContext())}
                      </span>
                      {meta?.sortable !== false &&
                        (isSorted ? (
                          sortDir === "asc" ? (
                            <ArrowUp size={10} className="text-amber-600 shrink-0" />
                          ) : (
                            <ArrowDown size={10} className="text-amber-600 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown size={10} className="opacity-20 shrink-0" />
                        ))}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="grid relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {virtualRows.map((vRow) => {
              const row = rows[vRow.index];
              const r = row.original;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "flex absolute w-full items-center border-b border-edge/50 hover:bg-surface-hover",
                    getRowClassName?.(r, vRow.index)
                  )}
                  style={{ height: rowHeight, transform: `translateY(${vRow.start}px)` }}
                >
                  {rowNumber && (
                    <td
                      className="shrink-0 sticky left-0 z-10 bg-inherit border-r border-edge flex items-center justify-center font-mono text-muted"
                      style={{ width: rowNumberWidth, fontSize, padding: cellPadding }}
                    >
                      {rowOffset + vRow.index + 1}
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const id = cell.column.id;
                    const meta = cell.column.columnDef.meta as VDTColumnMeta | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn("shrink-0 truncate text-left", border, meta?.cellClassName)}
                        style={{
                          width: cell.column.getSize(),
                          fontSize,
                          padding: cellPadding,
                          ...(stretchColumnId === id
                            ? {
                                flexGrow: 1,
                                maxWidth: cell.column.columnDef.maxSize,
                              }
                            : null),
                        }}
                        data-tip={getCellTip?.(r, id)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && empty != null && (
          <div className="grid place-items-center text-xs text-muted" style={{ minHeight: 160 }}>
            {empty}
          </div>
        )}
      </div>

      {pagination && (
        <div className="shrink-0 flex items-center justify-between gap-2 flex-wrap h-9 px-3 border-t border-edge bg-surface text-[11px] text-muted font-mono">
          <div className="flex items-center gap-2 min-w-0">
            {footerLeft}
            <span className="whitespace-nowrap">
              {data.length === 0 ? "0 rows" : `${rowOffset + 1}–${rowOffset + rows.length} of ${data.length}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-muted">Rows:</span>
              <select
                value={pageState.pageSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  table.setPageSize(v === -1 ? Math.max(data.length, 1) : v);
                }}
                className="bg-slate-50 border border-edge rounded px-1.5 py-0.5 text-[10px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                {allowAllPageSize && <option value={-1}>All</option>}
              </select>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                {pageWindow(pageState.pageIndex + 1, pageCount).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => table.setPageIndex(p - 1)}
                    className={cn(
                      "w-6 h-6 rounded transition-colors cursor-pointer tabular-nums",
                      p === pageState.pageIndex + 1
                        ? "bg-accent text-white"
                        : "text-muted hover:text-primary hover:bg-surface-hover"
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Windowed page numbers (max 7) for the pagination footer. */
function pageWindow(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 6, 7];
  if (current >= total - 3) return Array.from({ length: 7 }, (_, i) => total - 6 + i);
  return Array.from({ length: 7 }, (_, i) => current - 3 + i);
}
