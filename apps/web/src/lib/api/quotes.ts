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
  CreateQuoteRevisionInput,
  ProjectResponse,
  QuoteDetailRecord,
  QuoteRecord,
  QuoteRevisionResponse,
  QuoteResponse,
  ReplaceLegacyQuoteFinancialsInput,
  SwitchQuoteCalculationModeInput,
  UpdateQuoteInput
} from "@pulse/contracts/work";
import type {
  CreateRequestUpdateInput,
  RequestAssignee,
  RequestUpdate,
  RequestUpdateFilter
} from "@pulse/contracts/requests";
import { apiRequest, type ApiRequestOptions } from "@/lib/api/client";

type ReadOptions = Pick<ApiRequestOptions, "cache" | "signal">;
type QuotePayloadResponse = { quote: QuoteDetailRecord | QuoteRecord };
type ConvertQuotePayload = Partial<ConvertQuoteInput>;
export type QuoteUpdatesResponse = {
  updates: RequestUpdate[];
  currentStep: RequestUpdate | null;
  unreadMentionCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};

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

export function fetchQuoteRevision(
  quoteId: string,
  revision: number | string,
  options: ReadOptions = {}
) {
  return apiRequest<QuoteRevisionResponse>(
    quotePath(quoteId, `/revisions/${encodeURIComponent(String(revision))}`),
    { ...options, method: "GET" }
  );
}

export function createQuoteRevision(quoteId: string, input: CreateQuoteRevisionInput) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/revisions"), {
    method: "POST",
    json: input
  });
}

export function fetchQuoteUpdateTeamMembers(options: ReadOptions = {}) {
  return apiRequest<{ teamMembers: RequestAssignee[] }>("/api/quotes/team-members", {
    ...options,
    method: "GET"
  });
}

export function fetchQuoteUpdates(
  quoteId: string,
  filter: RequestUpdateFilter,
  cursor?: string | null,
  options: ReadOptions = {}
) {
  const params = new URLSearchParams({ kind: filter, take: "25" });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<QuoteUpdatesResponse>(
    `${quotePath(quoteId, "/updates")}?${params.toString()}`,
    { ...options, method: "GET" }
  );
}

export function postQuoteUpdate(quoteId: string, input: CreateRequestUpdateInput) {
  return apiRequest<QuoteUpdatesResponse>(quotePath(quoteId, "/updates"), {
    method: "POST",
    json: input
  });
}

export function completeQuoteUpdate(quoteId: string, updateId: string) {
  return apiRequest<QuoteUpdatesResponse>(
    quotePath(quoteId, `/updates/${encodeURIComponent(updateId)}/complete`),
    { method: "POST", json: { completed: true } }
  );
}

export function undoQuoteUpdate(quoteId: string, updateId: string) {
  return apiRequest<QuoteUpdatesResponse>(
    quotePath(quoteId, `/updates/${encodeURIComponent(updateId)}/undo`),
    { method: "POST" }
  );
}

export function markQuoteMentionsRead(quoteId: string) {
  return apiRequest<{ marked: number }>(quotePath(quoteId, "/mentions/read"), {
    method: "POST"
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

export function replaceLegacyQuoteFinancials(
  quoteId: string,
  input: ReplaceLegacyQuoteFinancialsInput
) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/legacy-financials"), {
    method: "PUT",
    json: input
  });
}

export function switchQuoteCalculationMode(
  quoteId: string,
  input: SwitchQuoteCalculationModeInput
) {
  return apiRequest<QuoteResponse>(quotePath(quoteId, "/calculation-mode"), {
    method: "PATCH",
    json: input
  });
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
