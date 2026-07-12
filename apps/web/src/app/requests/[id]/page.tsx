import { PulseShell } from "@/components/PulseShell";
import { RequestRecordWorkspace } from "@/modules/requests/RequestRecordWorkspace";

type RequestPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
    tab?: string;
    update?: string;
  }>;
};

function safeReturnTo(value?: string) {
  return value?.startsWith("/requests") && !value.startsWith("//")
    ? value
    : "/requests";
}

export default async function RequestPage({
  params,
  searchParams
}: RequestPageProps) {
  const { id } = await params;
  const query = await searchParams;

  return (
    <PulseShell
      activePage="requests"
      title="Request"
      subtitle="Review intake details."
      compactHeader
    >
      <RequestRecordWorkspace
        requestId={id}
        returnTo={safeReturnTo(query?.returnTo)}
        initialTab={query?.tab === "updates" ? "updates" : "checklist"}
        focusUpdateId={query?.update}
      />
    </PulseShell>
  );
}
