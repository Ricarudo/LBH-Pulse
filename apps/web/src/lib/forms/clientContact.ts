import {
  preferredContactMethods,
  type ClientContactInput
} from "@/types/client";
import {
  type FieldErrors,
  isAllowedValue,
  isEmailFormatValid,
  isPhoneFormatValid,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  validateCleanText
} from "./sanitization";

export type ClientContactDraft = {
  name: string;
  role: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  preferredContactMethod: string;
  notes: string;
};

export type ClientContactField = keyof ClientContactDraft;

export const clientContactLimits: Record<ClientContactField, number> = {
  name: 160,
  role: 80,
  title: 120,
  department: 2000,
  email: 254,
  phone: 40,
  preferredContactMethod: 40,
  notes: 2000
};

export const clientContactFields = Object.keys(
  clientContactLimits
) as ClientContactField[];

export function createBlankClientContactDraft(): ClientContactDraft {
  return {
    name: "",
    role: "Primary",
    title: "",
    department: "",
    email: "",
    phone: "",
    preferredContactMethod: "Email",
    notes: ""
  };
}

export function normalizeClientContactDraft(
  contact: ClientContactDraft
): ClientContactDraft {
  return {
    name: normalizeText(contact.name, true),
    role: normalizeText(contact.role, true),
    title: normalizeText(contact.title, true),
    department: normalizeText(contact.department, true),
    email: normalizeEmail(contact.email),
    phone: normalizePhone(contact.phone),
    preferredContactMethod:
      normalizeText(contact.preferredContactMethod, true) || "Email",
    notes: normalizeText(contact.notes)
  };
}

export function validateClientContactDraft(contact: ClientContactDraft) {
  const normalized = normalizeClientContactDraft(contact);
  const errors: FieldErrors<ClientContactField> = {};

  if (!normalized.name) {
    errors.name = "Point of Contact Name is required.";
  }

  if (!normalized.email && !normalized.phone) {
    errors.email = "Provide an email or phone for this contact.";
  }

  for (const field of clientContactFields) {
    validateCleanText(
      errors,
      field,
      normalized[field],
      clientContactLimits[field]
    );
  }

  if (normalized.email && !isEmailFormatValid(normalized.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (normalized.phone && !isPhoneFormatValid(normalized.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (
    !isAllowedValue(
      normalized.preferredContactMethod,
      preferredContactMethods
    )
  ) {
    errors.preferredContactMethod =
      "Select a valid preferred contact method.";
  }

  return { normalized, errors };
}

function splitContactName(contactName: string) {
  const [firstName = "", ...lastNameParts] = contactName.split(" ");
  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
}

export function buildClientContactPayload(
  contact: ClientContactDraft,
  options: {
    siteId?: string;
    primary?: boolean;
    billing?: boolean;
    technical?: boolean;
    decisionMaker?: boolean;
  } = {}
): ClientContactInput {
  const splitName = splitContactName(contact.name);
  const primary = Boolean(options.primary);
  const billing = Boolean(options.billing);
  const preferredContactMethod = isAllowedValue(
    contact.preferredContactMethod,
    preferredContactMethods
  )
    ? contact.preferredContactMethod
    : contact.email
      ? "Email"
      : "Phone";

  return {
    siteId: options.siteId ?? "",
    siteLocalId: "",
    name: contact.name,
    role: contact.role || "Primary",
    firstName: splitName.firstName || "Unknown",
    lastName: splitName.lastName,
    title: contact.title,
    department: contact.department,
    email: contact.email,
    phone: contact.phone,
    mobile: "",
    preferredContactMethod,
    isPrimary: primary,
    isBilling: billing,
    isPrimaryContact: primary,
    isBillingContact: billing,
    isTechnicalContact: Boolean(options.technical),
    isDecisionMaker: Boolean(options.decisionMaker),
    notes: contact.notes
  };
}
