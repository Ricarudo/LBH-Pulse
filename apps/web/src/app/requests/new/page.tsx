import { PulseShell } from "@/components/PulseShell";
import { RequestRouteWorkspace } from "@/modules/requests/RequestRouteWorkspace";

export default function NewRequestPage() {
  return (
    <PulseShell
      activePage="requests"
      title="New Request"
      subtitle="Capture a new intake record."
      compactHeader
    >
      <RequestRouteWorkspace mode="new" />
    </PulseShell>
  );
}
