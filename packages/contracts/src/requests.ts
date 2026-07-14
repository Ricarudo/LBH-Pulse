import type { LifecycleDocumentRecord } from "./documents";

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
  "Power / UPS",
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

export type RequestChecklistInstanceRecord = {
  id: string;
  templateId: string | null;
  templateKey: string;
  templateName: string;
  matchType: "CORE" | "TRADE" | "REQUEST_TYPE";
  matchValue: string;
  active: boolean;
  retiredAt: string;
  items: RequestChecklistItem[];
  summary: Omit<RequestChecklistSummary, "readyForQuote">;
};

export type RequestAssignee = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  roleColor: string;
};

export const requestUpdateKinds = ["comment", "step", "system"] as const;
export type RequestUpdateKind = (typeof requestUpdateKinds)[number];

export const requestUpdateFilters = ["all", "comment", "step", "system"] as const;
export type RequestUpdateFilter = (typeof requestUpdateFilters)[number];

export const requestStepStatuses = ["open", "completed", "superseded"] as const;
export type RequestStepStatus = (typeof requestStepStatuses)[number];

export type RequestUpdateAuthor = {
  id: string | null;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  roleColor: string;
};

export type RequestUpdate = {
  id: string;
  requestId: string | null;
  quoteId: string | null;
  kind: RequestUpdateKind;
  title: string;
  body: string;
  author: RequestUpdateAuthor;
  assignee: RequestAssignee | null;
  targetDate: string;
  stepStatus: RequestStepStatus | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
  mentions: Array<{
    id: string;
    userId: string;
    userName: string;
    readAt: string;
  }>;
};

