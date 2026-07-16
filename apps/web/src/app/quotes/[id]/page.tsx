import { PulseShell } from "@/components/PulseShell";
import { QuoteWorkspace } from "@/modules/quotes/QuoteWorkspace";

type QuotePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function QuotePage({ params, searchParams }: QuotePageProps) {
  const { id } = await params;
  const query = await searchParams;
  const initialTab = query?.tab === "details" || query?.tab === "files" || query?.tab === "updates"
    ? query.tab
    : "work";
  return (
    <PulseShell
      activePage="quotes"
      title="Quote Workspace"
      subtitle="Build the BOM and prepare proposal context."
      compactHeader
    >
      <QuoteWorkspace quoteId={id} initialTab={initialTab} />
    </PulseShell>
  );
}
