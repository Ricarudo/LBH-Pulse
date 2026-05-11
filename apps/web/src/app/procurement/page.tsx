import { OperationsWorkspace } from "@/components/OperationsWorkspace";
import { PulseShell } from "@/components/PulseShell";
import { procurementRows } from "@/lib/starterData";

export default function ProcurementPage() {
  return (
    <PulseShell
      activePage="procurement"
      title="Procurement"
      subtitle="Purchase orders, vendor coordination, and material readiness."
    >
      <OperationsWorkspace
        title="Procurement"
        primaryAction="New PO"
        secondaryAction="Send First PO"
        rows={procurementRows}
        newRow={{
          id: "PO",
          title: "New vendor order",
          customer: "Project pending",
          detail: "Materials to be assigned",
          owner: "Maria S.",
          status: "Draft",
          due: "2026-06-03",
          value: "$0"
        }}
        nextStatus="Sent"
        valueLabel="PO Value"
      />
    </PulseShell>
  );
}

