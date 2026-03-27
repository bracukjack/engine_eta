"use client";

export function ProgressBar({
  step,
  pct,
  message,
}: {
  step: string;
  pct: number;
  message: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted font-mono">{step}</span>
        <span className="text-accent font-mono font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300 animate-progress"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted">{message}</p>
    </div>
  );
}
