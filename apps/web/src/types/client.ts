export const clientStatuses = [
  "Active",
  "Prospect",
  "On Hold",
  "Inactive"
] as const;

export type ClientStatus = (typeof clientStatuses)[number];

export const clientIndustries = [
  "Agriculture",
  "Aerospace",
  "Architecture",
  "Corporate",
  "Construction",
  "Defense",
  "Education",
  "Entertainment",
  "Finance",
  "Healthcare",
  "Hospitality",
  "House of Worship",
  "Local Government",
  "Federal Government",
  "Retail",
  "Manufacturing",
  "Technology",
  "Other"
] as const;

export type ClientIndustry = (typeof clientIndustries)[number];

export const clientSiteTypes = [
  "Main Office",
  "Warehouse",
  "Retail",
  "Manufacturing",
  "Data Room",
  "Distribution Center",
  "Other"
] as const;

export type ClientSiteType = (typeof clientSiteTypes)[number];

export const preferredContactMethods = [
  "Email",
  "Phone",
  "Mobile",
  "Text",
  "Portal"
] as const;

export type PreferredContactMethod = (typeof preferredContactMethods)[number];

export const clientOwners = [
  "Alex Morgan",
  "Sales User",
  "Project Manager User",
  "Unassigned"
] as const;

export const clientSources = [
  "",
  "Call",
  "Email",
  "Existing Client",
  "Existing Customer",
  "Referral",
  "Website",
  "RFP",
  "Drawing Package",
  "Phone",
  "Vendor",
  "Partner",
  "Internal",
  "Other"
] as const;

export const clientLanguages = [
  "English",
  "Spanish",
  "Bilingual"
] as const;

export const clientPaymentTerms = [
  "",
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Prepaid",
  "COD"
] as const;

export type ClientContact = {
  id: string;
  siteId?: string;
  siteName?: string;
  role: string;
  firstName: string;
  lastName: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  mobile: string;
  preferredContactMethod: string;
  isPrimary: boolean;
  isBilling: boolean;
  isPrimaryContact: boolean;
  isBillingContact: boolean;
  isTechnicalContact: boolean;
  isDecisionMaker: boolean;
  notes: string;
};

export type ClientSite = {
  id: string;
  siteName: string;
  name: string;
  siteType: string;
  addressLine1: string;
  addressLine2: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googleMapsUrl: string;
  latitude?: number;
  longitude?: number;
  operationalHours: string;
  accessInstructions: string;
  parkingInstructions: string;
  securityRequirements: string;
  siteNotes: string;
  isPrimarySite: boolean;
  status: string;
};

export type ClientActivity = {
  id: string;
  type: string;
  title: string;
  detail: string;
  actor: string;
  date: string;
};

export type ClientRecord = {
  id: string;
  clientNumber: string;
  legalName: string;
  displayName: string;
  companyName: string;
  industry: string;
  website: string;
  status: ClientStatus;
  accountOwner: string;
  primaryContact: ClientContact;
  billingContact: ClientContact;
  taxId: string;
  paymentTerms: string;
  preferredCurrency: string;
  preferredLanguage: string;
  primarySite: string;
  city: string;
  state: string;
  serviceProfile: string[];
  openOpportunities: number;
  activeProjects: number;
  lifetimeValue: number;
  outstandingBalance: number;
  lastActivity: string;
  source: string;
  importantNotes: string;
  brandPreferences: string;
  technologyPreferences: string;
  generalNotes: string;
  preferredVendors: string;
  preferredCameraBrand: string;
  preferredAccessControlBrand: string;
  preferredNetworkBrand: string;
  preferredCablingBrand: string;
  standardTechnologies: string;
  documentationRequirements: string;
  invoiceRequirements: string;
  insuranceRequirements: string;
  purchaseOrderRequired: boolean;
  sites: ClientSite[];
  contacts: ClientContact[];
  recentActivity: ClientActivity[];
  createdAt: string;
  updatedAt: string;
};

export type ClientQuoteSummary = {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  owner: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  requestId: string;
  requestNumber: string;
};

export type ClientSiteInput = {
  localId?: string;
  siteName: string;
  siteType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googleMapsUrl: string;
  latitude?: string;
  longitude?: string;
  operationalHours: string;
  accessInstructions: string;
  parkingInstructions: string;
  securityRequirements: string;
  siteNotes: string;
  isPrimarySite: boolean;
};

export type ClientContactInput = {
  siteId?: string;
  siteLocalId?: string;
  name?: string;
  role?: string;
  firstName: string;
  lastName: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  mobile: string;
  preferredContactMethod: string;
  isPrimary?: boolean;
  isBilling?: boolean;
  isPrimaryContact: boolean;
  isBillingContact: boolean;
  isTechnicalContact: boolean;
  isDecisionMaker: boolean;
  notes: string;
};

export type ClientCreatePayload = {
  legalName: string;
  displayName: string;
  industry: string;
  website: string;
  status: ClientStatus;
  accountOwner: string;
  taxId: string;
  paymentTerms: string;
  preferredCurrency: string;
  preferredLanguage: string;
  brandPreferences: string;
  technologyPreferences: string;
  generalNotes: string;
  preferredVendors: string;
  preferredCameraBrand: string;
  preferredAccessControlBrand: string;
  preferredNetworkBrand: string;
  preferredCablingBrand: string;
  standardTechnologies: string;
  documentationRequirements: string;
  invoiceRequirements: string;
  insuranceRequirements: string;
  purchaseOrderRequired: boolean;
  sites: ClientSiteInput[];
  contacts: ClientContactInput[];
  serviceProfile: string[];
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}
