import { PulseShell } from "@/components/PulseShell";
import { ContactsModule } from "@/modules/clients/ContactsModule";

export default function ContactsPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="People connected to client accounts, sites, and relationships."
    >
      <ContactsModule />
    </PulseShell>
  );
}
