import type { LifecycleDocumentRecord } from "@pulse/contracts/documents";

export function filterLifecycleDocuments(
  documents: LifecycleDocumentRecord[],
  rawQuery: string
) {
  const terms = rawQuery
    .trim()
    .toLocaleLowerCase("en-US")
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return documents;

  return documents.filter((document) => {
    const searchText = [
      document.originalFileName,
      document.category,
      ...document.tags,
      document.sourceNumber,
      document.uploadedByName
    ].join(" ").toLocaleLowerCase("en-US");
    return terms.every((term) => searchText.includes(term));
  });
}
