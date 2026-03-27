"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { FILE_SLOTS_CONFIG, type FileKey } from "@/lib/types";
import { Upload, CheckCircle2, X } from "lucide-react";

function FileSlot({ fileKey, label, hint }: { fileKey: FileKey; label: string; hint: string }) {
  const slot = useAppStore((s) => s.files[fileKey]);
  const setFile = useAppStore((s) => s.setFile);
  const removeFile = useAppStore((s) => s.removeFile);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) setFile(fileKey, accepted[0]);
    },
    [fileKey, setFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv", ".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
  });

  const isReady = slot.status === "ready";

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border rounded-md p-3 cursor-pointer transition-all duration-200 group",
        isDragActive && "border-accent bg-blue-50 scale-[1.02]",
        isReady
          ? "border-emerald-300 bg-emerald-50"
          : "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} />

      <div className="flex items-center gap-2.5">
        {isReady ? (
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        ) : (
          <Upload
            size={14}
            className={cn(
              "shrink-0 transition-colors",
              isDragActive ? "text-accent" : "text-muted"
            )}
          />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-primary truncate">{label}</p>
          {isReady ? (
            <p className="text-[11px] text-emerald-600 font-mono truncate">
              {slot.file?.name}
            </p>
          ) : (
            <p className="text-[11px] text-muted font-mono">{hint}</p>
          )}
        </div>

        {isReady && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeFile(fileKey);
            }}
            className="p-0.5 rounded text-muted hover:text-red-500 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function FileDropzone() {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider px-1">
        Input Files
      </h3>
      {FILE_SLOTS_CONFIG.map((cfg) => (
        <FileSlot key={cfg.key} fileKey={cfg.key} label={cfg.label} hint={cfg.hint} />
      ))}
    </div>
  );
}
