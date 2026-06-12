import { z } from "zod";
import {
  clientIndustries,
  clientLanguages,
  clientSiteTypes,
  clientPaymentTerms,
  clientStatuses,
  clientSources,
  clientOwners,
  preferredContactMethods
} from "@/types/client";

const unsafeFreeTextPattern = /[<>]|javascript\s*:/i;
const unsafeFreeTextMessage = "Remove HTML or script content.";

function normalizeText(value?: string, collapseSpaces = false) {
  const trimmed = value?.trim() ?? "";
  return collapseSpaces ? trimmed.replace(/\s+/g, " ") : trimmed;
}

function textField(options: { max?: number; collapseSpaces?: boolean } = {}) {
  return z
    .string()
    .optional()
    .transform((value) => normalizeText(value, options.collapseSpaces))
    .refine(
      (value) => options.max === undefined || value.length <= options.max,
      options.max
        ? `Must be ${options.max} characters or less.`
        : "Text is too long."
    )
    .refine((value) => !unsafeFreeTextPattern.test(value), unsafeFreeTextMessage);
}

function allowlistedText<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string
) {
  return z
    .string()
    .optional()
    .transform((value) => normalizeText(value, true))
    .refine((value) => (values as readonly string[]).includes(value), message);
}

function isValidHttpUrl(value: string) {
  if (!value) {
    return true;
  }

  if (/\s/.test(value)) {
    return false;
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const optionalText = textField({ max: 2000 });
const clientNameText = textField({ max: 160, collapseSpaces: true });
const contactNameText = textField({ max: 160, collapseSpaces: true });
const contactPartNameText = textField({ max: 120, collapseSpaces: true });
const contactTitleText = textField({ max: 120, collapseSpaces: true });
const contactRoleText = textField({ max: 80, collapseSpaces: true });
const phonePattern = /^[0-9+().\-\s]*(?:(?:x|ext\.?)\s?\d{1,8})?$/i;
const phoneText = textField({ max: 40, collapseSpaces: true }).refine(
  (value) => !value || (phonePattern.test(value) && value.replace(/\D/g, "").length >= 7),
  "Enter a valid phone number."
);
const optionalUrl = textField({ max: 2048, collapseSpaces: true }).refine(
  isValidHttpUrl,
  "Enter a valid URL."
);
const optionalDateTimeText = z
  .string()
  .optional()
  .transform((value) => normalizeText(value))
  .refine(
    (value) => !value || !Number.isNaN(Date.parse(value)),
    "Enter a valid timestamp."
  );
const requiredIndustry = z
  .string()
  .optional()
  .transform((value) => normalizeText(value))
  .refine((value) => value.length > 0, "Client Industry is required.")
  .refine(
    (value) =>
      clientIndustries.includes(value as (typeof clientIndustries)[number]),
    "Select a valid client industry."
  );

const optionalEmail = textField({ max: 254 })
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => !value || z.string().email().safeParse(value).success,
    "Enter a valid email address."
  );

const optionalCoordinate = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") {
      return undefined;
    }

    return Number(value);
  })
  .refine(
    (value) => value === undefined || Number.isFinite(value),
    "Enter a valid coordinate."
  );

export const clientStatusSchema = z.enum(clientStatuses);
export const clientIndustrySchema = z.enum(clientIndustries);
export const clientSiteTypeSchema = z.enum(clientSiteTypes);
export const preferredContactMethodSchema = z.enum(preferredContactMethods);
export const clientOwnerSchema = z.enum(clientOwners);
export const clientSourceSchema = z.enum(clientSources);
export const clientLanguageSchema = z.enum(clientLanguages);
export const clientPaymentTermsSchema = z.enum(clientPaymentTerms);

