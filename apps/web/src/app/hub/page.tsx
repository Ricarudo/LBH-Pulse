import { HubDashboard } from "@/components/HubDashboard";
import { PulseShell } from "@/components/PulseShell";

export default function HubPage() {
  return (
    <PulseShell
      activePage="hub"
      title="Operations Hub"
      subtitle="R2's connected view across CRM, quotes, projects, procurement, field work, and billing."
    >
      <HubDashboard />
    </PulseShell>
  );
}
