// Directory quick-create rules shared by the Directory popup and request intake
// wizard. Keeping normalization and payload construction here prevents the two
// client creation experiences from drifting over time.
import {
  clientIndustries,
  clientSiteTypes,
  type ClientCreatePayload,
  type ClientIndustry,
  type ClientSiteType
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
  siteName: string;
  siteType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
};

export type QuickCreateField = keyof QuickCreateForm;
export type QuickCreateErrors = FieldErrors<QuickCreateField>;

export const quickCreateLimits = {
  clientName: 160,
  siteName: 160,
  siteType: 40,
  addressLine1: 2000,
  addressLine2: 2000,
  city: 2000,
  state: 2000,
  postalCode: 2000,
  country: 2000,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
  contactRole: 120
} as const;

export function createBlankQuickCreateForm(): QuickCreateForm {
  return {
    clientName: "",
    industry: "",
    siteName: "",
    siteType: "Main Office",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "PR",
    postalCode: "",
    country: "Puerto Rico",
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
    siteName: normalizeText(form.siteName, true),
    siteType: normalizeText(form.siteType),
    addressLine1: normalizeText(form.addressLine1),
    addressLine2: normalizeText(form.addressLine2),
    city: normalizeText(form.city),
    state: normalizeText(form.state),
    postalCode: normalizeText(form.postalCode),
    country: normalizeText(form.country),
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

  if (!normalized.siteName) {
    errors.siteName = "Site Name is required.";
  } else {
    validateCleanText(errors, "siteName", normalized.siteName, quickCreateLimits.siteName);
  }

  if (!isAllowedValue(normalized.siteType, clientSiteTypes)) {
    errors.siteType = "Select a valid site type.";
  }

  validateCleanText(errors, "addressLine1", normalized.addressLine1, quickCreateLimits.addressLine1);
  validateCleanText(errors, "addressLine2", normalized.addressLine2, quickCreateLimits.addressLine2);
  validateCleanText(errors, "city", normalized.city, quickCreateLimits.city);
  validateCleanText(errors, "state", normalized.state, quickCreateLimits.state);
  validateCleanText(errors, "postalCode", normalized.postalCode, quickCreateLimits.postalCode);
  validateCleanText(errors, "country", normalized.country, quickCreateLimits.country);

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
  const quickSiteLocalId = "quick-create-site";

  if (contactProvided) {
    const { firstName, lastName } = splitContactName(form.contactName);

    contacts.push({
      name: form.contactName,
      siteLocalId: quickSiteLocalId,
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
    sites: [
      {
        localId: quickSiteLocalId,
        siteName: form.siteName,
        siteType: form.siteType as ClientSiteType,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
        country: form.country,
        googleMapsUrl: "",
        operationalHours: "",
        accessInstructions: "",
        parkingInstructions: "",
        securityRequirements: "",
        siteNotes: "",
        isPrimarySite: true
      }
    ],
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

  if (path === "sites.0.siteName") {
    return "siteName";
  }

  if (path === "sites.0.siteType") {
    return "siteType";
  }

  if (path === "sites.0.addressLine1") {
    return "addressLine1";
  }

  if (path === "sites.0.addressLine2") {
    return "addressLine2";
  }

  if (path === "sites.0.city") {
    return "city";
  }

  if (path === "sites.0.state") {
    return "state";
  }

  if (path === "sites.0.postalCode") {
    return "postalCode";
  }

  if (path === "sites.0.country") {
    return "country";
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
