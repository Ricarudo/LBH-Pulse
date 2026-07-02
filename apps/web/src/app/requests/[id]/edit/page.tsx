import { PulseShell } from "@/components/PulseShell";
import { RequestEditWorkspace } from "@/modules/requests/RequestEditWorkspace";

type EditRequestPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

function safeReturnTo(value?: string) {
  return value?.startsWith("/requests") && !value.startsWith("//")
    ? value
    : "/requests";
}

export default async function EditRequestPage({
  params,
  searchParams
}: EditRequestPageProps) {
  const { id } = await params;
  const query = await searchParams;

  return (
    <PulseShell
      activePage="requests"
      title="Edit Request"
      subtitle="Update intake details."
      compactHeader
    >
      <RequestEditWorkspace
        requestId={id}
        returnTo={safeReturnTo(query?.returnTo)}
      />
    </PulseShell>
  );
}
