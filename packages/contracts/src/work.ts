import type { LifecycleDocumentRecord } from "./documents";
import type { QuoteItemRecord } from "./items";

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
  title: string;
  clientId: string | null;
  clientName: string;
  status: QuoteStatus;
  owner: string;
  total: number;
  requestId: string | null;
  requestNumber: string;
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
};

export type ProjectRecord = {
  id: string;
  projectNumber: string;
  title: string;
  clientId: string;
  clientName: string;
  quoteId: string | null;
  quoteNumber: string;
  owner: string;
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
  owner: string;
  status: InvoiceStatus;
  amount: number;
  issuedDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientWorkSummary = {
  activeRequests: number;
  activeQuotes: number;
  activeProjects: number;
  outstandingInvoiceBalance: number;
};

export type QuoteResponse = { quote: QuoteDetailRecord };
export type QuotesResponse = { quotes: QuoteRecord[] };
export type ProjectResponse = { project: ProjectRecord };

import { z } from "zod";

const id = z.string().trim().min(1);
const optionalId = z.string().trim().optional().transform((value) => value || undefined);
const optionalDate = z.string().trim().optional().transform((value) => value || undefined);
const money = z.coerce.number().min(0).max(9999999999);

export const createQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: optionalId,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(quoteStatuses).default("Draft"),
  total: money.default(0)
});

export const updateQuoteSchema = createQuoteSchema.partial();

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  quoteId: optionalId,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(projectStatuses).default("Ready"),
  budget: money.default(0),
  startDate: optionalDate,
  dueDate: optionalDate
});

export const updateProjectSchema = createProjectSchema.partial();

export const createInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: id,
  projectId: optionalId,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(invoiceStatuses).default("Draft"),
  amount: money.default(0),
  issuedDate: optionalDate,
  dueDate: optionalDate
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

export const convertQuoteSchema = z.object({
  startDate: optionalDate,
  dueDate: optionalDate
});

export const createProjectInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  owner: z.string().trim().max(120).optional(),
  amount: money.optional(),
  issuedDate: optionalDate,
  dueDate: optionalDate
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>;
export type CreateProjectInvoiceInput = z.infer<typeof createProjectInvoiceSchema>;
