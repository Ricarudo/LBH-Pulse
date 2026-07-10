import type {
  QuoteContextSnapshot,
  QuoteDetailRecord,
  QuoteRecord
} from "@pulse/contracts/work";

type QuoteDetailPayload = QuoteRecord &
  Partial<Pick<QuoteDetailRecord, "context" | "proposalNotes" | "proposalPreparedAt" | "items">>;

function fallbackContext(quote: QuoteRecord): QuoteContextSnapshot {
  return {
    sourceRequestId: quote.requestId,
    requestNumber: quote.requestNumber,
    requestTitle: quote.title,
    requestType: "",
    serviceCategory: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    siteName: "",
    siteAddress: "",
    city: "",
    state: "",
    scopeDescription: "",
    internalNotes: ""
  };
}

export function normalizeQuoteDetailRecord(
  quote: QuoteDetailPayload
): QuoteDetailRecord {
  return {
    ...quote,
    context: {
      ...fallbackContext(quote),
      ...(quote.context ?? {})
    },
    proposalNotes: quote.proposalNotes ?? "",
    proposalPreparedAt: quote.proposalPreparedAt ?? "",
    items: quote.items ?? []
  };
}
