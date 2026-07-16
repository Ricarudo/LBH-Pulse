import type { LifecycleDocumentRecord } from "./documents";
import type { QuoteItemRecord } from "./items";
import type { ClientContact } from "./clients";
import {
  serviceCategories,
  type RequestAssignee,
  type RequestUpdate
} from "./requests";

export const quoteStatuses = [
  "Draft",
  "Review",
  "Sent",
  "Approved",
  "Rejected",
  "Expired",
  "Cancelled"
] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];
export const quoteCalculationModes = ["LEGACY", "PULSE"] as const;
export type QuoteCalculationMode = (typeof quoteCalculationModes)[number];
export type LifecyclePrecision = "EXACT" | "ESTIMATED";
export type LifecycleTab = "work" | "details" | "files" | "updates";

export type LegacyQuoteFinancials = {
  materialSale: number;
  materialCost: number;
  laborSale: number;
  laborCost: number;
  taxAmount: number;
  estimatedDurationBusinessDays: number | null;
};

export type QuoteFinancialSummary = {
  materialRevenue: number;
  laborRevenue: number;
  serviceRevenue: number;
  preTaxContractValue: number;
  taxAmount: number;
  finalCustomerTotal: number;
  materialCost: number;
  laborCost: number;
  serviceCost: number;
  totalEstimatedCost: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  markupPercent: number | null;
  estimatedDurationBusinessDays: number | null;
};

export type ProjectQuoteFinancialSnapshot = {
  sourceQuoteId: string;
  sourceQuoteNumber: string;
  sourceQuoteRevisionNumber: number;
  calculationMode: QuoteCalculationMode;
  financialSummary: QuoteFinancialSummary;
};

export type LifecycleContextSummary = {
  id: string;
  details: string;
  updatedAt: string;
  updatedBy: RequestAssignee | null;
  updatedByName: string;
};

export type LifecycleSiteSummary = {
  id: string;
  siteName: string;
  address: string;
  city: string;
  state: string;
};

export type LifecycleRelationshipWarning = {
  field: "client" | "contact" | "site" | "assignedTo";
  legacyValue: string;
  message: string;
};

export type QuoteVersionSummary = {
  id: string;
  revisionNumber: number;
  quoteNumber: string;
  outcome: QuoteStatus | "Revision Requested";
  priorStatus: QuoteStatus | "";
  title: string;
  owner: string;
  total: number;
  versionCreatedAt: string;
  sentAt: string;
  requestedAt: string;
  reason: string;
  precision: LifecyclePrecision;
  isCurrent: boolean;
  dataAvailable: boolean;
};

export const projectStatuses = [
  "Ready",
  "In Progress",
  "Field Work",
  "On Hold",
  "Completed",
  "Cancelled"
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const invoiceStatuses = [
  "Draft",
  "Review",
  "Sent",
  "Paid",
  "Overdue",
  "Void"
] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];

export type QuoteRecord = {
  id: string;
  quoteNumber: string;
  baseQuoteNumber: string;
  revisionNumber: number;
  versionCreatedAt: string;
  sentAt: string;
  sentAtPrecision: LifecyclePrecision | null;
  title: string;
  clientId: string | null;
  clientName: string;
  contactId: string | null;
  contact: ClientContact | null;
  siteId: string | null;
  site: LifecycleSiteSummary | null;
  assignedToId: string | null;
  assignedTo: RequestAssignee | null;
  status: QuoteStatus;
  /** Display-only compatibility value. Mutations use assignedToId. */
  owner: string;
  calculationMode: QuoteCalculationMode;
  total: number;
  legacyFinancials: LegacyQuoteFinancials;
  financialSummary: QuoteFinancialSummary;
  requestId: string | null;
  requestNumber: string;
  trades: string[];
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  documents: LifecycleDocumentRecord[];
  lifecycleContext: LifecycleContextSummary;
  relationshipWarnings: LifecycleRelationshipWarning[];
};

export type QuoteContextSnapshot = {
  sourceRequestId: string | null;
  requestNumber: string;
  requestTitle: string;
  requestType: string;
  serviceCategory: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  siteName: string;
  siteAddress: string;
  city: string;
  state: string;
  scopeDescription: string;
  internalNotes: string;
};

export type QuoteDetailRecord = QuoteRecord & {
  context: QuoteContextSnapshot;
  proposalNotes: string;
  proposalPreparedAt: string;
  items: QuoteItemRecord[];
  currentStep: RequestUpdate | null;
  unreadMentionCount: number;
  updates: RequestUpdate[];
  versions: QuoteVersionSummary[];
};

