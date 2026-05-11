import { PulseShell } from "@/components/PulseShell";
import { ClientCreateForm } from "@/components/clients/ClientCreateForm";

export default function NewClientPage() {
  return (
    <PulseShell
      activePage="clients"
      title="CRM"
      subtitle="Create a client account with sites, contacts, and preferences."
    >
      <ClientCreateForm />
    </PulseShell>
  );
}

