import { FileBarChart } from "lucide-react";

export default function ReportBuilderPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <FileBarChart size={40} className="mx-auto text-muted/40" />
        <h2 className="text-lg font-semibold text-primary">Report Builder</h2>
        <p className="text-sm text-muted font-mono">Coming soon</p>
      </div>
    </div>
  );
}
