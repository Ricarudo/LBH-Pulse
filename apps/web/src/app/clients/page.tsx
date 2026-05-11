import { PulseShell } from "@/components/PulseShell";
import { ClientsModule } from "@/modules/clients/ClientsModule";

export default function ClientsPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Client accounts, contacts, sites, and relationship context."
    >
      <ClientsModule />
    </PulseShell>
  );
}
