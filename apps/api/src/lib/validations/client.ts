import { z } from "zod";
import {
  clientIndustries,
  clientSiteTypes,
  clientStatuses,
  clientTypes,
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

const optionalText = textField();
const clientNameText = textField({ max: 160, collapseSpaces: true });
const contactNameText = textField({ max: 120, collapseSpaces: true });
const contactRoleText = textField({ max: 120, collapseSpaces: true });
const phoneText = textField({ max: 40, collapseSpaces: true });
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
export const clientTypeSchema = z.enum(clientTypes);
export const clientIndustrySchema = z.enum(clientIndustries);
export const clientSiteTypeSchema = z.enum(clientSiteTypes);
export const preferredContactMethodSchema = z.enum(preferredContactMethods);

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
  googleMapsUrl: optionalText,
  latitude: optionalCoordinate,
  longitude: optionalCoordinate,
  operationalHours: optionalText,
  accessInstructions: optionalText,
  parkingInstructions: optionalText,
  securityRequirements: optionalText,
  siteNotes: optionalText,
  isPrimarySite: z.boolean().default(false)
});

const clientContactFieldsSchema = z.object({
  siteId: optionalText,
  siteLocalId: optionalText,
  firstName: contactNameText,
  lastName: contactNameText,
  title: contactRoleText,
  department: optionalText,
  email: optionalEmail,
  phone: phoneText,
  mobile: phoneText,
  preferredContactMethod: preferredContactMethodSchema.default("Email"),
  isPrimaryContact: z.boolean().default(false),
  isBillingContact: z.boolean().default(false),
  isTechnicalContact: z.boolean().default(false),
  isDecisionMaker: z.boolean().default(false),
  notes: optionalText
});

export const clientContactSchema = clientContactFieldsSchema
  .superRefine((data, context) => {
    const contactName = [data.firstName, data.lastName].filter(Boolean).join(" ");

    if (contactName.length > 120) {
      context.addIssue({
        code: "custom",
        message: "Contact name must be 120 characters or less.",
        path: ["firstName"]
      });
    }

    if (
      !data.firstName &&
      !data.lastName &&
      !data.title &&
      !data.email &&
      !data.phone &&
      !data.mobile
    ) {
      context.addIssue({
        code: "custom",
        message: "Contact requires a name, email, phone, or role.",
        path: ["firstName"]
      });
    }
  });

const clientFieldsSchema = z.object({
  legalName: clientNameText,
  displayName: clientNameText,
  clientType: clientTypeSchema.default("Commercial"),
  industry: requiredIndustry,
  website: optionalText,
  status: clientStatusSchema.default("Prospect"),
  accountOwner: optionalText.default("Unassigned"),
  mainPhone: phoneText,
  mainEmail: optionalEmail,
  taxId: optionalText,
  paymentTerms: optionalText,
  billingEmail: optionalEmail,
  preferredCurrency: optionalText.default("USD"),
  preferredLanguage: optionalText.default("English"),
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
});

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
      data.contacts.filter((contact) => contact.isPrimaryContact).length > 1
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

export const updateClientSchema = clientFieldsSchema.partial();

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
export const updateClientSiteSchema = clientSiteSchema.partial();
export const addClientContactSchema = clientContactSchema;
export const updateClientContactSchema = clientContactFieldsSchema.partial();

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
