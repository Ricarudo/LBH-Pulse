import type {
  QuoteContextSnapshot,
  QuoteDetailRecord,
  QuoteRecord
} from "@pulse/contracts/work";

type QuoteDetailPayload = QuoteRecord & Partial<Omit<QuoteDetailRecord, keyof QuoteRecord>>;

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
    trades: quote.trades ?? categoriesFromContext(quote.context?.serviceCategory),
    context: {
      ...fallbackContext(quote),
      ...(quote.context ?? {})
    },
    proposalNotes: quote.proposalNotes ?? "",
    proposalPreparedAt: quote.proposalPreparedAt ?? "",
    items: quote.items ?? [],
    currentStep: quote.currentStep ?? null,
    unreadMentionCount: quote.unreadMentionCount ?? 0,
    updates: quote.updates ?? []
  };
}

function categoriesFromContext(value?: string) {
  return (value ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
}
