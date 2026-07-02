import { RequestsQueueModule } from "@/modules/requests/RequestsQueueModule";
import { PulseShell } from "@/components/PulseShell";

type RequestsPageProps = {
  searchParams?: Promise<{
    new?: string;
  }>;
};

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const params = await searchParams;

  return (
    <PulseShell
      activePage="requests"
      title="Requests"
      subtitle="Incoming calls, emails, RFPs, site visits, and quote requests."
      compactHeader
    >
      {/* Keep the guided intake flow above the queue instead of replacing it. */}
      <RequestsQueueModule openNewOnLoad={params?.new === "1"} />
    </PulseShell>
  );
}
