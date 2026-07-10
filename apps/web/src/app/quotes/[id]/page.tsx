import { PulseShell } from "@/components/PulseShell";
import { QuoteWorkspace } from "@/modules/quotes/QuoteWorkspace";

type QuotePageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuotePage({ params }: QuotePageProps) {
  const { id } = await params;
  return (
    <PulseShell
      activePage="quotes"
      title="Quote Workspace"
      subtitle="Build the BOM and prepare proposal context."
      compactHeader
    >
      <QuoteWorkspace quoteId={id} />
    </PulseShell>
  );
}
