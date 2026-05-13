import { PulseShell } from "@/components/PulseShell";
import { RequestRouteWorkspace } from "@/modules/requests/RequestRouteWorkspace";

type RequestPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function RequestPage({ params }: RequestPageProps) {
  const { id } = await params;

  return (
    <PulseShell
      activePage="requests"
      title="Request"
      subtitle="Review intake details."
      compactHeader
    >
      <RequestRouteWorkspace mode="view" requestId={id} />
    </PulseShell>
  );
}
