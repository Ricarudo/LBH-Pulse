import { OperationsWorkspace } from "@/components/OperationsWorkspace";
import { PulseShell } from "@/components/PulseShell";
import { quotes, type WorkspaceRow } from "@/lib/starterData";

const quoteRows: WorkspaceRow[] = quotes.map((quote) => ({
  id: quote.id,
  title: quote.title,
  customer: quote.customer,
  detail: "Proposal output managed inside quote",
  owner: "Alex M.",
  status: quote.status,
  due: quote.validUntil,
  value: quote.total
}));

export default function QuotesPage() {
  return (
    <PulseShell
      activePage="quotes"
      title="Quotes"
      subtitle="Quotes include the client-ready proposal output as a subcategory."
    >
      <OperationsWorkspace
        title="Quotes"
        primaryAction="New Quote"
        secondaryAction="Send First To Approval"
        rows={quoteRows}
        newRow={{
          id: "QM",
          title: "New unified material + labor quote",
          customer: "New Customer",
          detail: "Proposal output not generated",
          owner: "Sales User",
          status: "Draft",
          due: "2026-06-15",
          value: "$0.00"
        }}
        nextStatus="Waiting Approval"
        valueLabel="Quote Total"
      />
    </PulseShell>
  );
}

