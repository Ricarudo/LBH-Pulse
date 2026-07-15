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
export type LifecyclePrecision = "EXACT" | "ESTIMATED";

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
  status: QuoteStatus;
  owner: string;
  total: number;
  requestId: string | null;
  requestNumber: string;
  trades: string[];
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  documents: LifecycleDocumentRecord[];
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
  assignedToId: string | null;
  assignedTo: RequestAssignee | null;
  status: ProjectStatus;
  budget: number;
  startDate: string;
  dueDate: string;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
  documents: LifecycleDocumentRecord[];
};

export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  title: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectNumber: string;
  assignedToId: string | null;
  assignedTo: RequestAssignee | null;
  status: InvoiceStatus;
  amount: number;
  issuedDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  documents: LifecycleDocumentRecord[];
};

export type WorkUpdateState = {
  currentStep: RequestUpdate | null;
  unreadMentionCount: number;
  updates: RequestUpdate[];
};

export type ProjectDetailRecord = ProjectRecord & WorkUpdateState;
export type InvoiceDetailRecord = InvoiceRecord & WorkUpdateState;

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
const quoteTrades = z
  .array(z.enum(serviceCategories))
  .max(serviceCategories.length)
  .transform((values) => Array.from(new Set(values)));

export const createQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  contactId: id,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(quoteStatuses).default("Draft"),
  total: money.default(0),
  trades: quoteTrades.optional()
});

export const updateQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientId: id.optional(),
  contactId: id.optional(),
  owner: z.string().trim().max(120).optional(),
  status: z.enum(quoteStatuses).optional(),
  total: money.optional(),
  trades: quoteTrades.optional()
});

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
  assignedToId: assignedToId.default(null),
  status: z.enum(projectStatuses).default("Ready"),
  budget: money.default(0),
  startDate: optionalDate,
  dueDate: optionalDate
});

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientId: id.optional(),
  quoteId: optionalId.optional(),
  assignedToId: assignedToId.optional(),
  status: z.enum(projectStatuses).optional(),
  budget: money.optional(),
  startDate: optionalDate.optional(),
  dueDate: optionalDate.optional()
});

export const createInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  projectId: optionalId,
  assignedToId: assignedToId.default(null),
  status: z.enum(invoiceStatuses).default("Draft"),
  amount: money.default(0),
  issuedDate: optionalDate,
  dueDate: optionalDate
});

export const updateInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientId: id.optional(),
  projectId: optionalId.optional(),
  assignedToId: assignedToId.optional(),
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

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateQuoteRevisionInput = z.infer<typeof createQuoteRevisionSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>;
export type CreateProjectInvoiceInput = z.infer<typeof createProjectInvoiceSchema>;
