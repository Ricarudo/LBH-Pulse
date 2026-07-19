import { clientImporter } from "@/lib/importers/clientImporter";
import { legacyQuoteImporter } from "@/lib/importers/legacyQuoteImporter";
import type { BulkImporter } from "@/lib/importers/types";

const importers = new Map<string, BulkImporter>(
  [clientImporter, legacyQuoteImporter].map((importer) => [importer.key, importer])
);

export function importerFor(key: string) {
  const importer = importers.get(key);
  if (!importer) throw new Error("BULK_IMPORTER_NOT_FOUND");
  return importer;
}
