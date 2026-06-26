import { RequestsModule } from "@/modules/requests/RequestsModule";
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
      {/* The new request flow lives in the queue so its full-screen modal can sit
          above the list/detail layout instead of replacing the page. */}
      <RequestsModule openNewOnLoad={params?.new === "1"} />
    </PulseShell>
  );
}
