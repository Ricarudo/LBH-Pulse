import type { LocalRole } from "@/lib/auth/permissions";

export const requestStatuses = [
  "Received",
  "Reviewing",
  "Missing Info",
  "Site Visit Required",
  "Ready for Quote",
  "Converted to Quote",
  "No Bid",
  "Cancelled",
  "Duplicate"
] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export const requestTypes = [
  "Quote Request",
  "RFP / Bid",
  "Drawing Review",
  "Site Visit Request",
  "Service-Related Quote",
  "Change Order Request",
  "General Inquiry"
] as const;

export type RequestType = (typeof requestTypes)[number];

export const requestSources = [
  "Call",
  "Email",
  "RFP",
  "Drawing Package",
  "Referral",
  "Existing Client",
  "Website",
  "Vendor",
  "Partner",
  "Internal",
  "Other"
] as const;

export type RequestSource = (typeof requestSources)[number];

export const serviceCategories = [
  "CCTV / Surveillance",
  "Access Control",
  "Structured Cabling",
  "Networking",
  "Fiber",
  "AV",
  "Wireless / Wi-Fi",
  "Service / Support",
  "Other"
] as const;

export type ServiceCategory = (typeof serviceCategories)[number];

export const requestPriorities = ["Low", "Normal", "High", "Urgent"] as const;
export type RequestPriority = (typeof requestPriorities)[number];

export type RequestActivityType =
  | "Note"
  | "Task"
  | "Status"
  | "Owner"
  | "Follow-up"
  | "Conversion";

export type RequestActivity = {
  id: string;
  type: RequestActivityType;
  title: string;
  body?: string;
  actor: string;
  at: string;
};

export type RequestTask = {
  id: string;
  title: string;
  dueAt: string;
  owner: string;
  completed: boolean;
};

export type RequestChecklistItem = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  appliesWhen: string;
  group: string;
  sortOrder: number;
  completed: boolean;
  completedAt: string;
  completedByName: string;
  notes: string;
  applicable: boolean;
};

export type RequestChecklistSummary = {
  templateName: string;
  completed: number;
  total: number;
  requiredCompleted: number;
  requiredTotal: number;
  missingRequired: string[];
  readyForQuote: boolean;
};

export type RequestAssignee = {
  id: string;
  name: string;
  email: string;
  role: LocalRole;
  roleLabel: string;
};

export type RequestRecord = {
  id: string;
  requestNumber: string;
  title: string;
  requestType: RequestType;
  source: RequestSource;
  serviceCategory: ServiceCategory;
  status: RequestStatus;
  priority: RequestPriority;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  siteName: string;
  siteAddress: string;
  city: string;
  state: string;
  clientId: string | null;
  contactId: string | null;
  siteId: string | null;
  assignedToId: string | null;
  assignedToName: string;
  assignedToRole: LocalRole | "";
  createdById: string | null;
  createdByName: string;
  receivedDate: string;
  dueDate: string;
  nextAction: string;
  nextFollowUpAt: string;
  lastActivityAt: string;
  missingInfo: string;
  siteVisitNeeded: boolean;
  siteVisitCompleted: boolean;
  description: string;
  internalNotes: string;
  relatedQuoteId: string | null;
  relatedQuoteNumber: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  files: string[];
  activity: RequestActivity[];
  tasks: RequestTask[];
  checklistItems: RequestChecklistItem[];
  checklistSummary: RequestChecklistSummary;
};
