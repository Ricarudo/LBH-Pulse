import { PulseShell } from "@/components/PulseShell";
import { AnalyticsWorkspace } from "@/components/AnalyticsWorkspace";

export default function StatisticsPage() {
  return (
    <PulseShell
      activePage="statistics"
      title="Analytics"
      subtitle="Company performance, from first request to final invoice."
      hideHeader
    >
      <AnalyticsWorkspace />
    </PulseShell>
  );
}
