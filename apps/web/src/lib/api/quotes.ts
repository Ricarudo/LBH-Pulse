import type {
  AddAdHocQuoteItemInput,
  AddQuoteItemInput,
  AddQuoteKitInput,
  ReorderQuoteItemsInput,
  UpdateQuoteItemInput,
  UpdateQuoteProposalInput
} from "@pulse/contracts/items";
import type {
  ConvertQuoteInput,
  ProjectResponse,
  QuoteDetailRecord,
  QuoteRecord,
  QuoteResponse,
  UpdateQuoteInput
} from "@pulse/contracts/work";
import { apiRequest, type ApiRequestOptions } from "@/lib/api/client";

type ReadOptions = Pick<ApiRequestOptions, "cache" | "signal">;
type QuotePayloadResponse = { quote: QuoteDetailRecord | QuoteRecord };
type ConvertQuotePayload = Partial<ConvertQuoteInput>;

export type AdHocQuoteItemPayload =
  Pick<AddAdHocQuoteItemInput, "name"> &
  Partial<Omit<AddAdHocQuoteItemInput, "name">>;

function quotePath(quoteId: string, suffix = "") {
  return `/api/quotes/${encodeURIComponent(quoteId)}${suffix}`;
}

function hasQuoteItems(quote: QuoteDetailRecord | QuoteRecord): quote is QuoteDetailRecord {
  return "items" in quote && Array.isArray(quote.items);
}

export function fetchQuote(quoteId: string, options: ReadOptions = {}) {
  return apiRequest<QuoteResponse>(quotePath(quoteId), {
    ...options,
    method: "GET"
  });
}

export async function updateQuote(quoteId: string, input: UpdateQuoteInput) {
  const response = await apiRequest<QuotePayloadResponse>(quotePath(quoteId), {
    method: "PATCH",
    json: input
  });

  if (hasQuoteItems(response.quote)) {
    return { quote: response.quote };
  }

  return fetchQuote(quoteId, { cache: "no-store" });
}

export function updateQuoteItem(
  quoteId: string,
  quoteItemId: string,
  input: UpdateQuoteItemInput
) {
  return apiRequest<QuoteResponse>(
    quotePath(
      quoteId,
      `/items/${encodeURIComponent(quoteItemId)}`
    ),
    { method: "PATCH", json: input }
  );
}

export function removeQuoteItem(quoteId: string, quoteItemId: string) {
  return apiRequest<QuoteResponse>(
    quotePath(
      quoteId,
      `/items/${encodeURIComponent(quoteItemId)}`
    ),
    { method: "DELETE" }
  );
}

export function addCatalogQuoteItem(quoteId: string, input: AddQuoteItemInput) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/items"), {
    method: "POST",
    json: input
  });
}

export function addQuoteKit(quoteId: string, input: AddQuoteKitInput) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/items/kit"), {
    method: "POST",
    json: input
  });
}

export function addAdHocQuoteItem(
  quoteId: string,
  input: AdHocQuoteItemPayload
) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/items"), {
    method: "POST",
    json: { mode: "adHoc", ...input }
  });
}

export function reorderQuoteItems(
  quoteId: string,
  input: ReorderQuoteItemsInput
) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/items/reorder"), {
    method: "PATCH",
    json: input
  });
}

export function updateQuoteProposal(
  quoteId: string,
  input: UpdateQuoteProposalInput
) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/proposal"), {
    method: "PATCH",
    json: input
  });
}

export function convertQuoteToProject(
  quoteId: string,
  input: ConvertQuotePayload = {}
) {
  return apiRequest<ProjectResponse>(quotePath(quoteId, "/convert"), {
    method: "POST",
    json: input
  });
}
