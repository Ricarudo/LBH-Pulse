import { z } from "zod";
import {
  clientSiteTypes,
  clientStatuses,
  clientTypes,
  preferredContactMethods
} from "@/types/client";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const optionalEmail = optionalText.refine(
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
export const clientSiteTypeSchema = z.enum(clientSiteTypes);
export const preferredContactMethodSchema = z.enum(preferredContactMethods);

export const clientSiteSchema = z.object({
  localId: optionalText,
  siteName: z.string().trim().min(1, "Site name is required."),
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
    firstName: optionalText,
    lastName: optionalText,
    title: optionalText,
    department: optionalText,
    email: optionalEmail,
    phone: optionalText,
    mobile: optionalText,
    preferredContactMethod: preferredContactMethodSchema.default("Email"),
    isPrimaryContact: z.boolean().default(false),
    isBillingContact: z.boolean().default(false),
    isTechnicalContact: z.boolean().default(false),
    isDecisionMaker: z.boolean().default(false),
    notes: optionalText
  });

export const clientContactSchema = clientContactFieldsSchema
  .superRefine((data, context) => {
    if (!data.firstName && !data.lastName && !data.email && !data.phone) {
      context.addIssue({
        code: "custom",
        message: "Contact requires a name, email, or phone.",
        path: ["firstName"]
      });
    }
  });

const clientFieldsSchema = z.object({
    legalName: optionalText,
    displayName: optionalText,
    clientType: clientTypeSchema.default("Commercial"),
    industry: optionalText,
    website: optionalText,
    status: clientStatusSchema.default("Prospect"),
    accountOwner: optionalText.default("Unassigned"),
    mainPhone: optionalText,
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
