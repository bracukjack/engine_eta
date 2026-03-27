"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { Upload, CheckCircle2, X, FileText } from "lucide-react";

interface Props {
  file: File | null;
  onFile: (f: File) => void;
  onRemove: () => void;
  status: "empty" | "ready" | "processing" | "done";
}

export function FileUploadZone({ file, onFile, onRemove, status }: Props) {
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

  const isReady = status !== "empty";

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200",
        isDragActive && "border-accent bg-blue-50 scale-[1.01]",
        status === "done"
          ? "border-emerald-300 bg-emerald-50"
          : isReady
            ? "border-amber-300 bg-amber-50"
            : "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-3">
        {status === "done" ? (
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
        ) : isReady ? (
          <FileText size={20} className="text-amber-600 shrink-0" />
        ) : (
          <Upload
            size={20}
            className={cn(
              "shrink-0 transition-colors",
              isDragActive ? "text-accent" : "text-muted"
            )}
          />
        )}
        <div className="flex-1 min-w-0">
          {file ? (
            <>
              <p className="text-xs font-medium text-primary truncate">
                {file.name}
              </p>
              <p className="text-[11px] text-muted font-mono">
                {formatSize(file.size)}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-primary">
                Drop sales orders CSV
              </p>
              <p className="text-[11px] text-muted font-mono">
                SlsSalesOrdersSearch.csv (UTF-16)
              </p>
            </>
          )}
        </div>
        {isReady && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 rounded text-muted hover:text-red-500 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
