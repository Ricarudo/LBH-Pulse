import { PulseShell } from "@/components/PulseShell";
import { ItemsModule } from "@/modules/items/ItemsModule";

export default function DirectoryItemsPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Reusable items for quote BOMs."
      compactHeader
    >
      <ItemsModule />
    </PulseShell>
  );
}