export type QuoteRevisionDetailRecord = {
  quoteId: string;
  baseQuoteNumber: string;
  clientId: string | null;
  clientName: string;
  revision: QuoteVersionSummary;
  contact: ClientContact | null;
  context: QuoteContextSnapshot;
  proposalNotes: string;
  proposalPreparedAt: string;
  calculationMode: QuoteCalculationMode;
  legacyFinancials: LegacyQuoteFinancials;
  financialSummary: QuoteFinancialSummary;
  items: QuoteItemRecord[];
};

export type ProjectRecord = {
  id: string;
  projectNumber: string;
  title: string;
  clientId: string;
  clientName: string;
  quoteId: string | null;
  quoteNumber: string;
  contactId: string | null;
  contact: ClientContact | null;
  siteId: string | null;
  site: LifecycleSiteSummary | null;
  assignedToId: string | null;
  assignedTo: RequestAssignee | null;
  status: ProjectStatus;
  budget: number;
  sourceQuoteRevisionNumber: number | null;
  sourceQuoteCalculationMode: QuoteCalculationMode | null;
  quoteFinancialSnapshot: ProjectQuoteFinancialSnapshot | null;
  startDate: string;
  dueDate: string;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
  documents: LifecycleDocumentRecord[];
  lifecycleContext: LifecycleContextSummary;
  relationshipWarnings: LifecycleRelationshipWarning[];
};

export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  title: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectNumber: string;
  contactId: string | null;
  contact: ClientContact | null;
  siteId: string | null;
  site: LifecycleSiteSummary | null;
  assignedToId: string | null;
  assignedTo: RequestAssignee | null;
  status: InvoiceStatus;
  amount: number;
  issuedDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  documents: LifecycleDocumentRecord[];
  lifecycleContext: LifecycleContextSummary;
  relationshipWarnings: LifecycleRelationshipWarning[];
};

export const projectTaskStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE"
] as const;

export type ProjectTaskStatus = (typeof projectTaskStatuses)[number];

export type ProjectTaskRecord = {
  id: string;
  projectId: string;
  title: string;
  status: ProjectTaskStatus;
  weight: number;
  assignedToId: string | null;
  assignedTo: RequestAssignee | null;
  dueDate: string;
  notes: string;
  sortOrder: number;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectProgress = {
  percent: number;
  completedWeight: number;
  totalWeight: number;
  completedTasks: number;
  totalTasks: number;
};

export type BillingMilestoneSummary = {
  invoiceId: string;
  invoiceNumber: string;
  title: string;
  status: InvoiceStatus;
  amount: number;
  issuedDate: string;
  dueDate: string;
  isCurrent: boolean;
};

export type BillingProjectSummary = {
  projectId: string | null;
  projectNumber: string;
  projectBudget: number;
  planned: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  remaining: number;
  milestones: BillingMilestoneSummary[];
};

export type WorkUpdateState = {
  currentStep: RequestUpdate | null;
  unreadMentionCount: number;
  updates: RequestUpdate[];
};

export type ProjectDetailRecord = ProjectRecord & WorkUpdateState & {
  tasks: ProjectTaskRecord[];
  progress: ProjectProgress;
};
export type InvoiceDetailRecord = InvoiceRecord & WorkUpdateState & {
  billingSummary: BillingProjectSummary;
};

export type ClientWorkSummary = {
  activeRequests: number;
  activeQuotes: number;
  activeProjects: number;
  outstandingInvoiceBalance: number;
  revisionRequests: number;
  revisedQuotes: number;
  revisionRate: number | null;
  averageRevisions: number | null;
};

export type QuoteResponse = { quote: QuoteDetailRecord };
export type QuotesResponse = { quotes: QuoteRecord[] };
export type ProjectResponse = { project: ProjectRecord };
export type ProjectDetailResponse = { project: ProjectDetailRecord };
export type InvoiceResponse = { invoice: InvoiceRecord };
export type InvoiceDetailResponse = { invoice: InvoiceDetailRecord };
export type ProjectTaskResponse = {
  task: ProjectTaskRecord;
  progress: ProjectProgress;
};
export type ProjectTasksResponse = {
  tasks: ProjectTaskRecord[];
  progress: ProjectProgress;
};
export type QuoteRevisionResponse = { revision: QuoteRevisionDetailRecord };

import { z } from "zod";

const id = z.string().trim().min(1);
const optionalId = z.string().trim().optional().transform((value) => value || undefined);
const assignedToId = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);
const optionalDate = z.string().trim().optional().transform((value) => value || undefined);
const money = z.coerce.number().min(0).max(9999999999);
const durationBusinessDays = z.coerce.number().int().min(0).max(100000).nullable();
const quoteTrades = z
  .array(z.enum(serviceCategories))
  .max(serviceCategories.length)
  .transform((values) => Array.from(new Set(values)));
