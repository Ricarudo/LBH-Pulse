import { RequestsModule } from "@/modules/requests/RequestsModule";
import { PulseShell } from "@/components/PulseShell";

export default function RequestsPage() {
  return (
    <PulseShell
      activePage="requests"
      title="Requests"
      subtitle="Incoming calls, emails, RFPs, site visits, and quote requests."
    >
      <RequestsModule />
    </PulseShell>
  );
}
