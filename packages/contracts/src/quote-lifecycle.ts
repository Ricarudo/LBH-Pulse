import { z } from "zod";

/** Commercial lifecycle vocabulary. Legacy status strings remain wire-compatible. */
export const quoteFamilyOutcomes = ["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
export const quoteFamilyOutcomeSchema = z.enum(quoteFamilyOutcomes);
export type QuoteFamilyOutcome = z.infer<typeof quoteFamilyOutcomeSchema>;
export const quotePublicationStates = ["DRAFT", "SENT"] as const;
export const quotePublicationStateSchema = z.enum(quotePublicationStates);
export type QuotePublicationState = z.infer<typeof quotePublicationStateSchema>;
export const quoteRevisionOrigins = ["CLIENT_REQUESTED", "INTERNAL"] as const;
export const quoteRevisionOriginSchema = z.enum(quoteRevisionOrigins);
export type QuoteRevisionOrigin = z.infer<typeof quoteRevisionOriginSchema>;
export const quoteLifecycleGroups = ["working", "awaiting-response", "closed"] as const;
export type QuoteLifecycleGroup = (typeof quoteLifecycleGroups)[number];
export const quoteLifecycleGroupLabels: Record<QuoteLifecycleGroup, string> = {
  working: "Working",
  "awaiting-response": "Awaiting response",
  closed: "Closed"
};

const legacyOutcomes: Readonly<Record<string, QuoteFamilyOutcome>> = {
  Approved: "ACCEPTED", Accepted: "ACCEPTED", Rejected: "REJECTED",
  Cancelled: "CANCELLED", Expired: "EXPIRED"
};

export function quoteOutcomeFromLegacyStatus(status: string): QuoteFamilyOutcome | null {
  return Object.prototype.hasOwnProperty.call(legacyOutcomes, status) ? legacyOutcomes[status] : null;
}

export function quoteStatusLabel(status: string): string {
  return status === "Approved" ? "Accepted" : status;
}

/** Presentation adapter only: it does not rewrite old business outcomes. */
export function quoteLifecycleGroup(status: string): QuoteLifecycleGroup {
  if (quoteOutcomeFromLegacyStatus(status)) return "closed";
  return status === "Sent" ? "awaiting-response" : "working";
}

export function quoteCommercialContentLocked(quote: { status: string; sentAt?: string | Date | null }): boolean {
  return Boolean(quote.sentAt) || quote.status === "Sent" || quoteOutcomeFromLegacyStatus(quote.status) !== null;
}

const businessDate = z.iso.date();

/** Input is already a workspace-local calendar date, never a server-local instant. */
export function defaultQuoteValidThrough(sentBusinessDate: string, days = 30): string {
  businessDate.parse(sentBusinessDate);
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) throw new Error("QUOTE_VALIDITY_DAYS_INVALID");
  const date = new Date(`${sentBusinessDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return businessDate.parse(date.toISOString().slice(0, 10));
}

export function quotePricingValidity(validThrough: string | null, asOfBusinessDate: string): "UNSPECIFIED" | "VALID" | "NEEDS_REFRESH" {
  businessDate.parse(asOfBusinessDate);
  if (validThrough === null) return "UNSPECIFIED";
  businessDate.parse(validThrough);
  return asOfBusinessDate > validThrough ? "NEEDS_REFRESH" : "VALID";
}

export type QuoteFamilyVersion = {
  id: string;
  familyId: string;
  publicationState: QuotePublicationState;
  outcome: QuoteFamilyOutcome | "SUPERSEDED" | "DISCARDED" | "CORRECTED" | null;
};

export type QuoteFamilyProjection = {
  id: string;
  outcome: QuoteFamilyOutcome | null;
  currentOfferId: string | null;
  currentDraftId: string | null;
};

/** Return one version; callers retain Decimal values and their evidence quality. */
export function quoteFamilyPipelineVersion<T extends QuoteFamilyVersion>(family: QuoteFamilyProjection, versions: readonly T[]): T | null {
  if (family.outcome !== null) return null;
  const id = family.currentOfferId ?? family.currentDraftId;
  if (id === null) return null;
  const matches = versions.filter(version => version.id === id);
  const version = matches[0];
  const expectedPublication = family.currentOfferId !== null ? "SENT" : "DRAFT";
  if (matches.length !== 1 || version.familyId !== family.id || version.outcome !== null || version.publicationState !== expectedPublication) {
    throw new Error("QUOTE_FAMILY_POINTER_INVALID");
  }
  return version;
}

/** Families must already be filtered to their final decision in the report period. */
export function quoteFamilyWinRate(families: readonly Pick<QuoteFamilyProjection, "id" | "outcome">[]): number | null {
  const ids = new Set<string>();
  let accepted = 0;
  let decisions = 0;
  for (const family of families) {
    if (ids.has(family.id)) throw new Error("QUOTE_FAMILY_DUPLICATE");
    ids.add(family.id);
    if (family.outcome === "ACCEPTED") accepted += 1;
    if (family.outcome === "ACCEPTED" || family.outcome === "REJECTED" || family.outcome === "EXPIRED") decisions += 1;
  }
  return decisions ? accepted / decisions : null;
}