export type RequestUpdatePage = {
  updates: RequestUpdate[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type RequestRecord = {
  id: string;
  requestNumber: string;
  title: string;
  requestType: RequestType;
  source: RequestSource;
  serviceCategory: ServiceCategory;
  serviceCategories: ServiceCategory[];
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
  assignedToRole: string;
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
  lead: RequestAssignee | null;
  collaborators: RequestAssignee[];
  currentStep: RequestUpdate | null;
  unreadMentionCount: number;
  updates: RequestUpdate[];
  documents: LifecycleDocumentRecord[];
  activity: RequestActivity[];
  tasks: RequestTask[];
  checklistItems: RequestChecklistItem[];
  checklistInstances: RequestChecklistInstanceRecord[];
  checklistSummary: RequestChecklistSummary;
};

import { z } from "zod";
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const optionalDateText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

export const requestStatusSchema = z.enum(requestStatuses);
export const requestPrioritySchema = z.enum(requestPriorities);
export const requestTypeSchema = z.enum(requestTypes);
export const requestSourceSchema = z.enum(requestSources);
export const serviceCategorySchema = z.enum(serviceCategories);

const nullableIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const requestFormFieldsSchema = z.object({
  title: optionalText,
  requestType: requestTypeSchema.default("Quote Request"),
  source: requestSourceSchema.default("Call"),
  serviceCategory: serviceCategorySchema.optional(),
  serviceCategories: z.array(serviceCategorySchema).min(1, "Select at least one trade.").optional(),
  status: requestStatusSchema.default("Received"),
  priority: requestPrioritySchema.default("Normal"),
  companyName: optionalText,
  contactName: optionalText,
  contactEmail: optionalText,
  contactPhone: optionalText,
  siteName: optionalText,
  siteAddress: optionalText,
  city: optionalText,
  state: optionalText,
  clientId: nullableIdSchema,
  contactId: nullableIdSchema,
  siteId: nullableIdSchema,
  assignedToId: nullableIdSchema,
  receivedDate: optionalDateText,
  dueDate: optionalDateText,
  nextAction: optionalText,
  nextFollowUpAt: optionalDateText,
  missingInfo: optionalText,
  siteVisitNeeded: z.boolean().default(false),
  siteVisitCompleted: z.boolean().default(false),
  description: optionalText,
  internalNotes: optionalText,
  relatedQuoteId: nullableIdSchema,
  createdById: nullableIdSchema
});

export const createRequestSchema = requestFormFieldsSchema
  .superRefine((data, context) => {
    if (!data.companyName && !data.contactName) {
      context.addIssue({
        code: "custom",
        message: "Company name or contact name is required.",
        path: ["companyName"]
      });
    }
  })
  .transform((data) => ({
    ...data,
    serviceCategories: Array.from(new Set(data.serviceCategories ?? [data.serviceCategory ?? "Access Control"])),
    serviceCategory: (data.serviceCategories?.[0] ?? data.serviceCategory ?? "Access Control"),
    title:
      data.title ||
      data.companyName ||
      data.contactName ||
      `${data.serviceCategories?.[0] ?? data.serviceCategory ?? "Access Control"} request`
  }));

export const updateRequestSchema = requestFormFieldsSchema.partial().superRefine(
  (data, context) => {
    if (
      "companyName" in data &&
      "contactName" in data &&
      !data.companyName &&
      !data.contactName
    ) {
      context.addIssue({
        code: "custom",
        message: "Company name or contact name is required.",
        path: ["companyName"]
      });
    }
  }
);

const terminalRequestStatuses = ["No Bid", "Cancelled", "Duplicate"] as const;

export const changeRequestStatusSchema = z
  .object({
    status: requestStatusSchema,
    reason: optionalText
  })
  .superRefine((data, context) => {
    if (
      terminalRequestStatuses.includes(
        data.status as (typeof terminalRequestStatuses)[number]
      ) &&
      !data.reason
    ) {
      context.addIssue({
        code: "custom",
        message: "Add a reason before closing this request.",
        path: ["reason"]
      });
    }
  });

export const createRequestActivitySchema = z.object({
  type: z
    .enum(["Note", "Task", "Status", "Owner", "Follow-up", "Conversion"])
    .default("Note"),
  title: z.string().trim().min(1),
  body: optionalText,
  actor: optionalText.default("Pulse System")
});

export const createRequestTaskSchema = z.object({
  title: z.string().trim().min(1),
  dueAt: optionalDateText,
  owner: optionalText.default("Unassigned")
});

export const completeRequestTaskSchema = z.object({
  completed: z.boolean()
});

export const updateRequestChecklistItemSchema = z.object({
  completed: z.boolean().optional(),
  notes: optionalText
});

export const convertRequestSchema = z.object({
  createQuote: z.boolean().default(true)
});

export const requestUpdateFilterSchema = z.enum(requestUpdateFilters);

export const createRequestUpdateSchema = z
  .object({
    kind: z.enum(["comment", "step"]).default("comment"),
    title: optionalText,
    body: z.string().trim().min(1, "Write an update before posting."),
    assigneeId: nullableIdSchema,
    targetDate: optionalDateText,
    mentionIds: z.array(z.string().trim().min(1)).default([])
  })
  .superRefine((data, context) => {
    if (data.kind === "step" && !data.assigneeId) {
      context.addIssue({
        code: "custom",
        message: "Choose a responsible assignee for the current step.",
        path: ["assigneeId"]
      });
    }
  });

export const requestTeamLeadSchema = z.object({
  leadId: nullableIdSchema
});

export const requestCollaboratorSchema = z.object({
  userId: z.string().trim().min(1)
});

export const requestUpdateCompleteSchema = z.object({
  completed: z.boolean().default(true)
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type CreateRequestActivityInput = z.infer<typeof createRequestActivitySchema>;
export type CreateRequestTaskInput = z.infer<typeof createRequestTaskSchema>;
export type UpdateRequestChecklistItemInput = z.infer<typeof updateRequestChecklistItemSchema>;
export type ConvertRequestInput = z.infer<typeof convertRequestSchema>;
export type CreateRequestUpdateInput = z.infer<typeof createRequestUpdateSchema>;
export type RequestTeamLeadInput = z.infer<typeof requestTeamLeadSchema>;
export type RequestCollaboratorInput = z.infer<typeof requestCollaboratorSchema>;
export type RequestUpdateCompleteInput = z.infer<typeof requestUpdateCompleteSchema>;
