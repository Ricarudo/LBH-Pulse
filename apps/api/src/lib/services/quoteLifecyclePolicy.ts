import { quoteCommercialContentLocked } from "@pulse/contracts/quote-lifecycle";
import type { UpdateQuoteInput } from "@pulse/contracts/work";

export function assertQuoteCommercialEditable(quote: { status: string; sentAt: Date | null }) {
  if (quoteCommercialContentLocked(quote)) throw new Error("QUOTE_COMMERCIAL_CONTENT_LOCKED");
}

/** The ordinary PATCH still supports operational assignments on frozen offers. */
export function hasQuoteCommercialChanges(input: UpdateQuoteInput) {
  return [input.title, input.clientId, input.contactId, input.siteId,
    input.dueDate, input.lifecycleDetails, input.trades].some(value => value !== undefined);
}
