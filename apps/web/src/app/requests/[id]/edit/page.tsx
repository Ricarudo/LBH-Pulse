import { PulseShell } from "@/components/PulseShell";
import { RequestRouteWorkspace } from "@/modules/requests/RequestRouteWorkspace";

type EditRequestPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditRequestPage({ params }: EditRequestPageProps) {
  const { id } = await params;

  return (
    <PulseShell
      activePage="requests"
      title="Edit Request"
      subtitle="Update intake details."
      compactHeader
    >
      <RequestRouteWorkspace mode="edit" requestId={id} />
    </PulseShell>
  );
}
