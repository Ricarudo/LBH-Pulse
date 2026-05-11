export const leadStatuses = [
  "New",
  "Contacted",
  "Qualified",
  "Site Visit Needed",
  "Estimating",
  "Proposal Needed",
  "Proposal Sent",
  "Won / Converted",
  "Lost",
  "Unqualified"
] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const leadPriorities = ["Low", "Normal", "High", "Urgent"] as const;
export type LeadPriority = (typeof leadPriorities)[number];

export const leadSources = [
  "Referral",
  "Existing Customer",
  "Website",
  "Phone",
  "Email",
  "Walk-in",
  "Vendor",
  "Partner",
  "Public Bid",
  "Internal",
  "Other"
] as const;

export type LeadSource = (typeof leadSources)[number];

export const serviceInterests = [
  "Access Control",
  "CCTV / Cameras",
  "Structured Cabling",
  "Fiber",
  "Network",
  "AV",
  "Security",
  "Maintenance",
  "Other"
] as const;

export type ServiceInterest = (typeof serviceInterests)[number];

export type LeadActivityType =
  | "Note"
  | "Task"
  | "Status"
  | "Owner"
  | "Follow-up"
  | "Conversion";

export type LeadActivity = {
  id: string;
  type: LeadActivityType;
  title: string;
  body?: string;
  actor: string;
  at: string;
};

export type LeadTask = {
  id: string;
  title: string;
  dueAt: string;
  owner: string;
  completed: boolean;
};

export type LeadRecord = {
  id: string;
  leadNumber: string;
  name: string;
  companyName: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  leadSource: LeadSource;
  serviceInterest: ServiceInterest;
  siteName: string;
  siteAddress: string;
  city: string;
  state: string;
  estimatedValue: number;
  status: LeadStatus;
  priority: LeadPriority;
  assignedOwner: string;
  nextFollowUpDate: string;
  notes: string;
  qualificationContactIdentified: boolean;
  qualificationSiteKnown: boolean;
  qualificationBudgetKnown: boolean;
  qualificationFollowUpScheduled: boolean;
  converted: boolean;
  convertedOpportunityId?: string;
  convertedQuoteId?: string;
  convertedProjectId?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  files: string[];
  activity: LeadActivity[];
  tasks: LeadTask[];
};

export const leadOwners = [
  "Alex Morgan",
  "Sales User",
  "Project Manager User",
  "Technician User",
  "Unassigned"
] as const;

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

