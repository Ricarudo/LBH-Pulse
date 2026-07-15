import { PulseShell } from "@/components/PulseShell";
import { WorkRecordWorkspace } from "@/components/WorkRecordWorkspace";

type InvoicePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function InvoicePage({ params, searchParams }: InvoicePageProps) {
  const { id } = await params;
  const query = await searchParams;
  const initialTab = query?.tab === "files" || query?.tab === "updates"
    ? query.tab
    : "overview";

  return (
    <PulseShell
      activePage="billing"
      title="Billing Workspace"
      subtitle="Invoice context, files, and lifecycle updates."
      compactHeader
    >
      <WorkRecordWorkspace stage="invoice" recordId={id} initialTab={initialTab} />
    </PulseShell>
  );
}
