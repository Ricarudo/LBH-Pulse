import { OperationsWorkspace } from "@/components/OperationsWorkspace";
import { PulseShell } from "@/components/PulseShell";
import { fieldRows } from "@/lib/starterData";

export default function FieldOpsPage() {
  return (
    <PulseShell
      activePage="field"
      title="Field Ops"
      subtitle="Field jobs, technician activity, labor tracking, and site status."
    >
      <OperationsWorkspace
        title="Field Ops"
        primaryAction="New Field Job"
        secondaryAction="Dispatch First"
        rows={fieldRows}
        newRow={{
          id: "JOB",
          title: "New field assignment",
          customer: "New Customer",
          detail: "Technician assignment pending",
          owner: "Technician User",
          status: "Scheduled",
          due: "2026-06-04",
          value: "0 hrs"
        }}
        nextStatus="On Site"
        valueLabel="Labor"
      />
    </PulseShell>
  );
}

