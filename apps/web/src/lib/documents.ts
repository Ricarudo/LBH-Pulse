import type { LifecycleDocumentRecord } from "@pulse/contracts/documents";
import { apiFetch } from "@/lib/api/client";

type PreviewProbeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status">>;

export class DocumentPreviewError extends Error {
  constructor(readonly status: number) {
    super(documentPreviewErrorMessage(status));
    this.name = "DocumentPreviewError";
  }
}

export function documentPreviewErrorMessage(status: number) {
  if (status === 401) return "Your session has expired. Sign in again, then retry the preview.";
  if (status === 403) return "You do not have permission to preview this document.";
  if (status === 404) return "This document is no longer available.";
  if (status === 409 || status === 422) return "This document is not ready to preview.";
  return "The document preview could not be loaded. Retry or download the file instead.";
}

export async function probeDocumentPreview(
  previewUrl: string,
  signal?: AbortSignal,
  request: PreviewProbeFetch = apiFetch
) {
  const response = await request(previewUrl, { method: "HEAD", signal });
  if (!response.ok) throw new DocumentPreviewError(response.status);
}

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
