import { PulseShell } from "@/components/PulseShell";
import { WorkRecordsWorkspace } from "@/components/WorkRecordsWorkspace";

export default function BillingPage() {
  return (
    <PulseShell
      activePage="billing"
      title="Billing"
      subtitle="Invoices, collections follow-up, and project billing readiness."
    >
      <WorkRecordsWorkspace kind="invoices" title="Billing" valueLabel="Amount" />
    </PulseShell>
  );
}
