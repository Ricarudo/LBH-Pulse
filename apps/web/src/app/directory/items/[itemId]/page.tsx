import { PulseShell } from "@/components/PulseShell";
import { ItemDetailWorkspace } from "@/modules/items/ItemDetailWorkspace";

type ItemDetailPageProps = {
  params: Promise<{
    itemId: string;
  }>;
};

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { itemId } = await params;

  return (
    <PulseShell
      activePage="directory"
      title="Items"
      subtitle="Catalog pricing and quote usage."
      compactHeader
    >
      <ItemDetailWorkspace itemId={itemId} />
    </PulseShell>
  );
}
