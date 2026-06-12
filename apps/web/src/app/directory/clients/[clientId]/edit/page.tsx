import { PulseShell } from "@/components/PulseShell";
import { ClientEditWorkspace } from "@/modules/clients/ClientEditWorkspace";

type DirectoryClientEditPageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function DirectoryClientEditPage({
  params
}: DirectoryClientEditPageProps) {
  const { clientId } = await params;

  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Edit client identity, contacts, sites, billing details, and preferences."
      compactHeader
    >
      <ClientEditWorkspace clientId={clientId} />
    </PulseShell>
  );
}
