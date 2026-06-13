import { z } from "zod";
import { invoiceStatuses, projectStatuses, quoteStatuses } from "@/types/work";

const id = z.string().trim().min(1);
const optionalId = z.string().trim().optional().transform((value) => value || undefined);
const optionalDate = z.string().trim().optional().transform((value) => value || undefined);
const money = z.coerce.number().min(0).max(9999999999);

export const createQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200), clientId: optionalId,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(quoteStatuses).default("Draft"), total: money.default(0)
});
export const updateQuoteSchema = createQuoteSchema.partial();

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200), clientId: id, quoteId: optionalId,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(projectStatuses).default("Ready"), budget: money.default(0),
  startDate: optionalDate, dueDate: optionalDate
});
export const updateProjectSchema = createProjectSchema.partial();

export const createInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200), clientId: id, projectId: optionalId,
  owner: z.string().trim().max(120).default("Unassigned"),
  status: z.enum(invoiceStatuses).default("Draft"), amount: money.default(0),
  issuedDate: optionalDate, dueDate: optionalDate
});
export const updateInvoiceSchema = createInvoiceSchema.partial();
export const convertQuoteSchema = z.object({ startDate: optionalDate, dueDate: optionalDate });
export const createProjectInvoiceSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  owner: z.string().trim().max(120).optional(), amount: money.optional(),
  issuedDate: optionalDate, dueDate: optionalDate
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>;
export type CreateProjectInvoiceInput = z.infer<typeof createProjectInvoiceSchema>;
