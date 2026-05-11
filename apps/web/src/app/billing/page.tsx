import { OperationsWorkspace } from "@/components/OperationsWorkspace";
import { PulseShell } from "@/components/PulseShell";
import { billingRows } from "@/lib/starterData";

export default function BillingPage() {
  return (
    <PulseShell
      activePage="billing"
      title="Billing"
      subtitle="Invoices, collections follow-up, and project billing readiness."
    >
      <OperationsWorkspace
        title="Billing"
        primaryAction="New Invoice"
        secondaryAction="Mark First Sent"
        rows={billingRows}
        newRow={{
          id: "INV",
          title: "New project invoice",
          customer: "New Customer",
          detail: "Draft invoice",
          owner: "Sarah M.",
          status: "Review",
          due: "2026-06-06",
          value: "$0"
        }}
        nextStatus="Sent"
        valueLabel="Amount"
      />
    </PulseShell>
  );
}

