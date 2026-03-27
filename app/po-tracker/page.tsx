import { Truck } from "lucide-react";

export default function PoTrackerPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Truck size={40} className="mx-auto text-muted/40" />
        <h2 className="text-lg font-semibold text-primary">PO Tracker</h2>
        <p className="text-sm text-muted font-mono">Coming soon</p>
      </div>
    </div>
  );
}