export const clientSiteSchema = z.object({
  localId: optionalText,
  siteName: textField({ max: 160, collapseSpaces: true }).refine(
    (value) => value.length > 0,
    "Site name is required."
  ),
  siteType: clientSiteTypeSchema.default("Main Office"),
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText.default("PR"),
  postalCode: optionalText,
  country: optionalText.default("Puerto Rico"),
  googleMapsUrl: optionalUrl,
  latitude: optionalCoordinate,
  longitude: optionalCoordinate,
  operationalHours: optionalText,
  accessInstructions: optionalText,
  parkingInstructions: optionalText,
  securityRequirements: optionalText,
  siteNotes: optionalText,
  isPrimarySite: z.boolean().default(false)
}).strict();

function splitContactName(name: string) {
  const [firstName = "", ...lastNameParts] = name.split(" ");
  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
}

const clientContactFieldsSchema = z.object({
  siteId: optionalText,
  siteLocalId: optionalText,
  name: contactNameText,
  role: contactRoleText.default("Primary"),
  firstName: contactPartNameText,
  lastName: contactPartNameText,
  title: contactTitleText,
  department: optionalText,
  email: optionalEmail,
  phone: phoneText,
  mobile: phoneText,
  preferredContactMethod: preferredContactMethodSchema.default("Email"),
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
  isPrimaryContact: z.boolean().default(false),
  isBillingContact: z.boolean().default(false),
  isTechnicalContact: z.boolean().default(false),
  isDecisionMaker: z.boolean().default(false),
  notes: optionalText
}).strict();

export const clientContactSchema = clientContactFieldsSchema
  .superRefine((data, context) => {
    const contactName =
      data.name || [data.firstName, data.lastName].filter(Boolean).join(" ");

    if (!contactName) {
      context.addIssue({
        code: "custom",
        message: "Contact name is required.",
        path: ["name"]
      });
    }

    if (!data.email && !data.phone && !data.mobile) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one contact method.",
        path: ["email"]
      });
    }
  })
  .transform((data) => {
    const name = data.name || [data.firstName, data.lastName].filter(Boolean).join(" ");
    const splitName = splitContactName(name);
    const isPrimary = data.isPrimary || data.isPrimaryContact;
    const isBilling = data.isBilling || data.isBillingContact;

    return {
      ...data,
      name,
      role: data.role || "Primary",
      firstName: data.firstName || splitName.firstName || "Unknown",
      lastName: data.lastName || splitName.lastName,
      isPrimary,
      isPrimaryContact: isPrimary,
      isBilling,
      isBillingContact: isBilling
    };
  });

const clientFieldsSchema = z.object({
  legalName: clientNameText,
  displayName: clientNameText,
  industry: requiredIndustry,
  website: optionalUrl,
  status: clientStatusSchema.default("Prospect"),
  accountOwner: clientOwnerSchema.default("Unassigned"),
  taxId: optionalText,
  paymentTerms: clientPaymentTermsSchema.default(""),
  preferredCurrency: optionalText.default("USD"),
  preferredLanguage: clientLanguageSchema.default("English"),
  brandPreferences: optionalText,
  technologyPreferences: optionalText,
  generalNotes: optionalText,
  preferredVendors: optionalText,
  preferredCameraBrand: optionalText,
  preferredAccessControlBrand: optionalText,
  preferredNetworkBrand: optionalText,
  preferredCablingBrand: optionalText,
  standardTechnologies: optionalText,
  documentationRequirements: optionalText,
  invoiceRequirements: optionalText,
  insuranceRequirements: optionalText,
  purchaseOrderRequired: z.boolean().default(false),
  serviceProfile: z.array(z.string().trim().min(1)).default([]),
  sites: z.array(clientSiteSchema).default([]),
  contacts: z.array(clientContactSchema).default([])
}).strict();

