import { PulseShell } from "@/components/PulseShell";
import { ClientProfileWorkspace } from "@/modules/clients/ClientProfileWorkspace";

type ClientProfilePageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function ClientProfilePage({ params }: ClientProfilePageProps) {
  const { clientId } = await params;

  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Client account, contacts, sites, work history, and preferences."
      compactHeader
    >
      <ClientProfileWorkspace clientId={clientId} />
    </PulseShell>
  );
}
