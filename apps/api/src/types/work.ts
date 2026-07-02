import type { LifecycleDocumentRecord } from "@/types/document";

export const quoteStatuses = [
  "Draft", "Review", "Sent", "Approved", "Rejected", "Expired", "Cancelled"
] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export const projectStatuses = [
  "Ready", "In Progress", "Field Work", "On Hold", "Completed", "Cancelled"
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const invoiceStatuses = ["Draft", "Review", "Sent", "Paid", "Overdue", "Void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export type QuoteRecord = {
  id: string; quoteNumber: string; title: string; clientId: string | null; clientName: string;
  status: QuoteStatus; owner: string; total: number; requestId: string | null; requestNumber: string;
  projectId: string | null; createdAt: string; updatedAt: string; documents: LifecycleDocumentRecord[];
};

export type ProjectRecord = {
  id: string; projectNumber: string; title: string; clientId: string; clientName: string;
  quoteId: string | null; quoteNumber: string; owner: string; status: ProjectStatus; budget: number;
  startDate: string; dueDate: string; invoiceCount: number; createdAt: string; updatedAt: string;
  documents: LifecycleDocumentRecord[];
};

export type InvoiceRecord = {
  id: string; invoiceNumber: string; title: string; clientId: string; clientName: string;
  projectId: string | null; projectNumber: string; owner: string; status: InvoiceStatus; amount: number;
  issuedDate: string; dueDate: string; createdAt: string; updatedAt: string;
};

export type ClientWorkSummary = {
  activeRequests: number; activeQuotes: number; activeProjects: number; outstandingInvoiceBalance: number;
};
