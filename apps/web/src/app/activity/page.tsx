import { GlobalActivityWorkspace } from "@/components/GlobalActivityWorkspace";
import { PulseShell } from "@/components/PulseShell";

export default function ActivityPage() {
  return (
    <PulseShell
      activePage="activity"
      title="Activity"
      subtitle="Recent activity across Requests, Directory records, Opportunities, and Quotes."
    >
      <GlobalActivityWorkspace />
    </PulseShell>
  );
}
