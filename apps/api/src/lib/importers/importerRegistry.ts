import { clientImporter } from "@/lib/importers/clientImporter";
import { legacyQuoteImporter } from "@/lib/importers/legacyQuoteImporter";
import { itemImporter } from "@/lib/importers/itemImporter";
import type { BulkImporter } from "@/lib/importers/types";

const importers = new Map<string, BulkImporter>(
  [clientImporter, itemImporter, legacyQuoteImporter].map((importer) => [importer.key, importer])
);

export function importerFor(key: string) {
  const importer = importers.get(key);
  if (!importer) throw new Error("BULK_IMPORTER_NOT_FOUND");
  return importer;
}