const lifecycleDetails = z.string().trim().max(5000).optional();

export const createQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  contactId: id,
  siteId: assignedToId.default(null),
  assignedToId: assignedToId.default(null),
  lifecycleDetails,
  status: z.enum(quoteStatuses).default("Draft"),
  calculationMode: z.enum(quoteCalculationModes),
  trades: quoteTrades.optional(),
  owner: z.unknown().optional()
}).strict().transform(({ owner: _legacyOwner, ...quote }) => quote);

export const updateQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientId: id.optional(),
  contactId: assignedToId.optional(),
  siteId: assignedToId.optional(),
  assignedToId: assignedToId.optional(),
  lifecycleDetails,
  status: z.enum(quoteStatuses).optional(),
  trades: quoteTrades.optional()
}).strict();

export const replaceLegacyQuoteFinancialsSchema = z.object({
  materialSale: money,
  materialCost: money,
  laborSale: money,
  laborCost: money,
  taxAmount: money,
  estimatedDurationBusinessDays: durationBusinessDays.default(null)
}).strict();

export const switchQuoteCalculationModeSchema = z.object({
  calculationMode: z.enum(quoteCalculationModes),
  discardFinancialData: z.boolean().default(false)
}).strict();

export const createQuoteRevisionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Describe the changes requested by the client.")
    .max(2000, "Revision notes may contain up to 2,000 characters.")
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  quoteId: optionalId,
  contactId: assignedToId.default(null),
  siteId: assignedToId.default(null),
  assignedToId: assignedToId.default(null),
  lifecycleDetails,
  status: z.enum(projectStatuses).default("Ready"),
  budget: money.default(0),
  startDate: optionalDate,
  dueDate: optionalDate
});

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientId: id.optional(),
  quoteId: optionalId.optional(),
  contactId: assignedToId.optional(),
  siteId: assignedToId.optional(),
  assignedToId: assignedToId.optional(),
  lifecycleDetails,
  status: z.enum(projectStatuses).optional(),
  budget: money.optional(),
  startDate: optionalDate.optional(),
  dueDate: optionalDate.optional()
});

export const createInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  projectId: optionalId,
  contactId: assignedToId.default(null),
  siteId: assignedToId.default(null),
  assignedToId: assignedToId.default(null),
  lifecycleDetails,
  status: z.enum(invoiceStatuses).default("Draft"),
  amount: money.default(0),
  issuedDate: optionalDate,
  dueDate: optionalDate
});

export const updateInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientId: id.optional(),
  projectId: optionalId.optional(),
  contactId: assignedToId.optional(),
  siteId: assignedToId.optional(),
  assignedToId: assignedToId.optional(),
  lifecycleDetails,
  status: z.enum(invoiceStatuses).optional(),
  amount: money.optional(),
  issuedDate: optionalDate.optional(),
  dueDate: optionalDate.optional()
});

export const convertQuoteSchema = z.object({
  startDate: optionalDate,
  dueDate: optionalDate
});

export const createProjectInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  assignedToId: assignedToId.optional(),
  amount: money.optional(),
  issuedDate: optionalDate,
  dueDate: optionalDate
});

export const createProjectTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(projectTaskStatuses).default("NOT_STARTED"),
  weight: z.coerce.number().int().min(1).max(1000).default(1),
  assignedToId: assignedToId.default(null),
  dueDate: optionalDate,
  notes: z.string().trim().max(5000).optional()
});

export const updateProjectTaskSchema = createProjectTaskSchema.partial();

export const reorderProjectTasksSchema = z.object({
  taskIds: z.array(id).min(1).max(500).refine(
    (values) => new Set(values).size === values.length,
    "Task order contains duplicate IDs."
  )
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type ReplaceLegacyQuoteFinancialsInput = z.infer<typeof replaceLegacyQuoteFinancialsSchema>;
export type SwitchQuoteCalculationModeInput = z.infer<typeof switchQuoteCalculationModeSchema>;
export type CreateQuoteRevisionInput = z.infer<typeof createQuoteRevisionSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>;
export type CreateProjectInvoiceInput = z.infer<typeof createProjectInvoiceSchema>;
export type CreateProjectTaskInput = z.infer<typeof createProjectTaskSchema>;
export type UpdateProjectTaskInput = z.infer<typeof updateProjectTaskSchema>;
export type ReorderProjectTasksInput = z.infer<typeof reorderProjectTasksSchema>;