export const createClientSchema = clientFieldsSchema
  .superRefine((data, context) => {
    if (!data.legalName && !data.displayName) {
      context.addIssue({
        code: "custom",
        message: "Legal name or display name is required.",
        path: ["displayName"]
      });
    }

    if (data.sites.filter((site) => site.isPrimarySite).length > 1) {
      context.addIssue({
        code: "custom",
        message: "Only one primary site is allowed.",
        path: ["sites"]
      });
    }

    if (
      data.contacts.filter((contact) => contact.isPrimary || contact.isPrimaryContact).length > 1
    ) {
      context.addIssue({
        code: "custom",
        message: "Only one primary contact is allowed.",
        path: ["contacts"]
      });
    }
  })
  .transform((data) => ({
    ...data,
    legalName: data.legalName || data.displayName,
    displayName: data.displayName || data.legalName,
    preferredCurrency: data.preferredCurrency || "USD",
    preferredLanguage: data.preferredLanguage || "English",
    accountOwner: data.accountOwner || "Unassigned"
  }));

const serviceProfileUpdateSchema = z
  .array(textField({ max: 120, collapseSpaces: true }).refine(Boolean, "Service name is required."))
  .default([]);

const updatePrimarySiteSchema = clientSiteSchema
  .partial()
  .extend({
    id: optionalText
  })
  .strict();

const updatePrimaryContactSchema = clientContactFieldsSchema
  .partial()
  .extend({
    id: optionalText
  })
  .strict();

export const updateClientSchema = clientFieldsSchema
  .omit({
    sites: true,
    contacts: true
  })
  .extend({
    source: clientSourceSchema,
    accountOwner: clientOwnerSchema,
    preferredLanguage: clientLanguageSchema,
    paymentTerms: clientPaymentTermsSchema,
    serviceProfile: serviceProfileUpdateSchema,
    updatedAt: optionalDateTimeText,
    primarySite: updatePrimarySiteSchema.optional(),
    primaryContact: updatePrimaryContactSchema.optional()
  })
  .partial()
  .strict()
  .superRefine((data, context) => {
    if (
      ("legalName" in data || "displayName" in data) &&
      !data.legalName &&
      !data.displayName
    ) {
      context.addIssue({
        code: "custom",
        message: "Legal name or display name is required.",
        path: ["displayName"]
      });
    }

    if (data.primarySite) {
      const hasSiteContent = [
        data.primarySite.siteName,
        data.primarySite.addressLine1,
        data.primarySite.addressLine2,
        data.primarySite.city,
        data.primarySite.state,
        data.primarySite.postalCode,
        data.primarySite.country,
        data.primarySite.googleMapsUrl,
        data.primarySite.operationalHours,
        data.primarySite.accessInstructions,
        data.primarySite.parkingInstructions,
        data.primarySite.securityRequirements,
        data.primarySite.siteNotes
      ].some(Boolean);

      if (!data.primarySite.id && hasSiteContent && !data.primarySite.siteName) {
        context.addIssue({
          code: "custom",
          message: "Site name is required.",
          path: ["primarySite", "siteName"]
        });
      }
    }
  });

export const createClientActivitySchema = z.object({
  type: optionalText.default("Note"),
  title: z.string().trim().min(1),
  detail: optionalText,
  actor: optionalText.default("Alex Morgan")
});

export const importClientInfoSchema = z.object({
  source: optionalText.default("Manual import"),
  actor: optionalText.default("Alex Morgan")
});

export const addClientSiteSchema = clientSiteSchema;
export const updateClientSiteSchema = clientSiteSchema.partial().strict();
export const addClientContactSchema = clientContactSchema;
export const updateClientContactSchema = clientContactSchema;

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientSiteInput = z.infer<typeof clientSiteSchema>;
export type UpdateClientSiteInput = z.infer<typeof updateClientSiteSchema>;
export type ClientContactInput = z.infer<typeof clientContactSchema>;
export type UpdateClientContactInput = z.infer<
  typeof updateClientContactSchema
>;
export type CreateClientActivityInput = z.infer<
  typeof createClientActivitySchema
>;
export type ImportClientInfoInput = z.infer<typeof importClientInfoSchema>;
