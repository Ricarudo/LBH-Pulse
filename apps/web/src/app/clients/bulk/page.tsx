import { PulseShell } from "@/components/PulseShell";
import { ClientBulkWorkspace } from "@/modules/clients/ClientBulkWorkspace";

export default function ClientBulkPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Review and apply client CSV imports."
    >
      <ClientBulkWorkspace />
    </PulseShell>
  );
}
