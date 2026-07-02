import { PulseShell } from "@/components/PulseShell";
import { WorkRecordsWorkspace } from "@/components/WorkRecordsWorkspace";

export default function QuotesPage() {
  return (
    <PulseShell
      activePage="quotes"
      title="Quotes"
      subtitle="Quotes include the client-ready proposal output as a subcategory."
    >
      <WorkRecordsWorkspace kind="quotes" title="Quotes" valueLabel="Quote Total" />
    </PulseShell>
  );
}
