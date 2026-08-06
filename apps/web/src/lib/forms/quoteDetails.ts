import type { ClientContactInput, ClientSiteInput } from "@pulse/contracts/clients";
import type { UpdateQuoteInput } from "@pulse/contracts/work";
import {
  buildClientContactPayload,
  validateClientContactDraft
} from "./clientContact";
import {
  normalizeText,
  validateCleanText,
  type FieldErrors
} from "./sanitization";

export type QuoteDetailsDraft = {
  title: string;
  contactId: string;
  siteId: string;
  assignedToId: string;
  dueDate: string;
  lifecycleDetails: string;
  collaboratorIds: string[];
};

export type QuoteDetailsField = "title";

export type QuoteInlineContactDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type QuoteInlineContactField = keyof QuoteInlineContactDraft;

export type QuoteInlineSiteDraft = {
  siteName: string;
  addressLine1: string;
  city: string;
  state: string;
};

export type QuoteInlineSiteField = keyof QuoteInlineSiteDraft;

export function createBlankQuoteContactDraft(): QuoteInlineContactDraft {
  return { firstName: "", lastName: "", email: "", phone: "" };
}

export function createBlankQuoteSiteDraft(): QuoteInlineSiteDraft {
  return { siteName: "", addressLine1: "", city: "", state: "PR" };
}

export function validateQuoteDetailsDraft(draft: QuoteDetailsDraft) {
  const normalized = {
    ...draft,
    title: normalizeText(draft.title, true),
    collaboratorIds: Array.from(new Set(draft.collaboratorIds))
  };
  const errors: FieldErrors<QuoteDetailsField> = {};

  if (!normalized.title) {
    errors.title = "Quote title is required.";
  } else {
    validateCleanText(errors, "title", normalized.title, 200);
  }

  return { normalized, errors };
}

export function buildQuoteDetailsPayload(
  draft: QuoteDetailsDraft,
  original?: QuoteDetailsDraft
): UpdateQuoteInput {
  return {
    ...(!original || draft.title !== original.title ? { title: draft.title } : {}),
    ...(draft.contactId && (!original || draft.contactId !== original.contactId) ? { contactId: draft.contactId } : {}),
    ...(draft.siteId && (!original || draft.siteId !== original.siteId) ? { siteId: draft.siteId } : {}),
    ...(draft.assignedToId && (!original || draft.assignedToId !== original.assignedToId) ? { assignedToId: draft.assignedToId } : {}),
    ...(!original || draft.dueDate !== original.dueDate ? { dueDate: draft.dueDate || null } : {}),
    ...(!original || draft.lifecycleDetails !== original.lifecycleDetails ? { lifecycleDetails: draft.lifecycleDetails } : {}),
    ...(!original || JSON.stringify(draft.collaboratorIds) !== JSON.stringify(original.collaboratorIds)
      ? { collaboratorIds: draft.collaboratorIds }
      : {})
  };
}

export function validateQuoteContactDraft(draft: QuoteInlineContactDraft) {
  const validation = validateClientContactDraft({
    name: `${draft.firstName} ${draft.lastName}`.trim(),
    role: "Primary",
    title: "",
    department: "",
    email: draft.email,
    phone: draft.phone,
    preferredContactMethod: draft.email ? "Email" : "Phone",
    notes: ""
  });
  const [firstName = "", ...lastNameParts] = validation.normalized.name.split(" ");
  const errors: FieldErrors<QuoteInlineContactField> = {};

  if (validation.errors.name) errors.firstName = validation.errors.name;
  if (validation.errors.email) errors.email = validation.errors.email;
  if (validation.errors.phone) errors.phone = validation.errors.phone;
  if (validation.errors.form) errors.form = validation.errors.form;

  return {
    normalized: {
      firstName,
      lastName: lastNameParts.join(" "),
      email: validation.normalized.email,
      phone: validation.normalized.phone
    },
    errors
  };
}

export function buildQuoteContactPayload(
  draft: QuoteInlineContactDraft,
  primary: boolean
): ClientContactInput {
  return buildClientContactPayload({
    name: `${draft.firstName} ${draft.lastName}`.trim(),
    role: "Primary",
    title: "",
    department: "",
    email: draft.email,
    phone: draft.phone,
    preferredContactMethod: draft.email ? "Email" : "Phone",
    notes: ""
  }, { primary });
}

export function validateQuoteSiteDraft(draft: QuoteInlineSiteDraft) {
  const normalized = {
    siteName: normalizeText(draft.siteName, true),
    addressLine1: normalizeText(draft.addressLine1),
    city: normalizeText(draft.city, true),
    state: normalizeText(draft.state, true) || "PR"
  };
  const errors: FieldErrors<QuoteInlineSiteField> = {};

  if (!normalized.siteName) errors.siteName = "Site name is required.";
  validateCleanText(errors, "siteName", normalized.siteName, 160);
  validateCleanText(errors, "addressLine1", normalized.addressLine1, 2000);
  validateCleanText(errors, "city", normalized.city, 2000);
  validateCleanText(errors, "state", normalized.state, 2000);

  return { normalized, errors };
}

export function buildQuoteSitePayload(
  draft: QuoteInlineSiteDraft,
  primary: boolean
): ClientSiteInput {
  return {
    localId: "",
    siteName: draft.siteName,
    siteType: "Main Office",
    addressLine1: draft.addressLine1,
    addressLine2: "",
    city: draft.city,
    state: draft.state,
    postalCode: "",
    country: "Puerto Rico",
    googleMapsUrl: "",
    operationalHours: "",
    accessInstructions: "",
    parkingInstructions: "",
    securityRequirements: "",
    siteNotes: "",
    isPrimarySite: primary
  };
}
