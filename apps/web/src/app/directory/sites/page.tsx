import { PulseShell } from "@/components/PulseShell";
import { SitesModule } from "@/modules/clients/SitesModule";

export default function DirectorySitesPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Customer offices, facilities, campuses, and job locations."
      compactHeader
    >
      <SitesModule />
    </PulseShell>
  );
}
