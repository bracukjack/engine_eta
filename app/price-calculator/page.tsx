import { Calculator } from "lucide-react";

export default function PriceCalculatorPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Calculator size={40} className="mx-auto text-muted/40" />
        <h2 className="text-lg font-semibold text-primary">Price Calculator</h2>
        <p className="text-sm text-muted font-mono">Coming soon</p>
      </div>
    </div>
  );
}
