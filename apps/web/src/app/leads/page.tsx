import { LeadsModule } from "@/modules/leads/LeadsModule";
import { PulseShell } from "@/components/PulseShell";

export default function LeadsPage() {
  return (
    <PulseShell
      activePage="leads"
      title="CRM"
      subtitle="Leads and customer-facing opportunities."
    >
      <LeadsModule />
    </PulseShell>
  );
}
