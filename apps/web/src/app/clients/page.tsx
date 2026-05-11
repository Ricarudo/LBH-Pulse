import { PulseShell } from "@/components/PulseShell";
import { ClientsModule } from "@/modules/clients/ClientsModule";

export default function ClientsPage() {
  return (
    <PulseShell
      activePage="clients"
      title="Clients"
      subtitle="CRM account lookup and relationship context."
    >
      <ClientsModule />
    </PulseShell>
  );
}
