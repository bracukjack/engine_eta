"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { Upload, CheckCircle2, X, FileText, AlertCircle, Loader2 } from "lucide-react";
import type { FileSlot } from "@/lib/association-rules/types";

interface SingleZoneProps {
  label: string;
  hint: string;
  slot: FileSlot;
  onFile: (f: File) => void;
  onRemove: () => void;
}

function SingleZone({ label, hint, slot, onFile, onRemove }: SingleZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFile(accepted[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "application/vnd.ms-excel": [".csv"],
    },
    multiple: false,
  });

  const isParsed = slot.status === "parsed";
  const isError = slot.status === "error";
  const isParsing = slot.status === "parsing";
  const hasFile = slot.file !== null;

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border-2 border-dashed rounded-lg p-3 cursor-pointer transition-all duration-200 min-w-0",
        isDragActive && "border-accent bg-blue-50 scale-[1.01]",
        isParsed
          ? "border-emerald-300 bg-emerald-50/60"
          : isError
            ? "border-red-300 bg-red-50/60"
            : isParsing
              ? "border-amber-300 bg-amber-50/60"
              : hasFile
                ? "border-amber-300 bg-amber-50/60"
                : "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-2.5">
        {isParsed ? (
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
        ) : isError ? (
          <AlertCircle size={18} className="text-red-500 shrink-0" />
        ) : isParsing ? (
          <Loader2 size={18} className="text-amber-600 shrink-0 animate-spin" />
        ) : hasFile ? (
          <FileText size={18} className="text-amber-600 shrink-0" />
        ) : (
          <Upload
            size={18}
            className={cn(
              "shrink-0 transition-colors",
              isDragActive ? "text-accent" : "text-muted"
            )}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary truncate">
            {label}
          </p>
          {slot.file ? (
            <p className="text-[10px] text-muted font-mono truncate">
              {slot.file.name}
              {isParsed && (
                <span className="text-emerald-600 ml-1">
                  ({slot.rowCount.toLocaleString()} rows)
                </span>
              )}
            </p>
          ) : (
            <p className="text-[10px] text-muted font-mono truncate">{hint}</p>
          )}
          {isError && (
            <p className="text-[10px] text-red-500 truncate">{slot.error}</p>
          )}
        </div>
        {hasFile && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 rounded text-muted hover:text-red-500 transition-colors shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  salesSlot: FileSlot;
  productSlot: FileSlot;
  stockSlot: FileSlot;
  onSalesFile: (f: File) => void;
  onProductFile: (f: File) => void;
  onStockFile: (f: File) => void;
  onRemoveSales: () => void;
  onRemoveProduct: () => void;
  onRemoveStock: () => void;
}

export function FileUploadZone({
  salesSlot,
  productSlot,
  stockSlot,
  onSalesFile,
  onProductFile,
  onStockFile,
  onRemoveSales,
  onRemoveProduct,
  onRemoveStock,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <SingleZone
        label="Sales Orders"
        hint="SlsSalesOrdersSearch"
        slot={salesSlot}
        onFile={onSalesFile}
        onRemove={onRemoveSales}
      />
      <SingleZone
        label="Product Data"
        hint="LogItemSearch"
        slot={productSlot}
        onFile={onProductFile}
        onRemove={onRemoveProduct}
      />
      <SingleZone
        label="Stock Position"
        hint="InvStockPositionSearch"
        slot={stockSlot}
        onFile={onStockFile}
        onRemove={onRemoveStock}
      />
    </div>
  );
}
