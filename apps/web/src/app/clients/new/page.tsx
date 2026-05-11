import { PulseShell } from "@/components/PulseShell";
import { ClientCreateForm } from "@/components/clients/ClientCreateForm";

export default function NewClientPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Create a client account with sites, contacts, and preferences."
    >
      <ClientCreateForm />
    </PulseShell>
  );
}

