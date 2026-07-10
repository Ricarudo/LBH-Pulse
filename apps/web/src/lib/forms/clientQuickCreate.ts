// Directory quick-create rules shared by the Directory popup and request intake
// wizard. Keeping normalization and payload construction here prevents the two
// client creation experiences from drifting over time.
import {
  clientIndustries,
  type ClientCreatePayload,
  type ClientIndustry
} from "@pulse/contracts/clients";
import {
  type FieldErrors,
  type FormRequestError,
  isAllowedValue,
  isEmailFormatValid,
  mapApiErrors,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  validateCleanText
} from "@/lib/forms/sanitization";

export type QuickCreateForm = {
  clientName: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
};

export type QuickCreateField = keyof QuickCreateForm;
export type QuickCreateErrors = FieldErrors<QuickCreateField>;

export const quickCreateLimits = {
  clientName: 160,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
  contactRole: 120
} as const;

export function createBlankQuickCreateForm(): QuickCreateForm {
  return {
    clientName: "",
    industry: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    contactRole: ""
  };
}

export function isClientIndustry(value: string): value is ClientIndustry {
  return isAllowedValue(value, clientIndustries);
}

export function validateQuickCreateForm(form: QuickCreateForm) {
  // Normalize first, then validate the normalized values. The caller writes the
  // normalized data back into form state so users see exactly what will be sent.
  const normalized: QuickCreateForm = {
    clientName: normalizeText(form.clientName, true),
    industry: normalizeText(form.industry),
    contactName: normalizeText(form.contactName, true),
    contactEmail: normalizeEmail(form.contactEmail),
    contactPhone: normalizePhone(form.contactPhone),
    contactRole: normalizeText(form.contactRole, true)
  };
  const errors: QuickCreateErrors = {};

  if (!normalized.clientName) {
    errors.clientName = "Client Name is required.";
  } else {
    validateCleanText(errors, "clientName", normalized.clientName, quickCreateLimits.clientName);
  }

  if (!normalized.industry) {
    errors.industry = "Client Industry is required.";
  } else if (!isClientIndustry(normalized.industry)) {
    errors.industry = "Select a valid client industry.";
  }

  validateCleanText(errors, "contactName", normalized.contactName, quickCreateLimits.contactName);
  validateCleanText(errors, "contactPhone", normalized.contactPhone, quickCreateLimits.contactPhone);
  validateCleanText(errors, "contactRole", normalized.contactRole, quickCreateLimits.contactRole);

  const hasAnyContactField = Boolean(
    normalized.contactName ||
      normalized.contactEmail ||
      normalized.contactPhone ||
      normalized.contactRole
  );

  if (hasAnyContactField && !normalized.contactName) {
    errors.contactName = "Point of Contact Name is required.";
  }

  if (hasAnyContactField && !normalized.contactEmail && !normalized.contactPhone) {
    errors.contactEmail = "Provide an email or phone for this contact.";
  }

  if (normalized.contactEmail.length > quickCreateLimits.contactEmail) {
    errors.contactEmail = `Must be ${quickCreateLimits.contactEmail} characters or less.`;
  } else if (normalized.contactEmail && !isEmailFormatValid(normalized.contactEmail)) {
    errors.contactEmail = "Enter a valid email address.";
  }

  return { normalized, errors };
}

export function splitContactName(contactName: string) {
  const [firstName = "", ...lastNameParts] = contactName.split(" ");
  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
}

export function buildQuickCreatePayload(form: QuickCreateForm): ClientCreatePayload {
  // This is intentionally the same compact payload shape the Directory popup
  // has always sent to /api/clients.
  const contactProvided = Boolean(
    form.contactName || form.contactEmail || form.contactPhone || form.contactRole
  );
  const contacts: ClientCreatePayload["contacts"] = [];

  if (contactProvided) {
    const { firstName, lastName } = splitContactName(form.contactName);

    contacts.push({
      name: form.contactName,
      role: form.contactRole || "Primary",
      firstName,
      lastName,
      title: form.contactRole,
      department: "",
      email: form.contactEmail,
      phone: form.contactPhone,
      mobile: "",
      preferredContactMethod: form.contactEmail
        ? "Email"
        : form.contactPhone
          ? "Phone"
          : "Email",
      isPrimary: true,
      isBilling: false,
      isPrimaryContact: true,
      isBillingContact: false,
      isTechnicalContact: false,
      isDecisionMaker: false,
      notes: ""
    });
  }

  return {
    legalName: form.clientName,
    displayName: form.clientName,
    industry: form.industry,
    website: "",
    status: "Prospect",
    accountOwner: "Unassigned",
    taxId: "",
    paymentTerms: "",
    preferredCurrency: "USD",
    preferredLanguage: "English",
    brandPreferences: "",
    technologyPreferences: "",
    generalNotes: "",
    preferredVendors: "",
    preferredCameraBrand: "",
    preferredAccessControlBrand: "",
    preferredNetworkBrand: "",
    preferredCablingBrand: "",
    standardTechnologies: "",
    documentationRequirements: "",
    invoiceRequirements: "",
    insuranceRequirements: "",
    purchaseOrderRequired: false,
    sites: [],
    contacts,
    serviceProfile: []
  };
}

export function quickCreateFieldFromApiPath(path: string): QuickCreateField | "form" {
  // The client API reports nested fields such as contacts.0.email; this maps
  // those paths back to the small quick-create field names.
  if (path === "displayName" || path === "legalName") {
    return "clientName";
  }

  if (path === "industry") {
    return "industry";
  }

  if (path.startsWith("contacts.0.")) {
    const contactField = path.replace("contacts.0.", "");

    if (contactField === "name" || contactField === "firstName" || contactField === "lastName") {
      return "contactName";
    }

    if (contactField === "email") {
      return "contactEmail";
    }

    if (contactField === "phone" || contactField === "mobile") {
      return "contactPhone";
    }

    if (contactField === "title" || contactField === "role") {
      return "contactRole";
    }
  }

  return "form";
}

export function mapQuickCreateApiErrors(error: FormRequestError): QuickCreateErrors {
  return mapApiErrors(error, quickCreateFieldFromApiPath);
}
