import { HubDashboard } from "@/components/HubDashboard";
import { PulseShell } from "@/components/PulseShell";

export default function HubPage() {
  return (
    <PulseShell
      activePage="hub"
      hideHeader
    >
      <HubDashboard />
    </PulseShell>
  );
}
